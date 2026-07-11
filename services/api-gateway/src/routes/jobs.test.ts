import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createJobsRouter,
  DeveloperRecord,
  HttpClient,
  generateJobId,
  jobOwnershipStore,
} from './jobs';

// --- Helpers ---

function makeApp(deps: {
  developer?: DeveloperRecord | null;
  httpClient?: Partial<HttpClient>;
  developerId?: string;
}) {
  const app = express();
  app.use(express.json());

  // Simulate auth middleware attaching developerId
  app.use((req, _res, next) => {
    (req as any).developerId = deps.developerId ?? 'dev_123';
    next();
  });

  const getDeveloper = vi.fn().mockResolvedValue(deps.developer ?? {
    id: 'dev_123',
    max_cost_usd: 10.0,
    payment_status: 'active',
  });

  const defaultHttp: HttpClient = {
    post: vi.fn().mockResolvedValue({ status: 200, data: {} }),
    get: vi.fn().mockResolvedValue({ status: 200, data: { nodes: [], cached: false, cache_age_seconds: 0 } }),
  };

  const httpClient: HttpClient = {
    post: (deps.httpClient?.post as any) || defaultHttp.post,
    get: (deps.httpClient?.get as any) || defaultHttp.get,
  };

  const router = createJobsRouter({ getDeveloper, httpClient });
  app.use(router);

  return { app, getDeveloper, httpClient };
}

const validBody = {
  model: 'llama-3-8b',
  input: { type: 'text', content: 'Hello world' },
  output: { type: 'text', max_tokens: 100 },
};

const mockEstimate = {
  tier: 'T1',
  min_vram_gb: 10,
  estimated_runtime_seconds: 30,
  estimated_cost_usd: '0.50',
  confidence: 'HIGH',
};

const mockPriceResponse = {
  nodes: [
    { provider: 'vastai', node_id: 'v1', gpu_model: 'RTX 3090', vram_gb: 24, hourly_rate_usd: 0.3, availability: true },
    { provider: 'runpod', node_id: 'r1', gpu_model: 'RTX 4090', vram_gb: 24, hourly_rate_usd: 0.5, availability: true },
  ],
  cached: false,
  cache_age_seconds: 0,
};

describe('POST /v1/jobs', () => {
  it('returns 202 with job info on successful submission', async () => {
    const httpPost = vi.fn()
      .mockResolvedValueOnce({ status: 200, data: mockEstimate }) // estimate
      .mockResolvedValueOnce({ status: 202, data: {} }); // dispatch

    const httpGet = vi.fn()
      .mockResolvedValueOnce({ status: 200, data: mockPriceResponse }); // prices

    const { app } = makeApp({ httpClient: { post: httpPost, get: httpGet } });

    const res = await request(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('queued');
    expect(res.body.tier).toBe('T1');
    expect(res.body.estimated_cost_usd).toBe('0.50');
    expect(res.body.job_id).toMatch(/^job_/);
    expect(res.body.poll_url).toMatch(/^\/v1\/jobs\/job_/);
  });

  it('returns 400 BUDGET_EXCEEDED when cost exceeds max_cost_usd', async () => {
    const httpPost = vi.fn()
      .mockResolvedValueOnce({ status: 200, data: { ...mockEstimate, estimated_cost_usd: '15.00' } });

    const { app } = makeApp({
      developer: { id: 'dev_123', max_cost_usd: 10.0, payment_status: 'active' },
      httpClient: { post: httpPost },
    });

    const res = await request(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BUDGET_EXCEEDED');
  });

  it('returns 402 PAYMENT_FAILED when payment_status is failed', async () => {
    const { app } = makeApp({
      developer: { id: 'dev_123', max_cost_usd: 10.0, payment_status: 'failed' },
    });

    const res = await request(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PAYMENT_FAILED');
  });

  it('returns 503 INSUFFICIENT_CAPACITY when no nodes available', async () => {
    const httpPost = vi.fn()
      .mockResolvedValueOnce({ status: 200, data: mockEstimate });

    const httpGet = vi.fn()
      .mockResolvedValueOnce({ status: 200, data: { nodes: [], cached: false, cache_age_seconds: 0 } });

    const { app } = makeApp({ httpClient: { post: httpPost, get: httpGet } });

    const res = await request(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('INSUFFICIENT_CAPACITY');
  });

  it('returns 503 when all nodes have availability: false', async () => {
    const httpPost = vi.fn()
      .mockResolvedValueOnce({ status: 200, data: mockEstimate });

    const httpGet = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        data: {
          nodes: [
            { provider: 'vastai', node_id: 'v1', gpu_model: 'RTX 3090', vram_gb: 24, hourly_rate_usd: 0.3, availability: false },
          ],
          cached: false,
          cache_age_seconds: 0,
        },
      });

    const { app } = makeApp({ httpClient: { post: httpPost, get: httpGet } });

    const res = await request(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('INSUFFICIENT_CAPACITY');
  });

  it('selects cheapest node and passes to dispatcher', async () => {
    const httpPost = vi.fn()
      .mockResolvedValueOnce({ status: 200, data: mockEstimate })
      .mockResolvedValueOnce({ status: 202, data: {} });

    const httpGet = vi.fn()
      .mockResolvedValueOnce({ status: 200, data: mockPriceResponse });

    const { app } = makeApp({ httpClient: { post: httpPost, get: httpGet } });

    await request(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);

    // Dispatch call is the second post call
    const dispatchCall = httpPost.mock.calls[1];
    expect(dispatchCall[1].selected_node.provider).toBe('vastai');
    expect(dispatchCall[1].selected_node.hourly_rate_usd).toBe(0.3);
  });

  it('returns 500 when estimate service fails', async () => {
    const httpPost = vi.fn()
      .mockResolvedValueOnce({ status: 500, data: { error: 'internal' } });

    const { app } = makeApp({ httpClient: { post: httpPost } });

    const res = await request(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 401 when no developerId present', async () => {
    const app = express();
    app.use(express.json());
    // No auth middleware - developerId not set
    const router = createJobsRouter();
    app.use(router);

    const res = await request(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('generateJobId', () => {
  it('produces IDs with job_ prefix', () => {
    const id = generateJobId();
    expect(id).toMatch(/^job_[a-f0-9]{24}$/);
  });

  it('produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateJobId()));
    expect(ids.size).toBe(100);
  });
});


describe('GET /v1/jobs/:id', () => {
  beforeEach(() => {
    jobOwnershipStore.clear();
  });

  function makeGetApp(deps: {
    httpClient?: Partial<HttpClient>;
    developerId?: string;
  } = {}) {
    const app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      (req as any).developerId = deps.developerId ?? 'dev_123';
      next();
    });

    const defaultHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({ status: 200, data: {} }),
      get: vi.fn().mockResolvedValue({ status: 200, data: {} }),
    };

    const httpClient: HttpClient = {
      post: (deps.httpClient?.post as any) || defaultHttp.post,
      get: (deps.httpClient?.get as any) || defaultHttp.get,
    };

    const router = createJobsRouter({ httpClient });
    app.use(router);

    return { app, httpClient };
  }

  it('returns job status for owned job', async () => {
    const jobId = 'job_abc123def456abc123def456';
    jobOwnershipStore.set(jobId, {
      job_id: jobId,
      developer_id: 'dev_123',
      tier: 'T1',
      estimated_cost_usd: '0.50',
      output_type: 'text',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const httpGet = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        job_id: jobId,
        status: 'running',
        provider: 'vastai',
        actual_cost_usd: null,
        result: null,
        retries: 0,
      },
    });

    const { app } = makeGetApp({ httpClient: { get: httpGet } });

    const res = await request(app).get(`/v1/jobs/${jobId}`);

    expect(res.status).toBe(200);
    expect(res.body.job_id).toBe(jobId);
    expect(res.body.status).toBe('running');
    expect(res.body.tier).toBe('T1');
    expect(res.body.provider).toBe('vastai');
    expect(res.body.estimated_cost_usd).toBe('0.50');
    expect(res.body.created_at).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns 404 for non-existent job', async () => {
    const { app } = makeGetApp();

    const res = await request(app).get('/v1/jobs/job_doesnotexist000000000000');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });

  it('returns 404 for job belonging to different developer (isolation)', async () => {
    const jobId = 'job_abc123def456abc123def456';
    jobOwnershipStore.set(jobId, {
      job_id: jobId,
      developer_id: 'dev_other',
      tier: 'T2',
      estimated_cost_usd: '2.00',
      output_type: 'text',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const { app } = makeGetApp({ developerId: 'dev_123' });

    const res = await request(app).get(`/v1/jobs/${jobId}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
    // Should not leak any job data
    expect(res.body.error.message).toBe('Job not found');
  });

  it('returns fallback status when Job_Scheduler is unreachable', async () => {
    const jobId = 'job_abc123def456abc123def456';
    jobOwnershipStore.set(jobId, {
      job_id: jobId,
      developer_id: 'dev_123',
      tier: 'T1',
      estimated_cost_usd: '0.50',
      output_type: 'text',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const httpGet = vi.fn().mockResolvedValue({ status: 500, data: {} });

    const { app } = makeGetApp({ httpClient: { get: httpGet } });

    const res = await request(app).get(`/v1/jobs/${jobId}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('queued');
    expect(res.body.tier).toBe('T1');
    expect(res.body.provider).toBeNull();
  });

  it('returns 401 when no developerId present', async () => {
    const app = express();
    app.use(express.json());
    const router = createJobsRouter();
    app.use(router);

    const res = await request(app).get('/v1/jobs/job_somevalidid00000000000');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /v1/jobs/:id/result', () => {
  beforeEach(() => {
    jobOwnershipStore.clear();
  });

  function makeResultApp(deps: {
    httpClient?: Partial<HttpClient>;
    developerId?: string;
  } = {}) {
    const app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      (req as any).developerId = deps.developerId ?? 'dev_123';
      next();
    });

    const defaultHttp: HttpClient = {
      post: vi.fn().mockResolvedValue({ status: 200, data: {} }),
      get: vi.fn().mockResolvedValue({ status: 200, data: {} }),
    };

    const httpClient: HttpClient = {
      post: (deps.httpClient?.post as any) || defaultHttp.post,
      get: (deps.httpClient?.get as any) || defaultHttp.get,
    };

    const router = createJobsRouter({ httpClient });
    app.use(router);

    return { app, httpClient };
  }

  it('returns 200 with text result for complete text job', async () => {
    const jobId = 'job_text123456789012345678';
    jobOwnershipStore.set(jobId, {
      job_id: jobId,
      developer_id: 'dev_123',
      tier: 'T1',
      estimated_cost_usd: '0.50',
      output_type: 'text',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const httpGet = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        job_id: jobId,
        status: 'complete',
        provider: 'vastai',
        actual_cost_usd: '0.42',
        result: {
          content: 'Hello, world!',
          tokens_generated: 5,
          model: 'llama-3-8b',
          finish_reason: 'stop',
        },
        retries: 0,
      },
    });

    const { app } = makeResultApp({ httpClient: { get: httpGet } });

    const res = await request(app).get(`/v1/jobs/${jobId}/result`);

    expect(res.status).toBe(200);
    expect(res.body.job_id).toBe(jobId);
    expect(res.body.output_type).toBe('text');
    expect(res.body.result.content).toBe('Hello, world!');
    expect(res.body.result.tokens_generated).toBe(5);
    expect(res.body.result.model).toBe('llama-3-8b');
    expect(res.body.result.finish_reason).toBe('stop');
  });

  it('returns 200 with image result for complete image job', async () => {
    const jobId = 'job_img1234567890123456789';
    jobOwnershipStore.set(jobId, {
      job_id: jobId,
      developer_id: 'dev_123',
      tier: 'T2',
      estimated_cost_usd: '1.20',
      output_type: 'image',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const httpGet = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        job_id: jobId,
        status: 'complete',
        provider: 'runpod',
        actual_cost_usd: '1.10',
        result: {
          image_urls: ['https://cdn.example.com/img1.png', 'https://cdn.example.com/img2.png'],
          expires_at: '2024-01-02T00:00:00.000Z',
          width: 1024,
          height: 1024,
        },
        retries: 0,
      },
    });

    const { app } = makeResultApp({ httpClient: { get: httpGet } });

    const res = await request(app).get(`/v1/jobs/${jobId}/result`);

    expect(res.status).toBe(200);
    expect(res.body.job_id).toBe(jobId);
    expect(res.body.output_type).toBe('image');
    expect(res.body.result.image_urls).toEqual([
      'https://cdn.example.com/img1.png',
      'https://cdn.example.com/img2.png',
    ]);
    expect(res.body.result.expires_at).toBe('2024-01-02T00:00:00.000Z');
    expect(res.body.result.width).toBe(1024);
    expect(res.body.result.height).toBe(1024);
  });

  it('returns 409 JOB_NOT_COMPLETE for queued job', async () => {
    const jobId = 'job_queued12345678901234567';
    jobOwnershipStore.set(jobId, {
      job_id: jobId,
      developer_id: 'dev_123',
      tier: 'T1',
      estimated_cost_usd: '0.50',
      output_type: 'text',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const httpGet = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        job_id: jobId,
        status: 'queued',
        provider: null,
        result: null,
        retries: 0,
      },
    });

    const { app } = makeResultApp({ httpClient: { get: httpGet } });

    const res = await request(app).get(`/v1/jobs/${jobId}/result`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JOB_NOT_COMPLETE');
    expect(res.body.error.details.current_status).toBe('queued');
  });

  it('returns 409 JOB_NOT_COMPLETE for running job', async () => {
    const jobId = 'job_running1234567890123456';
    jobOwnershipStore.set(jobId, {
      job_id: jobId,
      developer_id: 'dev_123',
      tier: 'T2',
      estimated_cost_usd: '1.00',
      output_type: 'text',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const httpGet = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        job_id: jobId,
        status: 'running',
        provider: 'vastai',
        result: null,
        retries: 0,
      },
    });

    const { app } = makeResultApp({ httpClient: { get: httpGet } });

    const res = await request(app).get(`/v1/jobs/${jobId}/result`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JOB_NOT_COMPLETE');
    expect(res.body.error.details.current_status).toBe('running');
  });

  it('returns 409 JOB_NOT_COMPLETE for failed job', async () => {
    const jobId = 'job_failed12345678901234567';
    jobOwnershipStore.set(jobId, {
      job_id: jobId,
      developer_id: 'dev_123',
      tier: 'T1',
      estimated_cost_usd: '0.50',
      output_type: 'text',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const httpGet = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        job_id: jobId,
        status: 'failed',
        provider: 'runpod',
        result: null,
        retries: 2,
      },
    });

    const { app } = makeResultApp({ httpClient: { get: httpGet } });

    const res = await request(app).get(`/v1/jobs/${jobId}/result`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JOB_NOT_COMPLETE');
    expect(res.body.error.details.current_status).toBe('failed');
  });

  it('returns 404 for non-existent job', async () => {
    const { app } = makeResultApp();

    const res = await request(app).get('/v1/jobs/job_doesnotexist000000000000/result');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });

  it('returns 404 for job belonging to different developer', async () => {
    const jobId = 'job_other12345678901234567';
    jobOwnershipStore.set(jobId, {
      job_id: jobId,
      developer_id: 'dev_other',
      tier: 'T1',
      estimated_cost_usd: '0.50',
      output_type: 'text',
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const { app } = makeResultApp({ developerId: 'dev_123' });

    const res = await request(app).get(`/v1/jobs/${jobId}/result`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });
});
