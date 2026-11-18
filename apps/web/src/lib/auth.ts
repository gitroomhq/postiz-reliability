import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Member } from '@prisma/client';
import { prisma } from '@reliability/db/prisma';
import { AuthService } from '@reliability/core/auth.service';

export const AUTH_COOKIE = 'reliability_auth';

export type Session = { member: Member; scopes: string[]; actor: string };

export const isAllowedEmail = (email: string) =>
  /^[^@\s]+@postiz\.com$/i.test(email);

export const devLoginEnabled = () =>
  process.env.AUTH_DEV_LOGIN === 'true' &&
  process.env.NODE_ENV !== 'production';

export const googleLoginEnabled = () =>
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const getSession = async (): Promise<Session | null> => {
  const authorization = (await headers()).get('authorization') || '';
  if (authorization.startsWith('Bearer ')) {
    const token = await prisma.apiToken.findUnique({
      where: { hash: AuthService.hashToken(authorization.slice(7).trim()) },
      include: { member: true },
    });
    if (!token || token.revokedAt || token.member.deletedAt) {
      return null;
    }
    await prisma.apiToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
      select: { id: true },
    });
    return {
      member: token.member,
      scopes: token.scopes,
      actor: `${token.member.email} (token ${token.name})`,
    };
  }

  const cookie = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!cookie) {
    return null;
  }
  try {
    const { id } = AuthService.verifyJWT(cookie) as { id: string };
    const member = await prisma.member.findFirst({
      where: { id, deletedAt: null },
    });
    return member
      ? { member, scopes: ['read', 'admin'], actor: member.email }
      : null;
  } catch (err) {
    return null;
  }
};

export const isAdmin = (session: Session) =>
  session.member.role === 'ADMIN' && session.scopes.includes('admin');

export const requireSession = async (admin = false) => {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (admin && !isAdmin(session)) {
    return {
      error: NextResponse.json({ error: 'Admins only' }, { status: 403 }),
    };
  }
  return { session };
};

export const loginResponse = async (email: string) => {
  const member = await prisma.member.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: { email: email.toLowerCase() },
  });
  if (member.deletedAt) {
    return NextResponse.redirect(
      new URL('/login?error=disabled', process.env.APP_URL),
      303
    );
  }
  const response = NextResponse.redirect(new URL('/', process.env.APP_URL), 303);
  response.cookies.set(AUTH_COOKIE, AuthService.signJWT({ id: member.id }), {
    httpOnly: true,
    secure: (process.env.APP_URL || '').startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  });
  return response;
};
