import {
  CancellationScope,
  isCancellation,
  proxyActivities,
  workflowInfo,
} from '@temporalio/workflow';
import type * as activities from '@reliability/worker/activities';

const {
  createRun,
  resolveBatch,
  moveGamma,
  checkPreconditions,
  recordVerdict,
  finishRun,
  analyzeRun,
  notifyRed,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3, initialInterval: '10 seconds' },
});

const { awaitDeploy } = proxyActivities<typeof activities>({
  startToCloseTimeout: '50 minutes',
  heartbeatTimeout: '2 minutes',
  retry: { maximumAttempts: 3, initialInterval: '30 seconds' },
});

// A retry would publish real posts again; confirmation re-runs are explicit
const { runScenarios } = proxyActivities<typeof activities>({
  startToCloseTimeout: '90 minutes',
  heartbeatTimeout: '2 minutes',
  retry: { maximumAttempts: 1 },
});

export type CycleRequest = { trigger: 'SCHEDULE' | 'MANUAL' };
export type CycleResult = { runId: string; verdict: string | null; halt: boolean };

export async function cycleWorkflow(request: CycleRequest): Promise<CycleResult> {
  const runId = await createRun({
    trigger: request.trigger,
    workflowId: workflowInfo().workflowId,
  });

  try {
    const batch = await resolveBatch({ runId });
    if (!batch) {
      return { runId, verdict: 'NO_CHANGES', halt: false };
    }

    await moveGamma({ runId, ...batch });
    const deploy = await awaitDeploy({ runId, headSha: batch.headSha });

    let skipped: string | null = null;
    let failing: string[] = [];
    let first: Awaited<ReturnType<typeof runScenarios>>['outcomes'] = [];
    let confirmations: typeof first = [];

    if (deploy.ok) {
      const preconditions = await checkPreconditions({ runId });
      failing = preconditions.failing;
      const firstRun = await runScenarios({ runId, attempt: 1 });
      skipped = firstRun.skipped || null;
      first = firstRun.outcomes;

      const toConfirm = first
        .filter((o) => o.status === 'FAILED' || o.status === 'TIMED_OUT')
        .map((o) => o.scenarioId);
      if (toConfirm.length) {
        confirmations = (await runScenarios({ runId, attempt: 2, scenarioIds: toConfirm }))
          .outcomes;
      }
    }

    const verdict = await recordVerdict({
      runId,
      batchId: batch.batchId,
      headSha: batch.headSha,
      deploy,
      skipped,
      failing,
      first,
      confirmations,
    });

    if (verdict.verdict === 'RED') {
      await analyzeRun({ runId }).catch(() => undefined);
      await notifyRed({ runId });
    }

    return { runId, verdict: verdict.verdict, halt: verdict.halt };
  } catch (err) {
    if (isCancellation(err)) {
      await CancellationScope.nonCancellable(() =>
        finishRun({ runId, status: 'CANCELLED' })
      );
      throw err;
    }
    await finishRun({ runId, status: 'ERROR', error: (err as Error).message });
    return { runId, verdict: null, halt: false };
  }
}
