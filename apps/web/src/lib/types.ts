export type RunListItem = {
  id: string;
  trigger: string;
  status: string;
  phase: string | null;
  verdict: string | null;
  classification: string | null;
  summary: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  headSha: string | null;
  commitCount: number;
};

export type BatchCommit = { sha: string; message: string; author: string; url: string };

export type RunDetail = Omit<RunListItem, 'headSha' | 'commitCount'> & {
  policy: string;
  workflowId: string | null;
  error: string | null;
  aiAnalysis: string | null;
  environment: { name: string } | null;
  batch: {
    baseSha: string | null;
    headSha: string;
    gammaSha: string | null;
    commits: BatchCommit[];
    status: string;
  } | null;
  scenarioRuns: Array<{
    id: string;
    attempt: number;
    status: string;
    classification: string | null;
    error: string | null;
    durationMs: number | null;
    scenario: { key: string; title: string; file: string; tags: string[]; quarantined: boolean };
    steps: Array<{ id: string; title: string; status: string; excerpt: string | null; durationMs: number | null }>;
  }>;
  notifications: Array<{
    id: string;
    channel: string;
    recipients: string[];
    subject: string;
    status: string;
    error: string | null;
    createdAt: string;
  }>;
};
