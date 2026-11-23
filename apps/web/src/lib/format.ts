import dayjs from 'dayjs';

export const formatDate = (value?: string | null) =>
  value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-';

export const formatDuration = (ms?: number | null) => {
  if (ms === null || ms === undefined) {
    return '-';
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

export const runDuration = (run: { startedAt: string | null; finishedAt: string | null }) =>
  run.startedAt
    ? formatDuration(
        (run.finishedAt ? new Date(run.finishedAt) : new Date()).getTime() -
          new Date(run.startedAt).getTime()
      )
    : '-';

const badges: Record<string, string> = {
  GREEN: 'bg-green-900 text-green-200',
  PASSED: 'bg-green-900 text-green-200',
  OK: 'bg-green-900 text-green-200',
  RED: 'bg-red-900 text-red-200',
  FAILED: 'bg-red-900 text-red-200',
  TIMED_OUT: 'bg-red-900 text-red-200',
  ERROR: 'bg-red-900 text-red-200',
  HALTED: 'bg-red-900 text-red-200',
  INFRA: 'bg-amber-900 text-amber-200',
  PAUSED: 'bg-amber-900 text-amber-200',
  RUNNING: 'bg-blue-900 text-blue-200',
};

export const badgeClass = (value?: string | null) =>
  `rounded px-2 py-0.5 font-mono text-xs ${badges[value || ''] || 'bg-neutral-800 text-neutral-300'}`;
