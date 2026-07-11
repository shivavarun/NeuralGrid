import { describe, it, expect } from 'vitest';
import type { ProviderNode, Tier } from '@neuralgrid/shared';
import {
  REGISTERED_ADAPTERS,
  hasFixture,
  loadFixture,
  runAdapterContract,
  type RegisteredAdapter,
} from './registry';
import { validateProviderNodes, isSuccessStatus } from './schema';

/**
 * Provider_Adapter contract tests (Req 23).
 *
 * Runs on every build via `npm test`. Each registered adapter is replayed
 * against its recorded fixture; the build fails if any adapter lacks a fixture
 * or if the parsed output violates the recorded status code / response schema.
 */
describe('Provider_Adapter contract tests (Req 23)', () => {
  // Req 23.1: a contract test per registered Provider_Adapter, every build.
  it('has at least one registered Provider_Adapter to test', () => {
    expect(REGISTERED_ADAPTERS.length).toBeGreaterThan(0);
  });

  // Req 23.2: fail the build for any adapter lacking a recorded fixture.
  describe('every registered adapter has a recorded fixture', () => {
    for (const adapter of REGISTERED_ADAPTERS) {
      it(`${adapter.name} has a recorded fixture`, () => {
        expect(
          hasFixture(adapter.name),
          `Provider_Adapter "${adapter.name}" is registered but has no recorded fixture. ` +
            `Add services/price-aggregator/src/providers/contract/fixtures/${adapter.name}.json`
        ).toBe(true);
      });
    }
  });

  // Req 23.1, 23.3, 23.4: replay fixture, assert status + schema, report failures.
  describe('each adapter matches its recorded fixture status and response schema', () => {
    for (const adapter of REGISTERED_ADAPTERS) {
      it(`${adapter.name} conforms to its recorded contract`, async () => {
        const result = await runAdapterContract(adapter);
        // On mismatch the message names the adapter and the failed assertion.
        expect(
          result.passed,
          result.passed
            ? ''
            : `Contract failed for adapter "${result.adapter}": ${result.failedAssertion}`
        ).toBe(true);
      });
    }
  });

  // Confirms recorded fixtures carry a success status code that adapters accept.
  describe('recorded fixtures declare a success status code', () => {
    for (const adapter of REGISTERED_ADAPTERS) {
      it(`${adapter.name} fixture status is 2xx`, () => {
        const fixture = loadFixture(adapter.name);
        expect(isSuccessStatus(fixture.status)).toBe(true);
      });
    }
  });
});

/**
 * Meta-tests: prove the contract mechanism itself detects violations, so a
 * regression in an adapter or a missing fixture actually blocks deployment.
 */
describe('contract mechanism detects violations', () => {
  it('reports a missing-fixture adapter as a build failure', async () => {
    const bogus: RegisteredAdapter = {
      name: 'nonexistent-provider',
      query: async () => [],
    };
    const result = await runAdapterContract(bogus);
    expect(result.passed).toBe(false);
    expect(result.adapter).toBe('nonexistent-provider');
    expect(result.failedAssertion).toMatch(/fixture is missing/);
  });

  it('reports a schema-violating adapter with the offending adapter + assertion', async () => {
    // A registered adapter whose parser returns malformed nodes; a real fixture
    // exists (vastai) so this isolates the schema assertion.
    const badParser: RegisteredAdapter = {
      name: 'vastai',
      query: async (_tier: Tier) =>
        [{ node_id: 42, vram_gb: 'lots' } as unknown as ProviderNode],
    };
    const result = await runAdapterContract(badParser);
    expect(result.passed).toBe(false);
    expect(result.adapter).toBe('vastai');
    expect(result.failedAssertion).toMatch(/response body schema/);
  });

  it('flags a non-empty result whose nodes are well-formed', () => {
    const good: ProviderNode[] = [
      {
        provider: 'vastai',
        node_id: '1',
        gpu_model: 'A100',
        vram_gb: 80,
        hourly_rate_usd: 1.5,
        availability: true,
      },
    ];
    expect(validateProviderNodes(good)).toEqual([]);
  });

  it('catches every malformed field in a node', () => {
    const bad = [
      {
        provider: 'aws',
        node_id: '',
        gpu_model: '',
        vram_gb: -1,
        hourly_rate_usd: 'x',
        availability: 'yes',
      },
    ] as unknown as ProviderNode[];
    const errors = validateProviderNodes(bad);
    expect(errors.length).toBeGreaterThanOrEqual(6);
  });
});
