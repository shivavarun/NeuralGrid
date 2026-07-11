/**
 * Secrets_Manager client (production security).
 *
 * Production retrieves provider API keys, Stripe keys, and database credentials
 * from an external Secrets_Manager instead of a plaintext `.env` file. In
 * production there is NO plaintext environment fallback for these credentials
 * (Req 12.1). Provider API keys must rotate WITHOUT a deploy and take effect
 * within 5 minutes; this is achieved with a short-TTL in-memory cache (default
 * 5 min) so a stale cached value is refetched shortly after rotation (Req 12.2).
 * If a required credential is missing at startup, startup fails (throws) and the
 * error logs ONLY the credential name — never a value or partial value (Req 12.3).
 *
 * Following the codebase convention (see `billingLedger.ts`, `autoRefund.ts`):
 *  - The backend is an injectable `SecretsProvider` interface. The MVP/dev/test
 *    ships an in-memory `InMemorySecretsProvider`; production wires an
 *    AWS Secrets Manager / GCP Secret Manager / Vault implementation behind the
 *    same interface without touching callers.
 *  - Pure decision logic (`isCacheEntryFresh`) is separated from the
 *    side-effecting client so it is trivially unit- and property-testable.
 *
 * Requirements: 12.1, 12.2, 12.3
 */

// --- Credential names ---

/**
 * The credentials NeuralGrid retrieves from the Secrets_Manager. Names only —
 * these strings are safe to log; their VALUES are never logged (Req 12.3).
 */
export const SECRET_NAMES = {
  STRIPE_SECRET_KEY: "stripe_secret_key",
  STRIPE_WEBHOOK_SECRET: "stripe_webhook_secret",
  DATABASE_URL: "database_url",
  PROVIDER_API_KEY: "provider_api_key",
  PROVIDER_CALLBACK_HMAC_SECRET: "provider_callback_hmac_secret",
} as const;

export type SecretName = (typeof SECRET_NAMES)[keyof typeof SECRET_NAMES];

/**
 * Credentials that MUST be present at startup. A missing one fails startup
 * (Req 12.3). Provider credentials are included so a first-boot misconfiguration
 * is caught, but they are also the credentials that rotate at runtime (Req 12.2).
 */
export const REQUIRED_SECRETS: readonly string[] = [
  SECRET_NAMES.STRIPE_SECRET_KEY,
  SECRET_NAMES.STRIPE_WEBHOOK_SECRET,
  SECRET_NAMES.DATABASE_URL,
  SECRET_NAMES.PROVIDER_API_KEY,
  SECRET_NAMES.PROVIDER_CALLBACK_HMAC_SECRET,
];

// --- Configuration ---

/**
 * Default cache TTL. Provider credentials must take effect within 5 minutes of
 * rotation (Req 12.2), so the cached value lives at most this long before a
 * refetch picks up the rotated value.
 */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

// --- Injectable backend interface ---

/**
 * The pluggable Secrets_Manager backend. Production supplies an AWS/GCP/Vault
 * implementation; dev/tests supply {@link InMemorySecretsProvider}.
 *
 * `getSecret` resolves to the raw credential value, or `undefined` when the
 * named secret does not exist in the store.
 */
export interface SecretsProvider {
  getSecret(name: string): Promise<string | undefined>;
}

// --- Errors ---

/**
 * Thrown when a required credential is absent at startup (Req 12.3). The message
 * and `secretName` carry the credential NAME only; no value is ever included.
 */
export class MissingCredentialError extends Error {
  readonly secretName: string;

  constructor(secretName: string) {
    super(`Missing required credential: ${secretName}`);
    this.name = "MissingCredentialError";
    this.secretName = secretName;
  }
}

// --- Pure logic (no I/O; unit/property testable) ---

/** A cached secret value with the timestamp it was fetched at. */
export interface CacheEntry {
  value: string;
  fetchedAt: number;
}

/**
 * Whether a cache entry is still fresh at time `now` given a TTL.
 *
 * Fresh iff its age (`now - fetchedAt`) is strictly less than `ttlMs`; at or
 * beyond the TTL it is stale and must be refetched. A non-positive `ttlMs`
 * treats every entry as immediately stale. Pure — no clock, no I/O.
 */
export function isCacheEntryFresh(
  entry: CacheEntry,
  now: number,
  ttlMs: number
): boolean {
  if (ttlMs <= 0) return false;
  return now - entry.fetchedAt < ttlMs;
}

// --- In-memory backend (dev/test) ---

/**
 * In-memory Secrets_Manager backend for dev and tests. NOT for production, where
 * a real Secrets_Manager (with no plaintext env fallback) is wired instead
 * (Req 12.1). Values can be mutated with {@link set} to simulate rotation.
 */
export class InMemorySecretsProvider implements SecretsProvider {
  private readonly secrets: Map<string, string>;

  constructor(initial?: Record<string, string>) {
    this.secrets = new Map(Object.entries(initial ?? {}));
  }

  async getSecret(name: string): Promise<string | undefined> {
    return this.secrets.get(name);
  }

  /** Set/rotate a secret value (test/dev helper). */
  set(name: string, value: string): void {
    this.secrets.set(name, value);
  }

  /** Remove a secret (test/dev helper). */
  delete(name: string): void {
    this.secrets.delete(name);
  }
}

// --- Client ---

export interface SecretsManagerOptions {
  provider: SecretsProvider;
  /** Cache TTL in ms. Defaults to {@link DEFAULT_TTL_MS} (5 min). */
  ttlMs?: number;
  /** Clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Short-TTL caching client over a {@link SecretsProvider}.
 *
 * A fetched credential is cached for up to `ttlMs`. Once the entry ages past the
 * TTL, the next `get` refetches from the backend — so a credential rotated in
 * the Secrets_Manager takes effect within the TTL (default 5 min) with no deploy
 * (Req 12.2).
 */
export class SecretsManagerClient {
  private readonly provider: SecretsProvider;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: SecretsManagerOptions) {
    this.provider = options.provider;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Get a credential, serving a fresh cached value when available and otherwise
   * refetching from the backend and caching the result. Returns `undefined` when
   * the secret does not exist in the backend.
   */
  async get(name: string): Promise<string | undefined> {
    const cached = this.cache.get(name);
    if (cached && isCacheEntryFresh(cached, this.now(), this.ttlMs)) {
      return cached.value;
    }

    const value = await this.provider.getSecret(name);
    if (value === undefined) {
      // Don't cache a miss: a not-yet-provisioned secret should be picked up on
      // the next call without waiting out a TTL.
      this.cache.delete(name);
      return undefined;
    }

    this.cache.set(name, { value, fetchedAt: this.now() });
    return value;
  }

  /**
   * Get a credential that must exist, throwing {@link MissingCredentialError}
   * (name only) when it is absent (Req 12.3).
   */
  async getRequired(name: string): Promise<string> {
    const value = await this.get(name);
    if (value === undefined) {
      throw new MissingCredentialError(name);
    }
    return value;
  }

  /** Drop the cached value for a name (test/ops helper; forces a refetch). */
  invalidate(name: string): void {
    this.cache.delete(name);
  }
}

// --- Startup credential load (Req 12.1, 12.3) ---

export interface LoadCredentialsOptions {
  /** Names that must all be present; defaults to {@link REQUIRED_SECRETS}. */
  required?: readonly string[];
  /**
   * Log sink for the missing-credential error. Defaults to `console.error`.
   * Receives the credential NAME only (never a value) (Req 12.3).
   */
  logError?: (message: string) => void;
}

/**
 * Load all required credentials at startup.
 *
 * Fetches each required credential through the caching client (priming the cache
 * for later reads). On the FIRST missing credential it logs an error naming that
 * credential — and only that name (Req 12.3) — then throws
 * {@link MissingCredentialError}, failing startup. Never logs a value or a
 * partial value.
 *
 * Returns the resolved credentials keyed by name on success.
 */
export async function loadRequiredCredentials(
  client: SecretsManagerClient,
  options?: LoadCredentialsOptions
): Promise<Record<string, string>> {
  const required = options?.required ?? REQUIRED_SECRETS;
  const logError = options?.logError ?? ((m: string) => console.error(m));

  const resolved: Record<string, string> = {};
  for (const name of required) {
    let value: string | undefined;
    try {
      value = await client.get(name);
    } catch (err) {
      // A backend failure must not surface any secret content; report the name.
      logError(`Secrets_Manager: failed to retrieve required credential '${name}'`);
      throw new MissingCredentialError(name);
    }
    if (value === undefined) {
      logError(`Secrets_Manager: missing required credential '${name}'`);
      throw new MissingCredentialError(name);
    }
    resolved[name] = value;
  }
  return resolved;
}

// --- Production guard (Req 12.1) ---

/**
 * True when running in production. In production there is no plaintext env
 * fallback for the managed credentials (Req 12.1).
 */
export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Build the Secrets_Manager client for the current environment.
 *
 * Production REQUIRES an injected `provider` (a real Secrets_Manager backend);
 * omitting it throws, so a prod deployment can never silently fall back to
 * plaintext env values (Req 12.1). Outside production, when no provider is given
 * a dev-only {@link InMemorySecretsProvider} seeded from `process.env` is used.
 */
export function createSecretsManager(options?: {
  provider?: SecretsProvider;
  ttlMs?: number;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
}): SecretsManagerClient {
  const env = options?.env ?? process.env;
  let provider = options?.provider;

  if (!provider) {
    if (isProduction(env)) {
      throw new Error(
        "Secrets_Manager provider is required in production; " +
          "plaintext environment fallback is disabled (Req 12.1)"
      );
    }
    // Dev/test only: seed an in-memory provider from the known secret names in
    // the local environment. Never used in production.
    const seed: Record<string, string> = {};
    for (const name of Object.values(SECRET_NAMES)) {
      const envKey = name.toUpperCase();
      const val = env[envKey];
      if (val !== undefined) seed[name] = val;
    }
    provider = new InMemorySecretsProvider(seed);
  }

  return new SecretsManagerClient({
    provider,
    ttlMs: options?.ttlMs,
    now: options?.now,
  });
}
