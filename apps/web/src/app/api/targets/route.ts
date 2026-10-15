import { NextResponse } from 'next/server';
import { prisma } from '@reliability/db/prisma';
import { getPlatform } from '@reliability/core/platforms/platform.list';
import { requireSession } from '@reliability/web/lib/auth';

export const GET = async () => {
  const { error } = await requireSession();
  if (error) {
    return error;
  }
  const environments = await prisma.environment.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      apiUrl: true,
      testUsers: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          channels: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              provider: true,
              integrationId: true,
              credentials: true,
              health: true,
              healthError: true,
              healthCheckedAt: true,
            },
          },
        },
      },
    },
  });

  const changes = await prisma.auditLog.findMany({
    where: { action: { in: ['channel.credentials.set', 'channel.credentials.clear'] } },
    orderBy: { createdAt: 'desc' },
    select: { actor: true, data: true, createdAt: true },
  });
  const lastChange = (channelId: string) =>
    changes.find((c) => (c.data as { channelId?: string } | null)?.channelId === channelId);

  return NextResponse.json(
    environments.map((environment) => ({
      ...environment,
      testUsers: environment.testUsers.map((testUser) => ({
        ...testUser,
        channels: testUser.channels.map(({ credentials, ...channel }) => {
          const change = lastChange(channel.id);
          return {
            ...channel,
            credentialsSet: !!credentials,
            credentialsChangedBy: change?.actor || null,
            credentialsChangedAt: change?.createdAt || null,
            fields: getPlatform(channel.provider)?.fields || [],
          };
        }),
      })),
    }))
  );
};
