const REPO = 'gitroomhq/postiz-app';

const headers = () => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'postiz-reliability',
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
});

export const githubRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!response.ok) {
    throw new Error(`GitHub ${init?.method || 'GET'} ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

const get = <T>(path: string) => githubRequest<T>(`/repos/${REPO}${path}`);

export const gammaWrites = () =>
  process.env.GAMMA_WRITES === 'true' && !!process.env.GITHUB_TOKEN;

type GitHubCommit = {
  sha: string;
  html_url: string;
  parents: Array<{ sha: string }>;
  author: { login: string } | null;
  commit: { message: string; author: { name: string } | null };
};

export type BatchCommit = {
  sha: string;
  message: string;
  author: string;
  url: string;
};

export const getBranchHead = async (branch: string) => {
  const commit = await get<GitHubCommit>(`/commits/${branch}`);
  return { sha: commit.sha, parentSha: commit.parents[0]?.sha || commit.sha };
};

export const compareCommits = async (base: string, head: string) => {
  const compare = await get<{
    commits: GitHubCommit[];
    files?: Array<{ filename: string; additions: number; deletions: number }>;
  }>(`/compare/${base}...${head}`);
  return {
    commits: compare.commits.map(
      (c): BatchCommit => ({
        sha: c.sha,
        message: c.commit.message.split('\n')[0],
        author: c.author?.login || c.commit.author?.name || 'unknown',
        url: c.html_url,
      })
    ),
    files: (compare.files || []).map((f) => ({
      filename: f.filename,
      additions: f.additions,
      deletions: f.deletions,
    })),
  };
};

export const moveGamma = async (sha: string) => {
  if (!gammaWrites()) {
    console.log(`[github:dry-run] would set refs/heads/gamma to ${sha}`);
    return { dryRun: true };
  }
  // force: a gamma that diverged from main can't be fast-forwarded
  await githubRequest(`/repos/${REPO}/git/refs/heads/gamma`, {
    method: 'PATCH',
    body: JSON.stringify({ sha, force: true }),
  });
  return { dryRun: false };
};
