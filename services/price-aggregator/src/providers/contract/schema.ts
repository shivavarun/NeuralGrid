/**
 * Contract-test schema definitions and helpers (Req 23).
 *
 * A Provider_Adapter contract test replays a *recorded fixture* (a captured,
 * representative provider API response) through the adapter's response-parsing
 * code and asserts two things:
 *   1. the fixture's recorded HTTP status code is a success the adapter accepts,
 *   2. the parsed output conforms to the ProviderNode response-body schema.
 */

import type { ProviderNode } from '@neuralgrid/shared';

/**
 * A recorded provider API response used as a contract fixture. `body` is the
 * raw, provider-specific response shape captured from the real API.
 */
export interface ContractFixture {
  /** Provider this fixture was recorded from. */
  provider: string;
  /** Recorded HTTP status code of the captured response. */
  status: number;
  /** Tier to replay the fixture against when driving the adapter. */
  queryTier: 'T1' | 'T2' | 'T3';
  /** Raw, provider-specific response body captured from the API. */
  body: unknown;
}

/** Result of validating a single ProviderNode against the response-body schema. */
export function validateProviderNode(node: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `node[${index}]`;

  if (node === null || typeof node !== 'object') {
    return [`${prefix} is not an object`];
  }
  const n = node as Record<string, unknown>;

  if (n.provider !== 'vastai' && n.provider !== 'runpod') {
    errors.push(`${prefix}.provider must be a known Provider, got ${JSON.stringify(n.provider)}`);
  }
  if (typeof n.node_id !== 'string' || n.node_id.length === 0) {
    errors.push(`${prefix}.node_id must be a non-empty string`);
  }
  if (typeof n.gpu_model !== 'string' || n.gpu_model.length === 0) {
    errors.push(`${prefix}.gpu_model must be a non-empty string`);
  }
  if (typeof n.vram_gb !== 'number' || !Number.isFinite(n.vram_gb) || n.vram_gb <= 0) {
    errors.push(`${prefix}.vram_gb must be a positive finite number`);
  }
  if (typeof n.hourly_rate_usd !== 'number' || !Number.isFinite(n.hourly_rate_usd) || n.hourly_rate_usd < 0) {
    errors.push(`${prefix}.hourly_rate_usd must be a non-negative finite number`);
  }
  if (typeof n.availability !== 'boolean') {
    errors.push(`${prefix}.availability must be a boolean`);
  }
  return errors;
}

/** Validate a parsed adapter result against the ProviderNode[] response schema. */
export function validateProviderNodes(nodes: ProviderNode[]): string[] {
  if (!Array.isArray(nodes)) {
    return ['result is not an array of ProviderNode'];
  }
  return nodes.flatMap((node, i) => validateProviderNode(node, i));
}

/** A recorded success status is any 2xx code. */
export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Build a `fetch` stub that replays a recorded fixture. Adapters read
 * `response.ok`, `response.status`, `response.json()`, and `response.text()`.
 */
export function makeFetchStub(fixture: ContractFixture): typeof fetch {
  const ok = isSuccessStatus(fixture.status);
  const stub = async (): Promise<Response> =>
    ({
      ok,
      status: fixture.status,
      json: async () => fixture.body,
      text: async () => JSON.stringify(fixture.body),
    }) as unknown as Response;
  return stub as unknown as typeof fetch;
}
