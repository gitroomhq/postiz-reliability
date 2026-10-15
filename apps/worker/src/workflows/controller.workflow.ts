import {
  CancellationScope,
  condition,
  continueAsNew,
  executeChild,
  isCancellation,
  log,
  proxyActivities,
  setHandler,
  uuid4,
} from '@temporalio/workflow';
import type * as activities from '@reliability/worker/activities';
import {
  pauseSignal,
  resumeSignal,
  runNowSignal,
} from '@reliability/worker/signals/controller.signals';
import {
  CycleRequest,
  CycleResult,
  cycleWorkflow,
} from '@reliability/worker/workflows/cycle.workflow';

const { setSystemState, getSystemStatus } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: '1 minute',
    retry: { maximumAttempts: 5 },
  }
);

const CYCLE_INTERVAL = 4 * 60 * 60 * 1000;

type Mode = 'ACTIVE' | 'PAUSED' | 'HALTED';

export async function controllerWorkflow(
  input: { mode?: Mode; reason?: string | null; nextRunAt?: number } = {}
) {
  let mode: Mode = input.mode || 'ACTIVE';
  let reason = input.reason ?? null;
  if (!input.mode) {
    const status = await getSystemStatus();
    if (status === 'PAUSED' || status === 'HALTED') {
      mode = status;
    }
  }

  let pending: CycleRequest | null = null;
  let running = false;
  let restart = false;
  let changed = true;

  setHandler(runNowSignal, () => {
    if (mode === 'ACTIVE' && !running) {
      pending = { trigger: 'MANUAL' };
    }
  });
  setHandler(pauseSignal, (data) => {
    mode = 'PAUSED';
    reason = data.reason || null;
    changed = true;
  });
  // Resume restarts the cycle even when the pause happened mid-run
  setHandler(resumeSignal, (data) => {
    mode = 'ACTIVE';
    reason = data.reason;
    pending = { trigger: 'MANUAL' };
    restart = running;
    changed = true;
  });

  let nextRunAt = input.nextRunAt || Date.now() + CYCLE_INTERVAL;

  const writeState = async () => {
    changed = false;
    await setSystemState({
      status: running ? (mode === 'ACTIVE' ? 'RUNNING' : mode) : mode === 'ACTIVE' ? 'IDLE' : mode,
      reason,
      nextRunAt: mode === 'ACTIVE' ? new Date(nextRunAt).toISOString() : null,
      ...(running ? {} : { currentRunId: null }),
    });
  };

  const runCycle = async (request: CycleRequest) => {
    running = true;
    restart = false;
    let done = false;
    let result: CycleResult | undefined;
    const scope = new CancellationScope();
    const child = scope
      .run(() =>
        executeChild(cycleWorkflow, {
          workflowId: `cycle-${uuid4()}`,
          args: [request],
        })
      )
      .then(
        (value) => {
          result = value;
        },
        (err) => {
          if (!isCancellation(err)) {
            log.error('cycle failed', { error: (err as Error).message });
          }
        }
      )
      .finally(() => {
        done = true;
      });

    while (!done) {
      await condition(() => done || restart || changed);
      if (restart && !done) {
        scope.cancel();
        await child;
      } else if (changed && !done) {
        await writeState();
      }
    }
    running = false;
    return result;
  };

  for (let i = 0; i < 100; i++) {
    if (changed) {
      await writeState();
    }

    await condition(
      () => !!pending || changed,
      Math.max(nextRunAt - Date.now(), 1000)
    );

    if (mode !== 'ACTIVE') {
      pending = null;
      continue;
    }
    if (!pending && Date.now() >= nextRunAt) {
      pending = { trigger: 'SCHEDULE' };
    }
    if (!pending) {
      continue;
    }

    const request: CycleRequest = pending;
    pending = null;
    nextRunAt = Date.now() + CYCLE_INTERVAL;
    const result = await runCycle(request);
    if (result?.halt) {
      mode = 'HALTED';
      reason = `Run ${result.runId} is red`;
    }
    changed = true;
  }

  return await continueAsNew<typeof controllerWorkflow>({
    mode,
    reason,
    nextRunAt,
  });
}
