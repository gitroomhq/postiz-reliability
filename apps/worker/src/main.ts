import { NativeConnection, Worker } from '@temporalio/worker';
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import * as activities from '@reliability/worker/activities';
import { syncScenarios } from '@reliability/worker/activities/scenario.activity';
import {
  CONTROLLER_WORKFLOW_ID,
  TASK_QUEUE,
  temporalAddress,
  temporalNamespace,
} from '@reliability/core/temporal.client';

async function bootstrap() {
  try {
    console.log(`Synced ${await syncScenarios()} scenarios`);
  } catch (err) {
    console.error('Scenario sync failed', err);
  }

  const connection = await NativeConnection.connect({
    address: temporalAddress(),
  });
  const worker = await Worker.create({
    connection,
    namespace: temporalNamespace(),
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./workflows'),
    activities,
    maxHeartbeatThrottleInterval: '15s',
  });

  const client = new Client({
    connection: await Connection.connect({ address: temporalAddress() }),
    namespace: temporalNamespace(),
  });
  try {
    await client.workflow.start('controllerWorkflow', {
      workflowId: CONTROLLER_WORKFLOW_ID,
      taskQueue: TASK_QUEUE,
      args: [{}],
    });
  } catch (err) {
    if (!(err instanceof WorkflowExecutionAlreadyStartedError)) {
      throw err;
    }
  }

  console.log(`Worker listening on task queue ${TASK_QUEUE}`);
  await worker.run();
}

bootstrap();
