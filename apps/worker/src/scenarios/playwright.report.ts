import { Classification, ScenarioRunStatus, StepStatus } from '@prisma/client';
import { UNAVAILABLE } from '@reliability/core/scenario.constants';

type Annotation = { type: string; description?: string };
type JsonError = { message?: string };
type JsonStep = { title: string; duration: number; error?: JsonError };
type JsonResult = {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  startTime?: string;
  errors?: JsonError[];
  steps?: JsonStep[];
  annotations?: Annotation[];
};
type JsonTest = { timeout?: number; annotations?: Annotation[]; results?: JsonResult[] };
type JsonSpec = { title: string; tags?: string[]; file: string; tests: JsonTest[] };
type JsonSuite = { title: string; file: string; specs?: JsonSpec[]; suites?: JsonSuite[] };
export type JsonReport = { suites?: JsonSuite[] };

export type ReportedScenario = {
  key: string;
  file: string;
  title: string;
  tags: string[];
  timeoutMs?: number;
  result?: {
    status: ScenarioRunStatus;
    classification: Classification | null;
    error: string | null;
    durationMs: number;
    startedAt: Date | null;
    steps: Array<{ index: number; title: string; status: StepStatus; excerpt: string | null; durationMs: number }>;
    metrics: Array<{ metric: string; value: number }>;
    cleanupFailed: string[];
  };
};

const MAX_EXCERPT = 4000;

const clean = (text?: string | null) =>
  text
    ? text.replace(/\u001b\[[0-9;]*m/g, '').slice(0, MAX_EXCERPT)
    : null;

// Playwright's grep text puts a describe's tags right after its title
export const grepFor = (title: string) =>
  title
    .split(' › ')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join(' (?:@\\S+ )*');

const statuses: Record<JsonResult['status'], ScenarioRunStatus> = {
  passed: 'PASSED',
  failed: 'FAILED',
  timedOut: 'TIMED_OUT',
  skipped: 'SKIPPED',
  interrupted: 'INTERRUPTED',
};

export const classify = (
  status: ScenarioRunStatus,
  annotations: Annotation[],
  error: string | null
): Classification | null => {
  if (status === 'PASSED') {
    return null;
  }
  const explicit = annotations
    .find((a) => a.type === 'classification')
    ?.description?.split(':')[0] as Classification | undefined;
  if (explicit && Object.values(Classification).includes(explicit)) {
    return explicit;
  }
  if (status === 'SKIPPED') {
    const reason = annotations.find((a) => a.type === 'skip')?.description || '';
    return reason.startsWith(UNAVAILABLE) ? 'INFRA' : null;
  }
  if (status === 'INTERRUPTED') {
    return 'INFRA';
  }
  const text = error || '';
  if (/\b429\b|rate.?limit|too many requests/i.test(text)) {
    return 'EXTERNAL';
  }
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|\b50[234]\b/i.test(text)) {
    return 'INFRA';
  }
  if (status === 'FAILED' && /expect\(/.test(text)) {
    return 'CODE';
  }
  return 'UNCLASSIFIED';
};

const toResult = (test: JsonTest): ReportedScenario['result'] => {
  const result = test.results?.[test.results.length - 1];
  // Runtime annotations appear on both the test and its result
  const annotations = [...(test.annotations || []), ...(result?.annotations || [])].filter(
    (a, i, all) =>
      all.findIndex((b) => b.type === a.type && b.description === a.description) === i
  );
  const status: ScenarioRunStatus = result ? statuses[result.status] : 'SKIPPED';
  const error =
    clean(result?.errors?.map((e) => e.message).filter(Boolean).join('\n\n')) ||
    (status === 'SKIPPED'
      ? annotations.find((a) => a.type === 'skip')?.description || null
      : null);

  return {
    status,
    classification: classify(status, annotations, error),
    error,
    durationMs: Math.round(result?.duration || 0),
    startedAt: result?.startTime ? new Date(result.startTime) : null,
    steps: (result?.steps || []).map((step, index) => ({
      index,
      title: step.title,
      status: step.error ? 'FAILED' : 'PASSED',
      excerpt: clean(step.error?.message),
      durationMs: Math.round(step.duration),
    })),
    metrics: annotations
      .filter((a) => a.type.startsWith('metric:') && !isNaN(Number(a.description)))
      .map((a) => ({ metric: a.type.slice('metric:'.length), value: Number(a.description) })),
    cleanupFailed: annotations
      .filter((a) => a.type === 'cleanup-failed')
      .map((a) => a.description || ''),
  };
};

export const readReport = (report: JsonReport, withResults: boolean) => {
  const scenarios: ReportedScenario[] = [];
  const walk = (suite: JsonSuite, describes: string[]) => {
    for (const spec of suite.specs || []) {
      const path = [...describes, spec.title];
      const [test] = spec.tests;
      scenarios.push({
        key: `${spec.file} › ${path.join(' › ')}`,
        file: spec.file,
        title: path.join(' › '),
        tags: spec.tags || [],
        timeoutMs: test?.timeout,
        ...(withResults && test ? { result: toResult(test) } : {}),
      });
    }
    for (const child of suite.suites || []) {
      walk(child, [...describes, child.title]);
    }
  };
  for (const fileSuite of report.suites || []) {
    walk(fileSuite, []);
  }
  return scenarios;
};
