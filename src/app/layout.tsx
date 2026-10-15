import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { siteName } from '@/lib/mail';
import './globals.css';

export function generateMetadata(): Metadata {
  return {
    title: { default: siteName(), template: `%s · ${siteName()}` },
    description: 'Open letters with signatures that are verified by the people who sign them.',
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-head">
          <Link href="/" className="wordmark">
            <span className="seal" aria-hidden="true" />
            {siteName()}
          </Link>
          <nav>
            <Link href="/about">How verification works</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-foot">
          <span>
            Runs on {process.env.SOURCE_URL ? <a href={process.env.SOURCE_URL}>Countersign</a> : 'Countersign'}, open source
            software for open letters.
          </span>
          <span>
            <Link href="/about">About</Link> · <Link href="/admin">Organisers</Link>
          </span>
        </footer>
      </body>
    </html>
  );
}
