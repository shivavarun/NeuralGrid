/**
 * Job submission endpoint — POST /v1/jobs
 * Orchestrates: validate → estimate → budget check → prices → dispatch
 */

import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import {
  ErrorCode,
  ERROR_HTTP_STATUS,
  createErrorResponse,
} from '@neuralgrid/shared';
import type {
  EstimateResponse,
  JobStatusResponse,
  JobResult,
  JobOutput,
  PriceResponse,
  ProviderNode,
  Tier,
} from '@neuralgrid/shared';
import {
  IDEMPOTENCY_HEADER,
  validateIdempotencyKey,
  hashRequestBody,
  resolveExisting,
  createDefaultIdempotencyDeps,
  IdempotencyDeps,
  CachedResponse,
} from '../middleware/idempotency';

// --- Config ---

const COMPUTE_ESTIMATOR_URL = process.env.COMPUTE_ESTIMATOR_URL || 'http://localhost:8001';
const PRICE_AGGREGATOR_URL = process.env.PRICE_AGGREGATOR_URL || 'http://localhost:8003';
const JOB_SCHEDULER_URL = process.env.JOB_SCHEDULER_URL || 'http://localhost:8002';

// --- Job Ownership Store (MVP in-memory) ---

export interface JobOwnership {
  job_id: string;
  developer_id: string;
  tier: string;
  estimated_cost_usd: string;
  output_type: 'text' | 'image';
  created_at: string;
}

/** In-memory store mapping job_id → ownership info */
export const jobOwnershipStore = new Map<string, JobOwnership>();

// --- Developer lookup abstraction ---

export interface DeveloperRecord {
  id: string;
  max_cost_usd: number;
  payment_status: 'active' | 'failed';
}

export type GetDeveloper = (developerId: string) => Promise<DeveloperRecord | null>;

/**
 * Default developer lookup — for MVP returns a mock developer.
 * In production, this queries PostgreSQL.
 */
export const defaultGetDeveloper: GetDeveloper = async (developerId: string) => {
  return {
    id: developerId,
    max_cost_usd: 10.0,
    payment_status: 'active',
  };
};

// --- HTTP client abstraction (for testing) ---

export interface HttpClient {
  post(url: string, body: unknown): Promise<{ status: number; data: unknown }>;
  get(url: string): Promise<{ status: number; data: unknown }>;
}

/**
 * Default HTTP client using global fetch.
 */
export const defaultHttpClient: HttpClient = {
  async post(url: string, body: unknown) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return { status: resp.status, data };
  },
  async get(url: string) {
    const resp = await fetch(url);
    const data = await resp.json();
    return { status: resp.status, data };
  },
};

// --- Job ID generation ---

export function generateJobId(): string {
  const hex = randomBytes(12).toString('hex');
  return `job_${hex}`;
}

// --- Router factory ---

export interface JobsRouterDeps {
  getDeveloper?: GetDeveloper;
  httpClient?: HttpClient;
  idempotency?: IdempotencyDeps;
}

export function createJobsRouter(deps: JobsRouterDeps = {}): Router {
  const getDeveloper = deps.getDeveloper || defaultGetDeveloper;
  const http = deps.httpClient || defaultHttpClient;
  const idempotency = deps.idempotency || createDefaultIdempotencyDeps();

  const router = Router();

  router.post('/v1/jobs', async (req: Request, res: Response): Promise<void> => {
    try {
      const developerId = (req as any).developerId as string | undefined;
      if (!developerId) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED]).json(
          createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required')
        );
        return;
      }

      // 0a. Validate Idempotency-Key header (Req 2.1, 2.2)
      const keyCheck = validateIdempotencyKey(req.header(IDEMPOTENCY_HEADER));
      if (!keyCheck.valid) {
        res.status(ERROR_HTTP_STATUS[keyCheck.code]).json(
          createErrorResponse(keyCheck.code, keyCheck.message)
        );
        return;
      }
      const idempotencyKey = keyCheck.key;
      const requestHash = hashRequestBody(req.body);

      // 0b. Resolve any existing association for this (developer, key) (Req 2.4-2.7)
      const existing = await idempotency.store.get(developerId, idempotencyKey);
      if (existing) {
        respondToOutcome(res, resolveExisting(existing, requestHash));
        return;
      }

      // 0c. New key: take the in-progress lock. If a concurrent first-time
      // submission holds it, this request is in progress (Req 2.6).
      const acquired = await idempotency.lock.acquire(developerId, idempotencyKey);
      if (!acquired) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.IDEMPOTENCY_IN_PROGRESS]).json(
          createErrorResponse(
            ErrorCode.IDEMPOTENCY_IN_PROGRESS,
            'A request with this Idempotency-Key is already in progress'
          )
        );
        return;
      }

      try {
        await createJob(req, res, {
          developerId,
          idempotencyKey,
          requestHash,
        });
      } finally {
        await idempotency.lock.release(developerId, idempotencyKey);
      }
    } catch (err) {
      res.status(500).json(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error')
      );
    }
  });

  /** Translate a resolved idempotency outcome into an HTTP response. */
  function respondToOutcome(
    res: Response,
    outcome: ReturnType<typeof resolveExisting>
  ): void {
    if (outcome.kind === 'replay') {
      res.status(outcome.response.statusCode).json(outcome.response.body);
      return;
    }
    if (outcome.kind === 'conflict') {
      res.status(ERROR_HTTP_STATUS[ErrorCode.IDEMPOTENCY_CONFLICT]).json(
        createErrorResponse(
          ErrorCode.IDEMPOTENCY_CONFLICT,
          'Idempotency-Key was already used with a different request body'
        )
      );
      return;
    }
    // in_progress
    res.status(ERROR_HTTP_STATUS[ErrorCode.IDEMPOTENCY_IN_PROGRESS]).json(
      createErrorResponse(
        ErrorCode.IDEMPOTENCY_IN_PROGRESS,
        'A request with this Idempotency-Key is already in progress'
      )
    );
  }

  interface CreateJobContext {
    developerId: string;
    idempotencyKey: string;
    requestHash: string;
  }

  /** Full create-job flow for a previously-unseen idempotency key (Req 2.3). */
  async function createJob(
    req: Request,
    res: Response,
    ctx: CreateJobContext
  ): Promise<void> {
    try {
      const { developerId, idempotencyKey, requestHash } = ctx;

      // 1. Get developer info
      const developer = await getDeveloper(developerId);
      if (!developer) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED]).json(
          createErrorResponse(ErrorCode.UNAUTHORIZED, 'Developer not found')
        );
        return;
      }

      // 2. Check payment status
      if (developer.payment_status === 'failed') {
        res.status(ERROR_HTTP_STATUS[ErrorCode.PAYMENT_FAILED]).json(
          createErrorResponse(ErrorCode.PAYMENT_FAILED, 'Payment method has failed. Please update your payment information.')
        );
        return;
      }

      const { model, input, output, quantization } = req.body;

      // 3. Call Compute_Estimator
      const estimateResp = await http.post(`${COMPUTE_ESTIMATOR_URL}/internal/estimate`, {
        model,
        quantization,
        input_tokens: input.content?.length || 0,
        max_tokens: output.max_tokens,
      });

      if (estimateResp.status !== 200) {
        res.status(500).json(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to get compute estimate')
        );
        return;
      }

      const estimate = estimateResp.data as EstimateResponse;

      // 4. Check budget
      const estimatedCost = parseFloat(estimate.estimated_cost_usd);
      if (estimatedCost > developer.max_cost_usd) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.BUDGET_EXCEEDED]).json(
          createErrorResponse(ErrorCode.BUDGET_EXCEEDED, 'Estimated cost exceeds your budget limit', {
            estimated_cost_usd: estimate.estimated_cost_usd,
            max_cost_usd: developer.max_cost_usd,
          })
        );
        return;
      }

      // 5. Get prices for tier
      const priceResp = await http.get(`${PRICE_AGGREGATOR_URL}/internal/prices/${estimate.tier}`);

      if (priceResp.status !== 200) {
        res.status(500).json(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to get pricing information')
        );
        return;
      }

      const priceData = priceResp.data as PriceResponse;

      // 6. Select cheapest available node
      const availableNodes = priceData.nodes.filter((n: ProviderNode) => n.availability);
      if (availableNodes.length === 0) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.INSUFFICIENT_CAPACITY]).json(
          createErrorResponse(ErrorCode.INSUFFICIENT_CAPACITY, 'No provider nodes available at the required tier', {
            tier: estimate.tier,
          })
        );
        return;
      }

      const cheapestNode = availableNodes.reduce((min: ProviderNode, n: ProviderNode) =>
        n.hourly_rate_usd < min.hourly_rate_usd ? n : min
      );

      // 7. Generate job ID
      const jobId = generateJobId();

      // 8. Dispatch to Job_Scheduler
      const dispatchResp = await http.post(`${JOB_SCHEDULER_URL}/internal/dispatch`, {
        job_id: jobId,
        model,
        tier: estimate.tier,
        input,
        output,
        quantization: quantization || 'fp16',
        selected_node: cheapestNode,
      });

      if (dispatchResp.status !== 200 && dispatchResp.status !== 202) {
        res.status(500).json(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to dispatch job')
        );
        return;
      }

      // 9. Store job ownership
      jobOwnershipStore.set(jobId, {
        job_id: jobId,
        developer_id: developerId,
        tier: estimate.tier,
        estimated_cost_usd: estimate.estimated_cost_usd,
        output_type: output.type || 'text',
        created_at: new Date().toISOString(),
      });

      // 10. Build the accepted response and cache it for idempotent replay.
      const acceptedBody = {
        job_id: jobId,
        status: 'queued' as const,
        tier: estimate.tier,
        estimated_cost_usd: estimate.estimated_cost_usd,
        poll_url: `/v1/jobs/${jobId}`,
      };
      const snapshot: CachedResponse = { statusCode: 202, body: acceptedBody };

      // 11. Persist the association. UNIQUE(developer_id, idempotency_key) is
      // the race arbiter: a violation means a concurrent request already
      // created the job for this key, so resolve it as an existing-key match.
      const insertResult = await idempotency.store.insert({
        developer_id: developerId,
        idempotency_key: idempotencyKey,
        job_id: jobId,
        request_hash: requestHash,
        response_snapshot: snapshot,
        status: 'queued',
        created_at: new Date().toISOString(),
      });

      if (!insertResult.inserted) {
        respondToOutcome(res, resolveExisting(insertResult.existing, requestHash));
        return;
      }

      // 12. Return 202 Accepted (Req 2.3)
      res.status(202).json(acceptedBody);
    } catch (err) {
      res.status(500).json(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error')
      );
    }
  }

  // --- GET /v1/jobs/:id — Job status polling ---

  router.get('/v1/jobs/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const developerId = (req as any).developerId as string | undefined;
      if (!developerId) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED]).json(
          createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required')
        );
        return;
      }

      const jobId = req.params.id as string;

      // Check ownership store
      const ownership = jobOwnershipStore.get(jobId);
      if (!ownership) {
        // Job doesn't exist in our store
        res.status(ERROR_HTTP_STATUS[ErrorCode.JOB_NOT_FOUND]).json(
          createErrorResponse(ErrorCode.JOB_NOT_FOUND, 'Job not found')
        );
        return;
      }

      // Enforce isolation: 404 if job belongs to different developer
      if (ownership.developer_id !== developerId) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.JOB_NOT_FOUND]).json(
          createErrorResponse(ErrorCode.JOB_NOT_FOUND, 'Job not found')
        );
        return;
      }

      // Fetch current status from Job_Scheduler
      const statusResp = await http.get(`${JOB_SCHEDULER_URL}/internal/job/${jobId}`);

      if (statusResp.status !== 200) {
        // Fallback: return what we know from ownership store
        res.status(200).json({
          job_id: jobId,
          status: 'queued',
          tier: ownership.tier,
          provider: null,
          estimated_cost_usd: ownership.estimated_cost_usd,
          created_at: ownership.created_at,
          started_at: null,
          completed_at: null,
        });
        return;
      }

      const jobStatus = statusResp.data as JobStatusResponse;

      res.status(200).json({
        job_id: jobId,
        status: jobStatus.status,
        tier: ownership.tier,
        provider: jobStatus.provider || null,
        estimated_cost_usd: ownership.estimated_cost_usd,
        created_at: ownership.created_at,
        started_at: null,
        completed_at: jobStatus.status === 'complete' || jobStatus.status === 'failed'
          ? new Date().toISOString()
          : null,
      });
    } catch (err) {
      res.status(500).json(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error')
      );
    }
  });

  // --- GET /v1/jobs/:id/result — Get job result ---

  router.get('/v1/jobs/:id/result', async (req: Request, res: Response): Promise<void> => {
    try {
      const developerId = (req as any).developerId as string | undefined;
      if (!developerId) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED]).json(
          createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required')
        );
        return;
      }

      const jobId = req.params.id as string;

      // Check ownership
      const ownership = jobOwnershipStore.get(jobId);
      if (!ownership) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.JOB_NOT_FOUND]).json(
          createErrorResponse(ErrorCode.JOB_NOT_FOUND, 'Job not found')
        );
        return;
      }

      // Enforce isolation
      if (ownership.developer_id !== developerId) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.JOB_NOT_FOUND]).json(
          createErrorResponse(ErrorCode.JOB_NOT_FOUND, 'Job not found')
        );
        return;
      }

      // Fetch job status from scheduler
      const statusResp = await http.get(`${JOB_SCHEDULER_URL}/internal/job/${jobId}`);

      if (statusResp.status !== 200) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.JOB_NOT_FOUND]).json(
          createErrorResponse(ErrorCode.JOB_NOT_FOUND, 'Job not found')
        );
        return;
      }

      const jobStatus = statusResp.data as JobStatusResponse;

      // Must be complete to get result
      if (jobStatus.status !== 'complete') {
        res.status(ERROR_HTTP_STATUS[ErrorCode.JOB_NOT_COMPLETE]).json(
          createErrorResponse(ErrorCode.JOB_NOT_COMPLETE, 'Job is not complete yet', {
            current_status: jobStatus.status,
          })
        );
        return;
      }

      // Shape result by output type
      const result = jobStatus.result as JobResult;
      if (ownership.output_type === 'image') {
        res.status(200).json({
          job_id: jobId,
          output_type: 'image',
          result: {
            image_urls: result?.image_urls || [],
            expires_at: result?.expires_at || null,
            width: result?.width || null,
            height: result?.height || null,
          },
        });
      } else {
        res.status(200).json({
          job_id: jobId,
          output_type: 'text',
          result: {
            content: result?.content || '',
            tokens_generated: result?.tokens_generated || 0,
            model: result?.model || '',
            finish_reason: result?.finish_reason || 'stop',
          },
        });
      }
    } catch (err) {
      res.status(500).json(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error')
      );
    }
  });

  return router;
}
