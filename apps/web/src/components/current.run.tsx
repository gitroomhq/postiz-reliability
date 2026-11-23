'use client';

import { useSystemState } from '@reliability/web/components/state.controls';
import { RunDetail } from '@reliability/web/components/run.detail';

export const CurrentRun = () => {
  const { data } = useSystemState();
  const currentRunId = data?.state?.currentRunId;

  if (!currentRunId) {
    return (
      <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-neutral-400">
        No run in progress.
      </section>
    );
  }
  return <RunDetail id={currentRunId} />;
};
