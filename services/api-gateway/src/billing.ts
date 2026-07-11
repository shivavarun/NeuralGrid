/**
 * Billing recording and Stripe integration for NeuralGrid.
 * MVP uses in-memory store and mock Stripe client.
 */

// --- Stripe client interface (injectable for testing) ---

export interface StripeClient {
  createCharge(
    customerId: string,
    amountUsd: number,
    description: string
  ): Promise<{ chargeId: string; success: boolean }>;
}

// --- Billing record ---

export interface BillingRecord {
  id: string;
  developer_id: string;
  job_id: string;
  amount_usd: number;
  stripe_charge_id: string | null;
  status: 'pending' | 'charged' | 'failed';
  created_at: string;
}

// --- In-memory billing store (MVP) ---

export const billingStore = new Map<string, BillingRecord>();

// --- Developer payment status store (MVP) ---

/** Tracks developers with failed payments */
export const developerPaymentFailures = new Map<string, boolean>();

// --- Mock Stripe client (always succeeds) ---

let chargeCounter = 0;

export const mockStripeClient: StripeClient = {
  async createCharge(customerId: string, amountUsd: number, description: string) {
    chargeCounter++;
    return {
      chargeId: `ch_mock_${chargeCounter}_${Date.now()}`,
      success: true,
    };
  },
};

// --- Failing Stripe client (for testing failure paths) ---

export const failingStripeClient: StripeClient = {
  async createCharge(customerId: string, amountUsd: number, description: string) {
    chargeCounter++;
    return {
      chargeId: `ch_fail_${chargeCounter}_${Date.now()}`,
      success: false,
    };
  },
};

// --- ID generation ---

let billingIdCounter = 0;

export function generateBillingId(): string {
  billingIdCounter++;
  return `bill_${billingIdCounter}_${Date.now()}`;
}

// --- Core billing functions ---

/**
 * Record billing for a completed job and charge via Stripe.
 * Creates a billing_records entry, attempts Stripe charge, updates status.
 */
export async function recordBilling(
  developerId: string,
  jobId: string,
  amountUsd: number,
  stripeClient: StripeClient = mockStripeClient
): Promise<BillingRecord> {
  const record: BillingRecord = {
    id: generateBillingId(),
    developer_id: developerId,
    job_id: jobId,
    amount_usd: amountUsd,
    stripe_charge_id: null,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  // Store as pending
  billingStore.set(record.id, record);

  // Attempt Stripe charge
  const result = await stripeClient.createCharge(
    developerId,
    amountUsd,
    `NeuralGrid job: ${jobId}`
  );

  if (result.success) {
    record.status = 'charged';
    record.stripe_charge_id = result.chargeId;
    // Clear any previous failure flag
    developerPaymentFailures.delete(developerId);
  } else {
    record.status = 'failed';
    record.stripe_charge_id = result.chargeId;
    // Mark developer as having payment failure
    developerPaymentFailures.set(developerId, true);
  }

  // Update stored record
  billingStore.set(record.id, record);

  return record;
}

/**
 * Check if developer has active or failed payment status.
 * Returns 'failed' if any Stripe charge has failed for this developer.
 */
export async function checkPaymentStatus(
  developerId: string
): Promise<'active' | 'failed'> {
  if (developerPaymentFailures.get(developerId)) {
    return 'failed';
  }
  return 'active';
}

// --- Test helpers ---

/** Reset all billing state (for tests) */
export function resetBillingState(): void {
  billingStore.clear();
  developerPaymentFailures.clear();
  billingIdCounter = 0;
  chargeCounter = 0;
}
