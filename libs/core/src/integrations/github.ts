const REPO = 'gitroomhq/postiz-app';

const headers = () => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'postiz-reliability',
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
});

const get = async <T>(path: string): Promise<T> => {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: headers(),
  });
  if (!response.ok) {
    throw new Error(`GitHub GET ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

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
  console.log(`[github:dry-run] would set refs/heads/gamma to ${sha}`);
  return { dryRun: true };
};
