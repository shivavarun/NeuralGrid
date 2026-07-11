"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const billing_1 = require("./billing");
(0, vitest_1.describe)('Billing', () => {
    (0, vitest_1.beforeEach)(() => {
        (0, billing_1.resetBillingState)();
    });
    (0, vitest_1.describe)('recordBilling', () => {
        (0, vitest_1.it)('creates a billing record with correct fields', async () => {
            const record = await (0, billing_1.recordBilling)('dev_1', 'job_abc', 0.25);
            (0, vitest_1.expect)(record.developer_id).toBe('dev_1');
            (0, vitest_1.expect)(record.job_id).toBe('job_abc');
            (0, vitest_1.expect)(record.amount_usd).toBe(0.25);
            (0, vitest_1.expect)(record.id).toMatch(/^bill_/);
            (0, vitest_1.expect)(record.created_at).toBeTruthy();
        });
        (0, vitest_1.it)('marks status as charged on successful Stripe charge', async () => {
            const record = await (0, billing_1.recordBilling)('dev_1', 'job_abc', 1.5, billing_1.mockStripeClient);
            (0, vitest_1.expect)(record.status).toBe('charged');
            (0, vitest_1.expect)(record.stripe_charge_id).toMatch(/^ch_mock_/);
        });
        (0, vitest_1.it)('marks status as failed on Stripe charge failure', async () => {
            const record = await (0, billing_1.recordBilling)('dev_1', 'job_abc', 1.5, billing_1.failingStripeClient);
            (0, vitest_1.expect)(record.status).toBe('failed');
            (0, vitest_1.expect)(record.stripe_charge_id).toMatch(/^ch_fail_/);
        });
        (0, vitest_1.it)('stores billing record in billingStore', async () => {
            const record = await (0, billing_1.recordBilling)('dev_1', 'job_xyz', 2.0);
            (0, vitest_1.expect)(billing_1.billingStore.get(record.id)).toEqual(record);
        });
        (0, vitest_1.it)('uses custom Stripe client when provided', async () => {
            const customClient = {
                async createCharge(customerId, amountUsd, description) {
                    return { chargeId: 'ch_custom_123', success: true };
                },
            };
            const record = await (0, billing_1.recordBilling)('dev_1', 'job_1', 0.5, customClient);
            (0, vitest_1.expect)(record.stripe_charge_id).toBe('ch_custom_123');
            (0, vitest_1.expect)(record.status).toBe('charged');
        });
        (0, vitest_1.it)('passes correct description to Stripe', async () => {
            let capturedDesc = '';
            const spyClient = {
                async createCharge(customerId, amountUsd, description) {
                    capturedDesc = description;
                    return { chargeId: 'ch_spy', success: true };
                },
            };
            await (0, billing_1.recordBilling)('dev_1', 'job_special', 1.0, spyClient);
            (0, vitest_1.expect)(capturedDesc).toBe('NeuralGrid job: job_special');
        });
    });
    (0, vitest_1.describe)('checkPaymentStatus', () => {
        (0, vitest_1.it)('returns active for developer with no failures', async () => {
            const status = await (0, billing_1.checkPaymentStatus)('dev_new');
            (0, vitest_1.expect)(status).toBe('active');
        });
        (0, vitest_1.it)('returns failed after a Stripe charge fails', async () => {
            await (0, billing_1.recordBilling)('dev_1', 'job_1', 1.0, billing_1.failingStripeClient);
            const status = await (0, billing_1.checkPaymentStatus)('dev_1');
            (0, vitest_1.expect)(status).toBe('failed');
        });
        (0, vitest_1.it)('returns active after successful charge clears failure', async () => {
            // First: fail
            await (0, billing_1.recordBilling)('dev_1', 'job_1', 1.0, billing_1.failingStripeClient);
            (0, vitest_1.expect)(await (0, billing_1.checkPaymentStatus)('dev_1')).toBe('failed');
            // Then: succeed (clears failure flag)
            await (0, billing_1.recordBilling)('dev_1', 'job_2', 0.5, billing_1.mockStripeClient);
            const status = await (0, billing_1.checkPaymentStatus)('dev_1');
            (0, vitest_1.expect)(status).toBe('active');
        });
        (0, vitest_1.it)('does not affect other developers', async () => {
            await (0, billing_1.recordBilling)('dev_1', 'job_1', 1.0, billing_1.failingStripeClient);
            (0, vitest_1.expect)(await (0, billing_1.checkPaymentStatus)('dev_1')).toBe('failed');
            (0, vitest_1.expect)(await (0, billing_1.checkPaymentStatus)('dev_2')).toBe('active');
        });
    });
    (0, vitest_1.describe)('billing record storage', () => {
        (0, vitest_1.it)('stores multiple records for same developer', async () => {
            await (0, billing_1.recordBilling)('dev_1', 'job_1', 1.0);
            await (0, billing_1.recordBilling)('dev_1', 'job_2', 2.0);
            const records = Array.from(billing_1.billingStore.values()).filter((r) => r.developer_id === 'dev_1');
            (0, vitest_1.expect)(records).toHaveLength(2);
        });
        (0, vitest_1.it)('each record has unique id', async () => {
            const r1 = await (0, billing_1.recordBilling)('dev_1', 'job_1', 1.0);
            const r2 = await (0, billing_1.recordBilling)('dev_1', 'job_2', 2.0);
            (0, vitest_1.expect)(r1.id).not.toBe(r2.id);
        });
        (0, vitest_1.it)('record starts as pending then transitions', async () => {
            // We can verify final state — pending is intermediate
            const record = await (0, billing_1.recordBilling)('dev_1', 'job_1', 1.0, billing_1.mockStripeClient);
            (0, vitest_1.expect)(record.status).toBe('charged');
            const failedRecord = await (0, billing_1.recordBilling)('dev_2', 'job_2', 1.0, billing_1.failingStripeClient);
            (0, vitest_1.expect)(failedRecord.status).toBe('failed');
        });
    });
});
//# sourceMappingURL=billing.test.js.map