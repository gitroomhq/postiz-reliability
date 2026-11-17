import { setTimeout as sleep } from 'timers/promises';
import { Classification, RunPhase, RunStatus, RunTrigger, Verdict } from '@prisma/client';
import { prisma } from '@reliability/db/prisma';
import { AuthService } from '@reliability/core/auth.service';
import { NO_TARGET } from '@reliability/core/scenario.constants';
import { getPlatform } from '@reliability/core/platforms/platform.list';
import {
  compareCommits,
  gammaWrites,
  getBranchHead,
  moveGamma as moveGammaRef,
} from '@reliability/core/integrations/github';
import {
  deployPollInterval,
  getDeployStatus,
} from '@reliability/core/integrations/deploy';
import { listIntegrations } from '@reliability/core/integrations/postiz';
import type { ScenarioOutcome } from '@reliability/worker/activities/scenario.activity';
import {
  setHeartbeatDetails,
  withHeartbeat,
} from '@reliability/worker/temporal.heartbeat';

const DEPLOY_TIMEOUT = 45 * 60_000;
const FAILED = ['FAILED', 'TIMED_OUT'];
const RED_CLASSES: Array<string | null> = ['CODE', 'UNCLASSIFIED'];

// An activity can outlive its cancelled cycle until its next heartbeat
const setPhase = (runId: string, phase: RunPhase) =>
  prisma.run.updateMany({ where: { id: runId, status: 'RUNNING' }, data: { phase } });

export async function createRun(input: {
  trigger: RunTrigger;
  workflowId: string;
}) {
  const environment = await prisma.environment.findFirst({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const run = await prisma.run.create({
    data: {
      trigger: input.trigger,
      environmentId: environment?.id,
      workflowId: input.workflowId,
      status: 'RUNNING',
      phase: 'RESOLVE_BATCH',
      startedAt: new Date(),
    },
    select: { id: true },
  });
  await prisma.systemState.upsert({
    where: { id: 'singleton' },
    update: { status: 'RUNNING', currentRunId: run.id },
    create: { id: 'singleton', status: 'RUNNING', currentRunId: run.id },
  });
  return run.id;
}

export async function resolveBatch(input: { runId: string }) {
  const state = await prisma.systemState.findUnique({ where: { id: 'singleton' } });
  const head = await getBranchHead('main');
  const baseSha = state?.lastGreenSha || null;

  if (baseSha === head.sha) {
    const batch = await prisma.batch.create({
      data: { baseSha, headSha: head.sha, commits: [], status: 'NO_CHANGES' },
      select: { id: true },
    });
    await prisma.run.update({
      where: { id: input.runId },
      data: {
        batchId: batch.id,
        status: 'SKIPPED',
        verdict: 'NO_CHANGES',
        phase: 'DONE',
        summary: 'No new commits on main since the last green run.',
        finishedAt: new Date(),
      },
      select: { id: true },
    });
    return null;
  }

  const { commits } = await compareCommits(baseSha || head.parentSha, head.sha);
  const batch = await prisma.batch.create({
    data: { baseSha, headSha: head.sha, commits, status: 'TESTING' },
    select: { id: true },
  });
  await prisma.run.update({
    where: { id: input.runId },
    data: { batchId: batch.id, phase: 'MOVE_GAMMA' },
    select: { id: true },
  });
  return { batchId: batch.id, headSha: head.sha };
}

export async function moveGamma(input: { runId: string; batchId: string; headSha: string }) {
  await moveGammaRef(input.headSha);
  await prisma.batch.update({
    where: { id: input.batchId },
    data: { gammaSha: input.headSha },
    select: { id: true },
  });
  await setPhase(input.runId, 'AWAIT_DEPLOY');
}

export async function awaitDeploy(input: { runId: string; headSha: string }) {
  const { environment } = await prisma.run.findUniqueOrThrow({
    where: { id: input.runId },
    select: { environment: { select: { deployRepo: true, deployWorkflow: true } } },
  });
  // Without a real gamma move there is no deploy run to wait for
  const workflow =
    gammaWrites() && environment?.deployRepo && environment.deployWorkflow
      ? { repo: environment.deployRepo, file: environment.deployWorkflow }
      : null;
  return withHeartbeat(async () => {
    const started = Date.now();
    for (let poll = 0; Date.now() - started < DEPLOY_TIMEOUT; poll++) {
      const status = await getDeployStatus(workflow, input.headSha, poll).catch(
        (err: Error) => ({ state: 'PENDING' as const, detail: err.message })
      );
      setHeartbeatDetails(
        `deploy ${input.headSha.slice(0, 7)}: ${status.state}${status.detail ? ` (${status.detail})` : ''}`
      );
      if (status.state === 'FAILED') {
        return { ok: false, error: status.detail || 'Deploy failed' };
      }
      if (status.state === 'SUCCESS') {
        await setPhase(input.runId, 'PRECONDITIONS');
        return { ok: true, error: null };
      }
      await sleep(deployPollInterval());
    }
    return { ok: false, error: `No successful deploy of ${input.headSha} within 45 minutes` };
  });
}

export async function checkPreconditions(input: { runId: string }) {
  const run = await prisma.run.findUniqueOrThrow({ where: { id: input.runId } });
  const testUser = run.environmentId
    ? await prisma.testUser.findFirst({
        where: { environmentId: run.environmentId, deletedAt: null },
        include: { environment: true, channels: { where: { deletedAt: null } } },
        orderBy: { createdAt: 'asc' },
      })
    : null;
  await setPhase(input.runId, 'SCENARIOS');
  if (!testUser) {
    return { skipped: NO_TARGET, failing: [] as string[] };
  }

  const integrations = await listIntegrations(
    testUser.environment.apiUrl,
    AuthService.fixedDecryption(testUser.apiKey)
  ).catch((err: Error) => err);

  const failing: string[] = [];
  for (const channel of testUser.channels) {
    let error: string | null = null;
    if (integrations instanceof Error) {
      error = integrations.message;
    } else {
      const integration = integrations.find((i) => i.id === channel.integrationId);
      if (!integration || integration.disabled) {
        error = integration ? 'disabled in Postiz' : 'not found in Postiz';
      }
    }
    const platform = getPlatform(channel.provider);
    if (!error && platform && channel.credentials) {
      const check = await platform.check(
        JSON.parse(AuthService.fixedDecryption(channel.credentials))
      );
      error = check.ok ? null : check.error || 'platform check failed';
    }
    if (error) {
      failing.push(`${channel.provider}: ${error}`);
    }
    await prisma.testChannel.update({
      where: { id: channel.id },
      data: { health: error ? 'FAILING' : 'OK', healthError: error, healthCheckedAt: new Date() },
      select: { id: true },
    });
  }
  return { skipped: null, failing };
}

export async function recordVerdict(input: {
  runId: string;
  batchId: string;
  headSha: string;
  deploy: { ok: boolean; error: string | null };
  skipped: string | null;
  failing: string[];
  first: ScenarioOutcome[];
  confirmations: ScenarioOutcome[];
}) {
  const confirmed = new Map(input.confirmations.map((o) => [o.scenarioId, o]));
  const final = input.first.map((o) => confirmed.get(o.scenarioId) || o);
  const gating = final.filter((o) => !o.quarantined);
  const red = gating.filter(
    (o) => FAILED.includes(o.status) && RED_CLASSES.includes(o.classification)
  );
  const flaky = input.first.filter(
    (o) => FAILED.includes(o.status) && confirmed.get(o.scenarioId)?.status === 'PASSED'
  );

  let verdict: Verdict;
  let classification: Classification | null = null;
  if (!input.deploy.ok) {
    verdict = 'RED';
    classification = 'INFRA';
  } else if (red.length) {
    verdict = 'RED';
    classification = red.some((o) => o.classification === 'CODE') ? 'CODE' : 'UNCLASSIFIED';
  } else if (
    input.skipped ||
    gating.some((o) => FAILED.includes(o.status)) ||
    !gating.some((o) => o.status === 'PASSED')
  ) {
    verdict = 'INFRA';
  } else {
    verdict = 'GREEN';
  }

  const count = (status: string) => final.filter((o) => o.status === status).length;
  const summary = [
    input.skipped
      ? `Scenarios skipped: ${input.skipped}.`
      : `${count('PASSED')} passed, ${count('FAILED') + count('TIMED_OUT')} failed, ${count('SKIPPED')} skipped.`,
    ...(input.failing.length ? [`Failing preconditions: ${input.failing.join('; ')}.`] : []),
    ...(flaky.length ? [`Passed on confirmation: ${flaky.map((o) => o.key).join('; ')}.`] : []),
    ...final.flatMap((o) => o.cleanupFailed.map((c) => `Cleanup failed: ${c}.`)),
  ].join('\n');

  const run = await prisma.run.findUniqueOrThrow({ where: { id: input.runId } });
  const finishedAt = new Date();
  const release = input.headSha;

  await prisma.dataPoint.createMany({
    data: [
      ...final
        .filter((o) => o.tags.includes('publish') && o.status !== 'SKIPPED')
        .map((o) => ({
          metric: 'publish_success',
          dimensions: { scenario: o.key },
          ts: finishedAt,
          value: o.status === 'PASSED' ? 1 : 0,
          release,
          runId: run.id,
        })),
      ...final.flatMap((o) =>
        o.metrics.map((m) => ({
          metric: m.metric,
          dimensions: { scenario: o.key },
          ts: finishedAt,
          value: m.value,
          release,
          runId: run.id,
        }))
      ),
      ...(run.startedAt
        ? [
            {
              metric: 'run_duration_ms',
              dimensions: { verdict },
              ts: finishedAt,
              value: finishedAt.getTime() - run.startedAt.getTime(),
              release,
              runId: run.id,
            },
          ]
        : []),
    ],
  });

  await prisma.run.update({
    where: { id: run.id },
    data: {
      status: 'COMPLETED',
      phase: verdict === 'RED' ? 'NOTIFY' : 'DONE',
      verdict,
      classification,
      summary,
      error: input.deploy.ok ? null : input.deploy.error,
      finishedAt,
    },
    select: { id: true },
  });
  await prisma.batch.update({
    where: { id: input.batchId },
    data: {
      status: verdict === 'GREEN' ? 'GREEN' : verdict === 'RED' ? 'RED' : 'INCONCLUSIVE',
    },
    select: { id: true },
  });
  if (verdict === 'GREEN') {
    await prisma.systemState.update({
      where: { id: 'singleton' },
      data: { lastGreenSha: input.headSha },
      select: { id: true },
    });
  }

  return { verdict, classification, halt: verdict === 'RED' && RED_CLASSES.includes(classification) };
}

export async function finishRun(input: { runId: string; status: RunStatus; error?: string }) {
  const run = await prisma.run.update({
    where: { id: input.runId },
    data: {
      status: input.status,
      phase: 'DONE',
      error: input.error || null,
      finishedAt: new Date(),
    },
    select: { batchId: true },
  });
  if (run.batchId && input.status === 'CANCELLED') {
    await prisma.batch.update({
      where: { id: run.batchId },
      data: { status: 'CANCELLED' },
      select: { id: true },
    });
  }
}
