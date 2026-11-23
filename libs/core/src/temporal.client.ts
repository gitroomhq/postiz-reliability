import { Client, Connection } from '@temporalio/client';

export const CONTROLLER_WORKFLOW_ID = 'reliability-controller';
export const TASK_QUEUE = 'main';

export const temporalAddress = () =>
  process.env.TEMPORAL_ADDRESS || 'localhost:7243';
export const temporalNamespace = () =>
  process.env.TEMPORAL_NAMESPACE || 'default';

let client: Promise<Client> | undefined;

export const getTemporalClient = () => {
  if (!client) {
    client = Connection.connect({ address: temporalAddress() }).then(
      (connection) =>
        new Client({ connection, namespace: temporalNamespace() })
    );
    client.catch(() => {
      client = undefined;
    });
  }
  return client;
};
