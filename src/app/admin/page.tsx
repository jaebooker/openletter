import { desc, sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { adminLogout } from '@/app/actions';
import { db } from '@/db';
import { letters } from '@/db/schema';
import { adminConfigured, isAdmin } from '@/lib/auth';
import { LetterForm, LoginForm } from './forms';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Organisers', robots: { index: false } };

export default async function Admin() {
  if (!adminConfigured()) {
    return (
      <>
        <h1>Organiser access is off</h1>
        <p>
          Set the <code>ADMIN_PASSWORD</code> environment variable and restart the server to manage letters.
        </p>
      </>
    );
  }
  if (!(await isAdmin())) {
    return (
      <>
        <h1>Organisers</h1>
        <LoginForm />
      </>
    );
  }

  const d = await db();
  const rows = await d
    .select({
      id: letters.id,
      slug: letters.slug,
      title: letters.title,
      status: letters.status,
      verified: sql<number>`(select count(*)::int from signers where signers.letter_id = letters.id and signers.status = 'verified')`,
      flagged: sql<number>`(select count(*)::int from signers where signers.letter_id = letters.id and signers.status = 'verified' and signers.flagged)`,
    })
    .from(letters)
    .orderBy(desc(letters.createdAt));

  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Letters</h1>
        <form action={adminLogout}>
          <button className="quiet">Sign out</button>
        </form>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Letter</th>
              <th>Status</th>
              <th>Signatures</th>
              <th>Held back</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="wrap">
                  <Link href={`/admin/l/${l.id}`}>{l.title}</Link>
                </td>
                <td>{l.status}</td>
                <td className="num">{l.verified}</td>
                <td className="num">{l.flagged || ''}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4}>No letters yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h2>New letter</h2>
      <LetterForm />
    </>
  );
}
