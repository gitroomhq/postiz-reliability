import { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@reliability/web/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-6 border-b border-neutral-800 px-6 py-3">
        <Link href="/" className="font-semibold">
          Postiz Reliability
        </Link>
        <nav className="flex gap-4 text-neutral-400">
          <Link href="/" className="hover:text-neutral-100">Overview</Link>
          <Link href="/runs" className="hover:text-neutral-100">Runs</Link>
          <Link href="/slis" className="hover:text-neutral-100">SLIs</Link>
          <Link href="/targets" className="hover:text-neutral-100">Test targets</Link>
          <Link href="/audit" className="hover:text-neutral-100">Audit log</Link>
        </nav>
        <div className="flex-1" />
        <div className="text-neutral-400">
          {session.member.email} ({session.member.role.toLowerCase()})
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="text-neutral-400 hover:text-neutral-100">Sign out</button>
        </form>
      </header>
      <main className="flex flex-1 flex-col gap-6 p-6">{children}</main>
    </div>
  );
}
