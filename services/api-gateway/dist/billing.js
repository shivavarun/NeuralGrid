"use strict";
/**
 * Billing recording and Stripe integration for NeuralGrid.
 * MVP uses in-memory store and mock Stripe client.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.failingStripeClient = exports.mockStripeClient = exports.developerPaymentFailures = exports.billingStore = void 0;
exports.generateBillingId = generateBillingId;
exports.recordBilling = recordBilling;
exports.checkPaymentStatus = checkPaymentStatus;
exports.resetBillingState = resetBillingState;
// --- In-memory billing store (MVP) ---
exports.billingStore = new Map();
// --- Developer payment status store (MVP) ---
/** Tracks developers with failed payments */
exports.developerPaymentFailures = new Map();
// --- Mock Stripe client (always succeeds) ---
let chargeCounter = 0;
exports.mockStripeClient = {
    async createCharge(customerId, amountUsd, description) {
        chargeCounter++;
        return {
            chargeId: `ch_mock_${chargeCounter}_${Date.now()}`,
            success: true,
        };
    },
};
// --- Failing Stripe client (for testing failure paths) ---
exports.failingStripeClient = {
    async createCharge(customerId, amountUsd, description) {
        chargeCounter++;
        return {
            chargeId: `ch_fail_${chargeCounter}_${Date.now()}`,
            success: false,
        };
    },
};
// --- ID generation ---
let billingIdCounter = 0;
function generateBillingId() {
    billingIdCounter++;
    return `bill_${billingIdCounter}_${Date.now()}`;
}
// --- Core billing functions ---
/**
 * Record billing for a completed job and charge via Stripe.
 * Creates a billing_records entry, attempts Stripe charge, updates status.
 */
async function recordBilling(developerId, jobId, amountUsd, stripeClient = exports.mockStripeClient) {
    const record = {
        id: generateBillingId(),
        developer_id: developerId,
        job_id: jobId,
        amount_usd: amountUsd,
        stripe_charge_id: null,
        status: 'pending',
        created_at: new Date().toISOString(),
    };
    // Store as pending
    exports.billingStore.set(record.id, record);
    // Attempt Stripe charge
    const result = await stripeClient.createCharge(developerId, amountUsd, `NeuralGrid job: ${jobId}`);
    if (result.success) {
        record.status = 'charged';
        record.stripe_charge_id = result.chargeId;
        // Clear any previous failure flag
        exports.developerPaymentFailures.delete(developerId);
    }
    else {
        record.status = 'failed';
        record.stripe_charge_id = result.chargeId;
        // Mark developer as having payment failure
        exports.developerPaymentFailures.set(developerId, true);
    }
    // Update stored record
    exports.billingStore.set(record.id, record);
    return record;
}
/**
 * Check if developer has active or failed payment status.
 * Returns 'failed' if any Stripe charge has failed for this developer.
 */
async function checkPaymentStatus(developerId) {
    if (exports.developerPaymentFailures.get(developerId)) {
        return 'failed';
    }
    return 'active';
}
// --- Test helpers ---
/** Reset all billing state (for tests) */
function resetBillingState() {
    exports.billingStore.clear();
    exports.developerPaymentFailures.clear();
    billingIdCounter = 0;
    chargeCounter = 0;
}
//# sourceMappingURL=billing.js.map