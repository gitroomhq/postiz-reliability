'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { fetcher } from '@reliability/web/lib/fetcher';
import { badgeClass, formatDate, runDuration } from '@reliability/web/lib/format';
import { RunListItem } from '@reliability/web/lib/types';

const useRuns = (limit: number) =>
  useSWR<RunListItem[]>(`/api/runs?limit=${limit}`, fetcher, { refreshInterval: 10000 });

export const RunsTable = ({ limit }: { limit: number }) => {
  const { data, error } = useRuns(limit);

  if (error) {
    return <div className="text-red-400">{error.message}</div>;
  }
  if (!data) {
    return <div className="text-neutral-400">Loading runs...</div>;
  }
  if (!data.length) {
    return <div className="text-neutral-400">No runs yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="text-neutral-400">
          <tr className="border-b border-neutral-800">
            <th className="py-2 pe-4 font-normal">Started</th>
            <th className="py-2 pe-4 font-normal">Trigger</th>
            <th className="py-2 pe-4 font-normal">Status</th>
            <th className="py-2 pe-4 font-normal">Verdict</th>
            <th className="py-2 pe-4 font-normal">Head</th>
            <th className="py-2 pe-4 font-normal">Commits</th>
            <th className="py-2 pe-4 font-normal">Duration</th>
            <th className="py-2 font-normal">Summary</th>
          </tr>
        </thead>
        <tbody>
          {data.map((run) => (
            <tr key={run.id} className="border-b border-neutral-900 hover:bg-neutral-900">
              <td className="py-2 pe-4">
                <Link href={`/runs/${run.id}`} className="text-blue-400">
                  {formatDate(run.startedAt)}
                </Link>
              </td>
              <td className="py-2 pe-4">{run.trigger}</td>
              <td className="py-2 pe-4">
                <span className={badgeClass(run.status)}>{run.status}</span>
              </td>
              <td className="py-2 pe-4">
                {run.verdict ? (
                  <span className={badgeClass(run.verdict)}>
                    {run.verdict}
                    {run.classification ? ` · ${run.classification}` : ''}
                  </span>
                ) : (
                  '-'
                )}
              </td>
              <td className="py-2 pe-4 font-mono">{run.headSha?.slice(0, 7) || '-'}</td>
              <td className="py-2 pe-4">{run.commitCount}</td>
              <td className="py-2 pe-4">{runDuration(run)}</td>
              <td className="max-w-md truncate py-2 text-neutral-400">{run.summary?.split('\n')[0] || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
