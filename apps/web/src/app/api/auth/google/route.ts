import { NextResponse } from 'next/server';
import { googleLoginEnabled } from '@reliability/web/lib/auth';
import { generateLink } from '@reliability/web/lib/google';

export const GET = async () => {
  if (!googleLoginEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.redirect(generateLink());
};
