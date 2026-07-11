import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createApiClient, Job } from '@/lib/api';
import JobsClient from './JobsClient';

// Mock data for MVP — used when API_Gateway /v1/jobs is unavailable
const MOCK_JOBS: Job[] = [
  {
    id: 'job_01HX3K9M7N2P4Q5R6S7T8U9V',
    model: 'llama-3-8b',
    tier: 'T1',
    status: 'complete',
    estimated_cost_usd: '0.0042',
    created_at: '2024-06-01T10:30:00Z',
  },
  {
    id: 'job_01HX3KAB2C3D4E5F6G7H8J9K',
    model: 'stable-diffusion-xl',
    tier: 'T2',
    status: 'running',
    estimated_cost_usd: '0.0128',
    created_at: '2024-06-02T14:15:00Z',
  },
  {
    id: 'job_01HX3KBC4D5E6F7G8H9J0K1L',
    model: 'llama-3-70b',
    tier: 'T3',
    status: 'queued',
    estimated_cost_usd: '0.0385',
    created_at: '2024-06-03T09:45:00Z',
  },
  {
    id: 'job_01HX3KCD5E6F7G8H9J0K1L2M',
    model: 'mistral-7b',
    tier: 'T1',
    status: 'failed',
    estimated_cost_usd: '0.0035',
    created_at: '2024-06-03T11:20:00Z',
  },
  {
    id: 'job_01HX3KDE6F7G8H9J0K1L2M3N',
    model: 'llama-3-8b',
    tier: 'T1',
    status: 'complete',
    estimated_cost_usd: '0.0048',
    created_at: '2024-06-04T08:00:00Z',
  },
];

async function fetchJobs(token?: string): Promise<Job[]> {
  try {
    const client = createApiClient(token);
    const jobs = await client.listJobs();
    return jobs;
  } catch {
    // Fallback to mock data when API is unavailable
    return MOCK_JOBS;
  }
}

export default async function JobsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const jobs = await fetchJobs();

  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Jobs</h1>
      <JobsClient jobs={jobs} />
    </main>
  );
}
