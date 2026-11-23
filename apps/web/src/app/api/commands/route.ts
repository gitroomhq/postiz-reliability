import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@reliability/db/prisma';
import {
  CONTROLLER_WORKFLOW_ID,
  getTemporalClient,
} from '@reliability/core/temporal.client';
import { requireSession } from '@reliability/web/lib/auth';

const COMMANDS = ['runNow', 'pause', 'resume'];

export const POST = async (request: NextRequest) => {
  const { session, error } = await requireSession(true);
  if (error) {
    return error;
  }
  const body = await request.json().catch(() => ({}));
  const command = String(body.command || '');
  const reason = String(body.reason || '').trim();
  if (!COMMANDS.includes(command)) {
    return NextResponse.json({ error: 'Unknown command' }, { status: 400 });
  }
  if (command === 'resume' && !reason) {
    return NextResponse.json(
      { error: 'A reason is required to resume' },
      { status: 400 }
    );
  }

  if (command === 'runNow') {
    const state = await prisma.systemState.findUnique({
      where: { id: 'singleton' },
    });
    if (state && state.status !== 'IDLE') {
      return NextResponse.json(
        { error: `Cannot run now while the system is ${state.status.toLowerCase()}` },
        { status: 409 }
      );
    }
  }

  const client = await getTemporalClient();
  await client.workflow
    .getHandle(CONTROLLER_WORKFLOW_ID)
    .signal(command, { actor: session.actor, reason: reason || undefined });

  await prisma.auditLog.create({
    data: {
      memberId: session.member.id,
      actor: session.actor,
      action: `command.${command}`,
      reason: reason || null,
    },
  });

  return NextResponse.json({ ok: true });
};
