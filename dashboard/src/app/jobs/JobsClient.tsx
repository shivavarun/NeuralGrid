'use client';

import { useState, useMemo } from 'react';
import { Job } from '@/lib/api';

type StatusFilter = 'all' | 'queued' | 'running' | 'complete' | 'failed';
type SortOrder = 'newest' | 'oldest';

const STATUS_BADGE: Record<Job['status'], string> = {
  queued: 'bg-gray-100 text-gray-800',
  running: 'bg-blue-100 text-blue-800',
  complete: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

export default function JobsClient({ jobs }: { jobs: Job[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (statusFilter !== 'all') {
      result = result.filter((j) => j.status === statusFilter);
    }
    result = [...result].sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? db - da : da - db;
    });
    return result;
  }, [jobs, statusFilter, sortOrder]);

  return (
    <div>
      {/* Controls */}
      <div className="flex gap-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="border rounded px-3 py-1.5 text-sm"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="complete">Complete</option>
          <option value="failed">Failed</option>
        </select>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="border rounded px-3 py-1.5 text-sm"
          aria-label="Sort order"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Est. Cost</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created At</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No jobs found.
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">{job.id}</td>
                  <td className="px-4 py-3 text-sm">{job.model}</td>
                  <td className="px-4 py-3 text-sm">{job.tier}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[job.status]}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">${job.estimated_cost_usd}</td>
                  <td className="px-4 py-3 text-sm">{new Date(job.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
