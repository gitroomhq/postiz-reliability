import { NextRequest, NextResponse } from 'next/server';
import {
  googleLoginEnabled,
  isAllowedEmail,
  loginResponse,
  OAUTH_STATE_COOKIE,
} from '@reliability/web/lib/auth';
import { getGoogleUser } from '@reliability/web/lib/google';

const fail = (error: string) =>
  NextResponse.redirect(
    new URL(`/login?error=${error}`, process.env.APP_URL),
    303
  );

export const GET = async (request: NextRequest) => {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expected = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!googleLoginEnabled() || !code || !state || state !== expected) {
    return fail('google');
  }
  try {
    const user = await getGoogleUser(code);
    if (!user.verified || !isAllowedEmail(user.email)) {
      return fail('domain');
    }
    return loginResponse(user.email);
  } catch (err) {
    return fail('google');
  }
};
