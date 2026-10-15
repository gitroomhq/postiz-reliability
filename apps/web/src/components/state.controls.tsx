'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, postJson } from '@reliability/web/lib/fetcher';
import { badgeClass } from '@reliability/web/lib/format';

type StateResponse = {
  state: {
    status: string;
    reason: string | null;
    nextRunAt: string | null;
    currentRunId: string | null;
    lastGreenSha: string | null;
    updatedAt: string;
  } | null;
  member: { email: string; admin: boolean };
};

export const useSystemState = () =>
  useSWR<StateResponse>('/api/state', fetcher, { refreshInterval: 5000 });

export const StateControls = () => {
  const { data, mutate } = useSystemState();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (command: string) => {
    setSending(true);
    setError('');
    try {
      await postJson('/api/commands', { command, reason });
      setReason('');
      await mutate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const status = data?.state?.status || 'UNKNOWN';
  const stopped = ['PAUSED', 'HALTED'].includes(status);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">System state</h2>
        <span className={badgeClass(status)}>{status}</span>
        {!!data?.state?.reason && (
          <span className="text-neutral-400">{data.state.reason}</span>
        )}
      </div>
      {!!data?.state?.lastGreenSha && (
        <div className="text-neutral-400">
          Last green: <span className="font-mono">{data.state.lastGreenSha.slice(0, 7)}</span>
        </div>
      )}
      {!!data?.state?.nextRunAt && (
        <div className="text-neutral-400">
          Next scheduled run: {new Date(data.state.nextRunAt).toLocaleString()}
        </div>
      )}
      {data?.member.admin ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={stopped ? 'Reason (required)' : 'Reason (optional)'}
            className="w-72 rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5"
          />
          {status === 'IDLE' && (
            <button
              disabled={sending}
              onClick={() => send('runNow')}
              className="rounded bg-blue-600 px-3 py-1.5 font-medium disabled:opacity-50"
            >
              Run now
            </button>
          )}
          {['IDLE', 'RUNNING'].includes(status) && (
            <button
              disabled={sending}
              onClick={() => send('pause')}
              className="rounded bg-neutral-700 px-3 py-1.5 font-medium disabled:opacity-50"
            >
              Pause
            </button>
          )}
          {stopped && (
            <button
              disabled={sending || !reason.trim()}
              onClick={() => send('resume')}
              className="rounded bg-green-700 px-3 py-1.5 font-medium disabled:opacity-50"
            >
              Resume and run now
            </button>
          )}
        </div>
      ) : (
        <div className="text-neutral-400">Only admins can send commands.</div>
      )}
      {!!error && <div className="text-red-400">{error}</div>}
    </section>
  );
};
