import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@reliability/web/lib/auth';

export const POST = async () => {
  const response = NextResponse.redirect(
    new URL('/login', process.env.APP_URL),
    303
  );
  response.cookies.delete(AUTH_COOKIE);
  return response;
};
