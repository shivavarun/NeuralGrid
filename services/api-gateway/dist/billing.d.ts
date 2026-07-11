/**
 * Billing recording and Stripe integration for NeuralGrid.
 * MVP uses in-memory store and mock Stripe client.
 */
export interface StripeClient {
    createCharge(customerId: string, amountUsd: number, description: string): Promise<{
        chargeId: string;
        success: boolean;
    }>;
}
export interface BillingRecord {
    id: string;
    developer_id: string;
    job_id: string;
    amount_usd: number;
    stripe_charge_id: string | null;
    status: 'pending' | 'charged' | 'failed';
    created_at: string;
}
export declare const billingStore: Map<string, BillingRecord>;
/** Tracks developers with failed payments */
export declare const developerPaymentFailures: Map<string, boolean>;
export declare const mockStripeClient: StripeClient;
export declare const failingStripeClient: StripeClient;
export declare function generateBillingId(): string;
/**
 * Record billing for a completed job and charge via Stripe.
 * Creates a billing_records entry, attempts Stripe charge, updates status.
 */
export declare function recordBilling(developerId: string, jobId: string, amountUsd: number, stripeClient?: StripeClient): Promise<BillingRecord>;
/**
 * Check if developer has active or failed payment status.
 * Returns 'failed' if any Stripe charge has failed for this developer.
 */
export declare function checkPaymentStatus(developerId: string): Promise<'active' | 'failed'>;
/** Reset all billing state (for tests) */
export declare function resetBillingState(): void;
