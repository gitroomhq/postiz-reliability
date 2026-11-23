'use client';

import useSWR from 'swr';
import { fetcher } from '@reliability/web/lib/fetcher';
import { formatDate } from '@reliability/web/lib/format';

type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  reason: string | null;
  data: unknown;
  createdAt: string;
};

const useAuditLog = () =>
  useSWR<AuditEntry[]>('/api/audit?limit=200', fetcher, { refreshInterval: 10000 });

export const AuditLog = () => {
  const { data, error } = useAuditLog();

  if (error) {
    return <div className="text-red-400">{error.message}</div>;
  }
  if (!data) {
    return <div className="text-neutral-400">Loading audit log...</div>;
  }
  if (!data.length) {
    return <div className="text-neutral-400">No audit entries yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="text-neutral-400">
          <tr className="border-b border-neutral-800">
            <th className="py-2 pe-4 font-normal">When</th>
            <th className="py-2 pe-4 font-normal">Actor</th>
            <th className="py-2 pe-4 font-normal">Action</th>
            <th className="py-2 pe-4 font-normal">Reason</th>
            <th className="py-2 font-normal">Data</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.id} className="border-b border-neutral-900">
              <td className="py-2 pe-4 whitespace-nowrap">{formatDate(entry.createdAt)}</td>
              <td className="py-2 pe-4">{entry.actor}</td>
              <td className="py-2 pe-4 font-mono">{entry.action}</td>
              <td className="py-2 pe-4">{entry.reason || '-'}</td>
              <td className="py-2 font-mono text-neutral-500">
                {entry.data ? JSON.stringify(entry.data) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
