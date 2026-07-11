/**
 * API_Gateway Express server — Port 8080
 * Mounts all routes with auth, rate-limit, validation middleware chain.
 * Consistent error handling for unhandled errors.
 */
import Redis from 'ioredis';
import { KeyStore, ApiKeyRecord } from './middleware/auth';
import { ModelLookup } from './middleware/validation';
export declare const mvpKeyStore: KeyStore;
/** Register a key hash for MVP testing */
export declare function registerApiKey(hash: string, record: ApiKeyRecord): void;
export declare function createApp(options?: {
    keyStore?: KeyStore;
    redis?: Redis;
    modelLookup?: ModelLookup;
}): import("express-serve-static-core").Express;
declare const app: import("express-serve-static-core").Express;
export default app;
