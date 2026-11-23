import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@reliability/db/prisma';
import { requireSession } from '@reliability/web/lib/auth';

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { error } = await requireSession();
  if (error) {
    return error;
  }
  const { id } = await context.params;
  const run = await prisma.run.findUnique({
    where: { id },
    select: {
      id: true,
      trigger: true,
      policy: true,
      status: true,
      phase: true,
      verdict: true,
      classification: true,
      workflowId: true,
      summary: true,
      error: true,
      aiAnalysis: true,
      startedAt: true,
      finishedAt: true,
      environment: { select: { name: true } },
      batch: {
        select: { baseSha: true, headSha: true, gammaSha: true, commits: true, status: true },
      },
      scenarioRuns: {
        orderBy: [{ attempt: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          attempt: true,
          status: true,
          classification: true,
          error: true,
          durationMs: true,
          scenario: { select: { key: true, title: true, file: true, tags: true, quarantined: true } },
          steps: {
            orderBy: { index: 'asc' },
            select: { id: true, title: true, status: true, excerpt: true, durationMs: true },
          },
        },
      },
      notifications: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, channel: true, recipients: true, subject: true, status: true, error: true, createdAt: true },
      },
    },
  });
  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(run);
};
