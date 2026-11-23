import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@reliability/db/prisma';
import { requireSession } from '@reliability/web/lib/auth';

const METRICS = [
  'publish_success',
  'publish_latency_ms',
  'scheduling_lateness_ms',
  'run_duration_ms',
];

export const GET = async (request: NextRequest) => {
  const { error } = await requireSession();
  if (error) {
    return error;
  }
  const days = Math.min(Number(request.nextUrl.searchParams.get('days')) || 30, 365);
  const points = await prisma.dataPoint.findMany({
    where: {
      metric: { in: METRICS },
      ts: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    },
    orderBy: { ts: 'asc' },
    select: { metric: true, ts: true, value: true, release: true, runId: true },
  });
  return NextResponse.json(
    METRICS.map((metric) => ({
      metric,
      points: points.filter((p) => p.metric === metric),
    }))
  );
};
