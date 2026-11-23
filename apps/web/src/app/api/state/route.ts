import { NextResponse } from 'next/server';
import { prisma } from '@reliability/db/prisma';
import { isAdmin, requireSession } from '@reliability/web/lib/auth';

export const GET = async () => {
  const { session, error } = await requireSession();
  if (error) {
    return error;
  }
  const state = await prisma.systemState.findUnique({
    where: { id: 'singleton' },
  });
  return NextResponse.json({
    state,
    member: { email: session.member.email, admin: isAdmin(session) },
  });
};
