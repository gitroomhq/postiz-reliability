import { SystemStatus } from '@prisma/client';
import { prisma } from '@reliability/db/prisma';

export async function setSystemState(data: {
  status: SystemStatus;
  reason?: string | null;
  nextRunAt?: string | null;
  currentRunId?: string | null;
}) {
  const update = {
    status: data.status,
    reason: data.reason ?? null,
    ...(data.nextRunAt !== undefined
      ? { nextRunAt: data.nextRunAt ? new Date(data.nextRunAt) : null }
      : {}),
    ...(data.currentRunId !== undefined
      ? { currentRunId: data.currentRunId }
      : {}),
  };
  await prisma.systemState.upsert({
    where: { id: 'singleton' },
    update,
    create: { id: 'singleton', ...update },
  });
}

export async function getSystemStatus() {
  const state = await prisma.systemState.findUnique({
    where: { id: 'singleton' },
  });
  return state?.status || SystemStatus.IDLE;
}
