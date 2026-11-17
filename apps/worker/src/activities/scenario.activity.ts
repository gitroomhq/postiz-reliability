import { spawn } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { Context } from '@temporalio/activity';
import { prisma } from '@reliability/db/prisma';
import { AuthService } from '@reliability/core/auth.service';
import { NO_TARGET } from '@reliability/core/scenario.constants';
import {
  JsonReport,
  ReportedScenario,
  grepFor,
  readReport,
} from '@reliability/worker/scenarios/playwright.report';
import {
  setHeartbeatDetails,
  withHeartbeat,
} from '@reliability/worker/temporal.heartbeat';

// The worker always runs from apps/worker (pnpm --filter)
const ROOT = resolve(process.cwd(), '../..');
const CONFIG = join(ROOT, 'scenarios', 'playwright.config.ts');

export type ScenarioOutcome = {
  scenarioId: string;
  key: string;
  quarantined: boolean;
  tags: string[];
  attempt: number;
  status: string;
  classification: string | null;
  error: string | null;
  metrics: Array<{ metric: string; value: number }>;
  cleanupFailed: string[];
};

const playwright = (
  args: string[],
  env: Record<string, string>,
  signal?: AbortSignal
) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (done, fail) => {
      // Only what the specs need: the worker's own secrets stay out of the child
      const child = spawn(
        process.execPath,
        [require.resolve('@playwright/test/cli'), 'test', '--config', CONFIG, ...args],
        {
          cwd: ROOT,
          env: { PATH: process.env.PATH || '', HOME: process.env.HOME || '', CI: '1', ...env },
          signal,
        }
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('error', fail);
      child.on('close', (code) => done({ code, stdout, stderr }));
    }
  );

const upsertScenarios = async (scenarios: ReportedScenario[]) => {
  const rows = [];
  for (const s of scenarios) {
    rows.push(
      await prisma.scenario.upsert({
        where: { key: s.key },
        update: {
          file: s.file,
          title: s.title,
          tags: s.tags,
          timeoutMs: s.timeoutMs ?? null,
          active: true,
          lastSyncedAt: new Date(),
        },
        create: {
          key: s.key,
          file: s.file,
          title: s.title,
          tags: s.tags,
          timeoutMs: s.timeoutMs ?? null,
        },
      })
    );
  }
  return rows;
};

export async function syncScenarios() {
  const { code, stdout, stderr } = await playwright(['--list', '--reporter=json'], {});
  if (code !== 0) {
    throw new Error(`playwright --list failed: ${stderr.slice(-2000)}`);
  }
  const scenarios = readReport(JSON.parse(stdout) as JsonReport, false);
  await upsertScenarios(scenarios);
  await prisma.scenario.updateMany({
    where: { key: { notIn: scenarios.map((s) => s.key) } },
    data: { active: false },
  });
  return scenarios.length;
}

const loadTarget = async (environmentId: string | null) => {
  if (!environmentId) {
    return null;
  }
  const environment = await prisma.environment.findFirst({
    where: { id: environmentId, deletedAt: null },
    include: {
      testUsers: {
        where: { deletedAt: null },
        include: { channels: { where: { deletedAt: null } } },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  const [testUser] = environment?.testUsers || [];
  return environment && testUser ? { environment, testUser } : null;
};

export async function runScenarios(input: {
  runId: string;
  attempt: number;
  scenarioIds?: string[];
}): Promise<{ skipped?: string; outcomes: ScenarioOutcome[] }> {
  const run = await prisma.run.findUniqueOrThrow({ where: { id: input.runId } });
  const scenarios = await prisma.scenario.findMany({
    where: {
      active: true,
      ...(input.scenarioIds ? { id: { in: input.scenarioIds } } : {}),
    },
  });

  if (input.scenarioIds && !scenarios.length) {
    return { outcomes: [] };
  }

  const target = await loadTarget(run.environmentId);
  if (!target) {
    await prisma.scenarioRun.createMany({
      data: scenarios.map((s) => ({
        runId: run.id,
        scenarioId: s.id,
        attempt: input.attempt,
        status: 'SKIPPED' as const,
        error: NO_TARGET,
      })),
    });
    return { skipped: NO_TARGET, outcomes: [] };
  }

  const { environment, testUser } = target;
  const channels = testUser.channels
    .filter((c) => c.health !== 'FAILING' && c.health !== 'DISABLED')
    .map((c) => ({
      provider: c.provider,
      id: c.integrationId,
      ...(c.credentials
        ? { credentials: JSON.parse(AuthService.fixedDecryption(c.credentials)) }
        : {}),
    }));

  const reportFile = join(tmpdir(), `reliability-${run.id}-${input.attempt}.json`);
  rmSync(reportFile, { force: true });

  const grep = input.scenarioIds
    ? scenarios.map((s) => grepFor(s.title)).join('|')
    : '';

  setHeartbeatDetails(`playwright: ${grep ? 'confirm re-run' : 'all scenarios'}`);
  const { stderr } = await withHeartbeat(() =>
    playwright(
      ['--reporter=json', ...(grep ? ['--grep', grep] : [])],
      {
        POSTIZ_SMOKE_URL: environment.apiUrl,
        POSTIZ_SMOKE_API_KEY: AuthService.fixedDecryption(testUser.apiKey),
        POSTIZ_SMOKE_MCP_URL: environment.mcpUrl || '',
        POSTIZ_SMOKE_CHANNELS: JSON.stringify(channels),
        RELIABILITY_FORCE_FAIL: JSON.stringify(
          scenarios.filter((s) => s.forceFail).map((s) => s.title)
        ),
        RELIABILITY_RUN_ID: `${run.id.slice(0, 8)}-${input.attempt}`,
        PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
      },
      Context.current().cancellationSignal
    )
  );

  if (!existsSync(reportFile)) {
    throw new Error(`playwright produced no report: ${stderr.slice(-2000)}`);
  }
  const reported = readReport(
    JSON.parse(readFileSync(reportFile, 'utf8')) as JsonReport,
    true
  );
  rmSync(reportFile, { force: true });

  const rows = await upsertScenarios(reported);
  const outcomes: ScenarioOutcome[] = [];
  for (const [i, scenario] of reported.entries()) {
    const result = scenario.result!;
    const row = rows[i];
    await prisma.scenarioRun.create({
      data: {
        runId: run.id,
        scenarioId: row.id,
        attempt: input.attempt,
        status: result.status,
        classification: result.classification,
        error: result.error,
        durationMs: result.durationMs,
        startedAt: result.startedAt,
        steps: { create: result.steps },
      },
      select: { id: true },
    });
    outcomes.push({
      scenarioId: row.id,
      key: row.key,
      quarantined: row.quarantined,
      tags: row.tags,
      attempt: input.attempt,
      status: result.status,
      classification: result.classification,
      error: result.error,
      metrics: result.metrics,
      cleanupFailed: result.cleanupFailed,
    });
  }
  return { outcomes };
}
