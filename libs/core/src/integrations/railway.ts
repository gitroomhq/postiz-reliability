export const DEPLOY_SERVICES = ['Backend', 'Frontend', 'Worker'];

export type DeployState =
  | 'BUILDING'
  | 'DEPLOYING'
  | 'SUCCESS'
  | 'SKIPPED'
  | 'FAILED'
  | 'CRASHED';

export const deployPollInterval = () => 5_000;

export const getDeployStates = async (
  sha: string,
  poll: number
): Promise<Record<string, { state: DeployState; log?: string }>> => {
  const state: DeployState = poll === 0 ? 'DEPLOYING' : 'SUCCESS';
  console.log(`[railway:dry-run] ${sha.slice(0, 7)} poll ${poll}: ${state}`);
  return Object.fromEntries(DEPLOY_SERVICES.map((s) => [s, { state }]));
};
