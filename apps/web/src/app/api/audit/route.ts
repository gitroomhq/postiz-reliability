import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@reliability/db/prisma';
import { requireSession } from '@reliability/web/lib/auth';

export const GET = async (request: NextRequest) => {
  const { error } = await requireSession();
  if (error) {
    return error;
  }
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 100, 500);
  return NextResponse.json(
    await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, actor: true, action: true, reason: true, data: true, createdAt: true },
    })
  );
};
