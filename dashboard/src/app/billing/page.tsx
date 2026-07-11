import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Mock data for MVP — will be replaced by API calls when billing list endpoint is available
const RUNPOD_A100_HOURLY_RATE = 3.29; // USD/hr for A100 80GB

interface JobCostEntry {
  job_id: string;
  model: string;
  actual_cost_usd: number;
  runtime_seconds: number;
  provider: string;
  completed_at: string;
}

interface PaymentEntry {
  id: string;
  date: string;
  amount_usd: number;
  status: 'charged' | 'pending' | 'failed';
}

function getMockJobs(): JobCostEntry[] {
  return [
    { job_id: 'job_01HX3A2B4C5D', model: 'llama-3-8b', actual_cost_usd: 0.42, runtime_seconds: 1200, provider: 'vastai', completed_at: '2024-06-10T14:23:00Z' },
    { job_id: 'job_01HX3F7G8H9J', model: 'stable-diffusion-xl', actual_cost_usd: 0.18, runtime_seconds: 420, provider: 'runpod', completed_at: '2024-06-11T09:15:00Z' },
    { job_id: 'job_01HX4K2L3M4N', model: 'llama-3-70b', actual_cost_usd: 1.85, runtime_seconds: 3600, provider: 'vastai', completed_at: '2024-06-12T16:45:00Z' },
    { job_id: 'job_01HX5P6Q7R8S', model: 'whisper-large-v3', actual_cost_usd: 0.31, runtime_seconds: 900, provider: 'runpod', completed_at: '2024-06-13T11:30:00Z' },
    { job_id: 'job_01HX6T9U0V1W', model: 'llama-3-8b', actual_cost_usd: 0.38, runtime_seconds: 1080, provider: 'vastai', completed_at: '2024-06-14T08:00:00Z' },
  ];
}

function getMockPayments(): PaymentEntry[] {
  return [
    { id: 'ch_1', date: '2024-06-14', amount_usd: 3.14, status: 'charged' },
    { id: 'ch_2', date: '2024-06-07', amount_usd: 5.22, status: 'charged' },
    { id: 'ch_3', date: '2024-06-01', amount_usd: 2.87, status: 'charged' },
    { id: 'ch_4', date: '2024-06-15', amount_usd: 1.50, status: 'pending' },
  ];
}

function computeRunpodEquivalent(runtimeSeconds: number): number {
  return RUNPOD_A100_HOURLY_RATE * (runtimeSeconds / 3600);
}

function computeSavingsPct(actualTotal: number, runpodTotal: number): number {
  if (runpodTotal === 0) return 0;
  return ((runpodTotal - actualTotal) / runpodTotal) * 100;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function statusBadge(status: PaymentEntry['status']) {
  const colors: Record<string, { bg: string; text: string }> = {
    charged: { bg: '#dcfce7', text: '#166534' },
    pending: { bg: '#fef9c3', text: '#854d0e' },
    failed: { bg: '#fecaca', text: '#991b1b' },
  };
  const c = colors[status] || colors.pending;
  return (
    <span style={{ background: c.bg, color: c.text, padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
      {status}
    </span>
  );
}

export default async function BillingPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const jobs = getMockJobs();
  const payments = getMockPayments();

  const totalSpend = jobs.reduce((sum, j) => sum + j.actual_cost_usd, 0);
  const totalRunpod = jobs.reduce((sum, j) => sum + computeRunpodEquivalent(j.runtime_seconds), 0);
  const savingsPct = computeSavingsPct(totalSpend, totalRunpod);

  return (
    <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1.5rem' }}>Billing</h1>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.25rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Total Spend (This Period)</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{formatUsd(totalSpend)}</p>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '1.25rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#166534', marginBottom: '0.25rem' }}>Savings vs RunPod A100</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#15803d' }}>{savingsPct.toFixed(1)}%</p>
          <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            You saved {formatUsd(totalRunpod - totalSpend)} compared to RunPod A100 pricing
          </p>
        </div>
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.25rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>RunPod Equivalent</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{formatUsd(totalRunpod)}</p>
        </div>
      </div>

      {/* Job Cost Breakdown */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>Job Cost Breakdown</h2>
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Job ID</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Model</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Actual Cost</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>RunPod Equivalent</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Savings</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const runpodCost = computeRunpodEquivalent(job.runtime_seconds);
                const jobSaving = runpodCost - job.actual_cost_usd;
                return (
                  <tr key={job.job_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{job.job_id}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{job.model}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatUsd(job.actual_cost_usd)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#6b7280' }}>{formatUsd(runpodCost)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#15803d', fontWeight: 500 }}>
                      {formatUsd(jobSaving)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payment History */}
      <section>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>Payment History</h2>
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>Amount</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>{payment.date}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatUsd(payment.amount_usd)}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{statusBadge(payment.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
