import { redirect } from 'next/navigation';
import {
  devLoginEnabled,
  getSession,
  googleLoginEnabled,
} from '@reliability/web/lib/auth';

const errors: Record<string, string> = {
  domain: 'Only verified @postiz.com accounts can sign in.',
  google: 'Google sign-in failed, please try again.',
  disabled: 'This account is disabled.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) {
    redirect('/');
  }
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex w-80 flex-col gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h1 className="text-lg font-semibold">Postiz Reliability</h1>
        {!!error && (
          <div className="text-red-400">{errors[error] || 'Sign-in failed.'}</div>
        )}
        {googleLoginEnabled() && (
          <a
            href="/api/auth/google"
            className="rounded bg-white px-3 py-2 text-center font-medium text-neutral-900"
          >
            Sign in with Google
          </a>
        )}
        {devLoginEnabled() && (
          <form action="/api/auth/dev" method="post" className="flex flex-col gap-2">
            <label className="text-neutral-400" htmlFor="email">
              Dev login
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="name@postiz.com"
              className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
            />
            <button className="rounded bg-neutral-700 px-3 py-2 font-medium">
              Sign in
            </button>
          </form>
        )}
        {!googleLoginEnabled() && !devLoginEnabled() && (
          <div className="text-neutral-400">No sign-in method is configured.</div>
        )}
      </div>
    </div>
  );
}
