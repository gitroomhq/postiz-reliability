'use client';

import useSWR from 'swr';
import { fetcher } from '@reliability/web/lib/fetcher';
import {
  badgeClass,
  formatDate,
  formatDuration,
  runDuration,
} from '@reliability/web/lib/format';
import { RunDetail as Run } from '@reliability/web/lib/types';

const useRun = (id: string | null) =>
  useSWR<Run>(id ? `/api/runs/${id}` : null, fetcher, {
    refreshInterval: (data) => (!data || data.status === 'RUNNING' ? 3000 : 0),
  });

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
    <h3 className="font-semibold">{title}</h3>
    {children}
  </section>
);

export const RunDetail = ({ id }: { id: string }) => {
  const { data: run, error } = useRun(id);

  if (error) {
    return <div className="text-red-400">{error.message}</div>;
  }
  if (!run) {
    return <div className="text-neutral-400">Loading run...</div>;
  }

  const attempts = [...new Set(run.scenarioRuns.map((sr) => sr.attempt))];

  return (
    <div className="flex flex-col gap-4">
      <Section title={`Run ${run.id.slice(0, 8)}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={badgeClass(run.status)}>{run.status}</span>
          {!!run.verdict && <span className={badgeClass(run.verdict)}>{run.verdict}</span>}
          {!!run.classification && (
            <span className={badgeClass(null)}>{run.classification}</span>
          )}
          {!!run.phase && <span className="text-neutral-400">phase {run.phase}</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-neutral-400 md:grid-cols-4">
          <div>Trigger: {run.trigger}</div>
          <div>Policy: {run.policy}</div>
          <div>Environment: {run.environment?.name || 'none'}</div>
          <div>Duration: {runDuration(run)}</div>
          <div>Started: {formatDate(run.startedAt)}</div>
          <div>Finished: {formatDate(run.finishedAt)}</div>
          <div className="col-span-2 truncate">Workflow: {run.workflowId || '-'}</div>
        </div>
        {!!run.summary && <pre className="whitespace-pre-wrap text-neutral-300">{run.summary}</pre>}
        {!!run.error && (
          <pre className="whitespace-pre-wrap rounded bg-red-950 p-2 text-red-200">{run.error}</pre>
        )}
      </Section>

      {!!run.aiAnalysis && (
        <Section title="AI analysis (advisory)">
          <p className="whitespace-pre-wrap text-neutral-300">{run.aiAnalysis}</p>
        </Section>
      )}

      {!!run.batch && (
        <Section title={`Batch (${run.batch.commits.length} commits, ${run.batch.status})`}>
          <div className="text-neutral-400">
            <span className="font-mono">{run.batch.baseSha?.slice(0, 7) || 'none'}</span> →{' '}
            <span className="font-mono">{run.batch.headSha.slice(0, 7)}</span>
            {!!run.batch.gammaSha && (
              <span> (gamma at <span className="font-mono">{run.batch.gammaSha.slice(0, 7)}</span>)</span>
            )}
          </div>
          <ul className="flex flex-col gap-1">
            {run.batch.commits.map((commit) => (
              <li key={commit.sha} className="flex gap-2">
                <a href={commit.url} target="_blank" rel="noreferrer" className="font-mono text-blue-400">
                  {commit.sha.slice(0, 7)}
                </a>
                <span className="truncate">{commit.message}</span>
                <span className="text-neutral-500">{commit.author}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {attempts.map((attempt) => (
        <Section
          key={attempt}
          title={attempt === 1 ? 'Scenarios' : `Confirmation re-run (attempt ${attempt})`}
        >
          <div className="flex flex-col divide-y divide-neutral-800">
            {run.scenarioRuns
              .filter((sr) => sr.attempt === attempt)
              .map((sr) => (
                <details key={sr.id} className="py-2">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={badgeClass(sr.status)}>{sr.status}</span>
                    {!!sr.classification && (
                      <span className={badgeClass(null)}>{sr.classification}</span>
                    )}
                    <span>{sr.scenario.title}</span>
                    <span className="text-neutral-500">{sr.scenario.file}</span>
                    {sr.scenario.quarantined && <span className="text-amber-400">quarantined</span>}
                    <span className="ms-auto text-neutral-500">{formatDuration(sr.durationMs)}</span>
                  </summary>
                  <div className="flex flex-col gap-2 ps-4 pt-2">
                    {!!sr.error && (
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-2 text-neutral-300">
                        {sr.error}
                      </pre>
                    )}
                    {!sr.steps.length && <div className="text-neutral-500">No steps recorded.</div>}
                    {sr.steps.map((step) => (
                      <div key={step.id} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className={badgeClass(step.status)}>{step.status}</span>
                          <span>{step.title}</span>
                          <span className="ms-auto text-neutral-500">{formatDuration(step.durationMs)}</span>
                        </div>
                        {!!step.excerpt && (
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-2 text-neutral-400">
                            {step.excerpt}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
          </div>
        </Section>
      ))}

      {!!run.notifications.length && (
        <Section title="Notifications">
          {run.notifications.map((n) => (
            <div key={n.id} className="flex flex-wrap items-center gap-2">
              <span className={badgeClass(n.status === 'FAILED' ? 'FAILED' : null)}>{n.status}</span>
              <span>{n.subject}</span>
              <span className="text-neutral-500">
                {n.channel} to {n.recipients.join(', ') || 'nobody'} at {formatDate(n.createdAt)}
              </span>
              {!!n.error && <span className="text-red-400">{n.error}</span>}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
};
