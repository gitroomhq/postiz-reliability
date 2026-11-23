import { githubRequest } from '@reliability/core/integrations/github';

export type DeployWorkflow = { repo: string; file: string };

export type DeployStatus = {
  state: 'PENDING' | 'SUCCESS' | 'FAILED';
  detail?: string;
};

type WorkflowRun = {
  id: number;
  display_title: string;
  status: string;
  conclusion: string | null;
  html_url: string;
};

type WorkflowJob = {
  name: string;
  conclusion: string | null;
  steps?: Array<{ name: string; conclusion: string | null }>;
};

export const deployPollInterval = () => 15_000;

// Deploy runs are named after the postiz-app commit, in full or abbreviated
const namesSha = (title: string, sha: string) =>
  title.split(/[\s·]+/).some((word) => /^[0-9a-f]{7,40}$/.test(word) && sha.startsWith(word));

const failedJobs = async (repo: string, run: WorkflowRun) => {
  const { jobs } = await githubRequest<{ jobs: WorkflowJob[] }>(
    `/repos/${repo}/actions/runs/${run.id}/jobs`
  );
  return jobs
    .filter((job) => job.conclusion && !['success', 'skipped'].includes(job.conclusion))
    .map((job) => {
      const step = job.steps?.find((s) => s.conclusion === 'failure');
      return `${job.name}: ${job.conclusion}${step ? ` at "${step.name}"` : ''}`;
    });
};

export const getDeployStatus = async (
  workflow: DeployWorkflow | null,
  sha: string,
  poll: number
): Promise<DeployStatus> => {
  if (!workflow) {
    const state = poll === 0 ? 'PENDING' : 'SUCCESS';
    console.log(`[deploy:dry-run] ${sha.slice(0, 7)} poll ${poll}: ${state}`);
    return { state };
  }

  const { workflow_runs } = await githubRequest<{ workflow_runs: WorkflowRun[] }>(
    `/repos/${workflow.repo}/actions/workflows/${workflow.file}/runs?per_page=30`
  );
  const run = workflow_runs.find((r) => namesSha(r.display_title, sha));
  if (!run) {
    return { state: 'PENDING', detail: 'no deploy run yet' };
  }
  if (run.status !== 'completed') {
    return { state: 'PENDING', detail: run.status };
  }
  if (run.conclusion === 'success') {
    return { state: 'SUCCESS' };
  }
  const jobs = await failedJobs(workflow.repo, run).catch(() => []);
  return {
    state: 'FAILED',
    detail: [`Deploy run ${run.conclusion}: ${run.html_url}`, ...jobs].join('\n'),
  };
};
