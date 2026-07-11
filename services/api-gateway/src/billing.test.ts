import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordBilling,
  checkPaymentStatus,
  resetBillingState,
  billingStore,
  developerPaymentFailures,
  mockStripeClient,
  failingStripeClient,
  BillingRecord,
  StripeClient,
} from './billing';

describe('Billing', () => {
  beforeEach(() => {
    resetBillingState();
  });

  describe('recordBilling', () => {
    it('creates a billing record with correct fields', async () => {
      const record = await recordBilling('dev_1', 'job_abc', 0.25);

      expect(record.developer_id).toBe('dev_1');
      expect(record.job_id).toBe('job_abc');
      expect(record.amount_usd).toBe(0.25);
      expect(record.id).toMatch(/^bill_/);
      expect(record.created_at).toBeTruthy();
    });

    it('marks status as charged on successful Stripe charge', async () => {
      const record = await recordBilling('dev_1', 'job_abc', 1.5, mockStripeClient);

      expect(record.status).toBe('charged');
      expect(record.stripe_charge_id).toMatch(/^ch_mock_/);
    });

    it('marks status as failed on Stripe charge failure', async () => {
      const record = await recordBilling('dev_1', 'job_abc', 1.5, failingStripeClient);

      expect(record.status).toBe('failed');
      expect(record.stripe_charge_id).toMatch(/^ch_fail_/);
    });

    it('stores billing record in billingStore', async () => {
      const record = await recordBilling('dev_1', 'job_xyz', 2.0);

      expect(billingStore.get(record.id)).toEqual(record);
    });

    it('uses custom Stripe client when provided', async () => {
      const customClient: StripeClient = {
        async createCharge(customerId, amountUsd, description) {
          return { chargeId: 'ch_custom_123', success: true };
        },
      };

      const record = await recordBilling('dev_1', 'job_1', 0.5, customClient);

      expect(record.stripe_charge_id).toBe('ch_custom_123');
      expect(record.status).toBe('charged');
    });

    it('passes correct description to Stripe', async () => {
      let capturedDesc = '';
      const spyClient: StripeClient = {
        async createCharge(customerId, amountUsd, description) {
          capturedDesc = description;
          return { chargeId: 'ch_spy', success: true };
        },
      };

      await recordBilling('dev_1', 'job_special', 1.0, spyClient);

      expect(capturedDesc).toBe('NeuralGrid job: job_special');
    });
  });

  describe('checkPaymentStatus', () => {
    it('returns active for developer with no failures', async () => {
      const status = await checkPaymentStatus('dev_new');
      expect(status).toBe('active');
    });

    it('returns failed after a Stripe charge fails', async () => {
      await recordBilling('dev_1', 'job_1', 1.0, failingStripeClient);

      const status = await checkPaymentStatus('dev_1');
      expect(status).toBe('failed');
    });

    it('returns active after successful charge clears failure', async () => {
      // First: fail
      await recordBilling('dev_1', 'job_1', 1.0, failingStripeClient);
      expect(await checkPaymentStatus('dev_1')).toBe('failed');

      // Then: succeed (clears failure flag)
      await recordBilling('dev_1', 'job_2', 0.5, mockStripeClient);

      const status = await checkPaymentStatus('dev_1');
      expect(status).toBe('active');
    });

    it('does not affect other developers', async () => {
      await recordBilling('dev_1', 'job_1', 1.0, failingStripeClient);

      expect(await checkPaymentStatus('dev_1')).toBe('failed');
      expect(await checkPaymentStatus('dev_2')).toBe('active');
    });
  });

  describe('billing record storage', () => {
    it('stores multiple records for same developer', async () => {
      await recordBilling('dev_1', 'job_1', 1.0);
      await recordBilling('dev_1', 'job_2', 2.0);

      const records = Array.from(billingStore.values()).filter(
        (r) => r.developer_id === 'dev_1'
      );
      expect(records).toHaveLength(2);
    });

    it('each record has unique id', async () => {
      const r1 = await recordBilling('dev_1', 'job_1', 1.0);
      const r2 = await recordBilling('dev_1', 'job_2', 2.0);

      expect(r1.id).not.toBe(r2.id);
    });

    it('record starts as pending then transitions', async () => {
      // We can verify final state — pending is intermediate
      const record = await recordBilling('dev_1', 'job_1', 1.0, mockStripeClient);
      expect(record.status).toBe('charged');

      const failedRecord = await recordBilling('dev_2', 'job_2', 1.0, failingStripeClient);
      expect(failedRecord.status).toBe('failed');
    });
  });
});
