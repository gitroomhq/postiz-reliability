export const analyzeFailures = async (_input: {
  commits: Array<{ sha: string; message: string; author: string }>;
  files: Array<{ filename: string; additions: number; deletions: number }>;
  failures: Array<{ key: string; error: string | null }>;
}) =>
  'AI analysis is not configured yet: this is the stub text. It is advisory only and never decides halts.';
