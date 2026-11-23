import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { googleLoginEnabled, OAUTH_STATE_COOKIE } from '@reliability/web/lib/auth';
import { generateLink } from '@reliability/web/lib/google';

export const GET = async () => {
  if (!googleLoginEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const state = crypto.randomBytes(16).toString('hex');
  const response = NextResponse.redirect(generateLink(state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: (process.env.APP_URL || '').startsWith('https://'),
    sameSite: 'lax',
    path: '/api/auth/google',
    maxAge: 600,
  });
  return response;
};
