/**
 * Registry of Provider_Adapters subject to contract testing (Req 23).
 *
 * Every adapter listed here MUST have a recorded fixture; the contract test
 * suite fails the build for any registered adapter lacking one.
 */

import fs from 'fs';
import path from 'path';
import type { ProviderNode, Tier } from '@neuralgrid/shared';
import { queryVastaiNodes } from '../vastai';
import { queryRunpodNodes } from '../runpod';
import {
  type ContractFixture,
  makeFetchStub,
  validateProviderNodes,
  isSuccessStatus,
} from './schema';

/** A Provider_Adapter registered for contract testing. */
export interface RegisteredAdapter {
  /** Adapter name; also the fixture file basename. */
  name: string;
  /** The adapter's response-parsing entry point. */
  query: (tier: Tier) => Promise<ProviderNode[]>;
}

/**
 * The registered Provider_Adapters for the MVP. Adding a provider here without
 * a matching fixture makes the contract suite fail the build (Req 23.2).
 */
export const REGISTERED_ADAPTERS: RegisteredAdapter[] = [
  { name: 'vastai', query: queryVastaiNodes },
  { name: 'runpod', query: queryRunpodNodes },
];

export const FIXTURES_DIR = path.join(__dirname, 'fixtures');

export function fixturePath(name: string): string {
  return path.join(FIXTURES_DIR, `${name}.json`);
}

/** Missing recorded fixture — the contract test treats this as a build failure. */
export class MissingFixtureError extends Error {
  constructor(public adapter: string) {
    super(`No recorded fixture for Provider_Adapter "${adapter}" at ${fixturePath(adapter)}`);
    this.name = 'MissingFixtureError';
  }
}

export function hasFixture(name: string): boolean {
  return fs.existsSync(fixturePath(name));
}

export function loadFixture(name: string): ContractFixture {
  if (!hasFixture(name)) {
    throw new MissingFixtureError(name);
  }
  const raw = fs.readFileSync(fixturePath(name), 'utf-8');
  return JSON.parse(raw) as ContractFixture;
}

/** Outcome of a single adapter's contract check. */
export interface ContractResult {
  adapter: string;
  passed: boolean;
  /** Which assertion failed, if any (adapter + assertion for reporting, Req 23.4). */
  failedAssertion?: string;
}

/**
 * Run the contract check for one adapter: replay its recorded fixture through
 * the adapter's parser and assert recorded status code + response body schema.
 * Reports which assertion failed on mismatch.
 */
export async function runAdapterContract(adapter: RegisteredAdapter): Promise<ContractResult> {
  const fail = (assertion: string): ContractResult => ({
    adapter: adapter.name,
    passed: false,
    failedAssertion: assertion,
  });

  // Assertion 1: a recorded fixture must exist (Req 23.2).
  if (!hasFixture(adapter.name)) {
    return fail('recorded fixture is missing');
  }

  let fixture: ContractFixture;
  try {
    fixture = loadFixture(adapter.name);
  } catch (err: any) {
    return fail(`recorded fixture is unreadable: ${err.message}`);
  }

  // Assertion 2: recorded status code is a success the adapter accepts.
  if (!isSuccessStatus(fixture.status)) {
    return fail(`recorded status code ${fixture.status} is not a 2xx success`);
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeFetchStub(fixture);
  let nodes: ProviderNode[];
  try {
    nodes = await adapter.query(fixture.queryTier);
  } catch (err: any) {
    return fail(`adapter threw while parsing a ${fixture.status} fixture: ${err.message}`);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Assertion 3: response body schema — non-empty ProviderNode array.
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return fail('response body schema: expected a non-empty ProviderNode array');
  }

  // Assertion 4: every node conforms to the ProviderNode schema.
  const schemaErrors = validateProviderNodes(nodes);
  if (schemaErrors.length > 0) {
    return fail(`response body schema: ${schemaErrors.join('; ')}`);
  }

  return { adapter: adapter.name, passed: true };
}
