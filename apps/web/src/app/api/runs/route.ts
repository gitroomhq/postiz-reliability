import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@reliability/db/prisma';
import { requireSession } from '@reliability/web/lib/auth';

export const GET = async (request: NextRequest) => {
  const { error } = await requireSession();
  if (error) {
    return error;
  }
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 50, 200);
  const runs = await prisma.run.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      trigger: true,
      status: true,
      phase: true,
      verdict: true,
      classification: true,
      summary: true,
      startedAt: true,
      finishedAt: true,
      batch: { select: { headSha: true, commits: true } },
    },
  });
  return NextResponse.json(
    runs.map(({ batch, ...run }) => ({
      ...run,
      headSha: batch?.headSha || null,
      commitCount: Array.isArray(batch?.commits) ? batch.commits.length : 0,
    }))
  );
};
