import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@reliability/db/prisma';
import { AuthService } from '@reliability/core/auth.service';
import { getPlatform } from '@reliability/core/platforms/platform.list';
import { requireSession } from '@reliability/web/lib/auth';

export const POST = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { session, error } = await requireSession(true);
  if (error) {
    return error;
  }
  const { id } = await context.params;
  const channel = await prisma.testChannel.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, provider: true },
  });
  const platform = channel && getPlatform(channel.provider);
  if (!channel || !platform) {
    return NextResponse.json(
      { error: 'This channel has no credentials the system can use' },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (body.clear) {
    await prisma.testChannel.update({
      where: { id },
      data: { credentials: null },
      select: { id: true },
    });
    await prisma.auditLog.create({
      data: {
        memberId: session.member.id,
        actor: session.actor,
        action: 'channel.credentials.clear',
        data: { channelId: id, provider: channel.provider },
      },
    });
    return NextResponse.json({ ok: true });
  }

  const credentials: Record<string, string> = {};
  for (const field of platform.fields) {
    const value = String(body.credentials?.[field.key] || '').trim();
    if (!value) {
      return NextResponse.json({ error: `${field.label} is required` }, { status: 400 });
    }
    credentials[field.key] = value;
  }

  const check = await platform.check(credentials);
  if (!check.ok) {
    return NextResponse.json(
      { error: `Not saved: ${check.error || 'the account check failed'}` },
      { status: 400 }
    );
  }

  await prisma.testChannel.update({
    where: { id },
    data: {
      credentials: AuthService.fixedEncryption(JSON.stringify(credentials)),
      health: 'OK',
      healthError: null,
      healthCheckedAt: new Date(),
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: {
      memberId: session.member.id,
      actor: session.actor,
      action: 'channel.credentials.set',
      data: { channelId: id, provider: channel.provider, fields: Object.keys(credentials) },
    },
  });
  return NextResponse.json({ ok: true });
};
