import { NextRequest, NextResponse } from 'next/server';
import { devLoginEnabled, isAllowedEmail, loginResponse } from '@reliability/web/lib/auth';

export const POST = async (request: NextRequest) => {
  if (!devLoginEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const email = String((await request.formData()).get('email') || '').trim();
  if (!isAllowedEmail(email)) {
    return NextResponse.redirect(
      new URL('/login?error=domain', process.env.APP_URL),
      303
    );
  }
  return loginResponse(email);
};
