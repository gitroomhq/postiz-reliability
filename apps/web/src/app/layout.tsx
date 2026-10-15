import './global.css';
import { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Postiz Reliability' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 text-sm">
        {children}
      </body>
    </html>
  );
}
