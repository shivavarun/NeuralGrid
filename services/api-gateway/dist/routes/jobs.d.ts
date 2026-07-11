/**
 * Job submission endpoint — POST /v1/jobs
 * Orchestrates: validate → estimate → budget check → prices → dispatch
 */
import { Router } from 'express';
import { IdempotencyDeps } from '../middleware/idempotency';
export interface JobOwnership {
    job_id: string;
    developer_id: string;
    tier: string;
    estimated_cost_usd: string;
    output_type: 'text' | 'image';
    created_at: string;
}
/** In-memory store mapping job_id → ownership info */
export declare const jobOwnershipStore: Map<string, JobOwnership>;
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
export declare const defaultGetDeveloper: GetDeveloper;
export interface HttpClient {
    post(url: string, body: unknown): Promise<{
        status: number;
        data: unknown;
    }>;
    get(url: string): Promise<{
        status: number;
        data: unknown;
    }>;
}
/**
 * Default HTTP client using global fetch.
 */
export declare const defaultHttpClient: HttpClient;
export declare function generateJobId(): string;
export interface JobsRouterDeps {
    getDeveloper?: GetDeveloper;
    httpClient?: HttpClient;
    idempotency?: IdempotencyDeps;
}
export declare function createJobsRouter(deps?: JobsRouterDeps): Router;
