import { asc, desc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { moderateSigner, recomputeNow } from '@/app/actions';
import { db } from '@/db';
import { letters, signers } from '@/db/schema';
import { isAdmin } from '@/lib/auth';
import { LetterForm, SeedForm } from '../../forms';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit letter', robots: { index: false } };

function Op({ id, op, children }: { id: number; op: string; children: React.ReactNode }) {
  return (
    <form action={moderateSigner}>
      <input type="hidden" name="id" value={id} />
      <button name="op" value={op} className="quiet small">
        {children}
      </button>
    </form>
  );
}

export default async function AdminLetter({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect('/admin');
  const d = await db();
  const [letter] = await d.select().from(letters).where(eq(letters.id, Number((await params).id) || 0));
  if (!letter) notFound();
  const rows = await d
    .select()
    .from(signers)
    .where(eq(signers.letterId, letter.id))
    .orderBy(desc(signers.flagged), asc(signers.status), desc(signers.notability), asc(signers.id));

  return (
    <div className="wide">
      <p className="sans">
        <small>
          <Link href="/admin">All letters</Link> · <Link href={`/l/${letter.slug}`}>View public page</Link>
        </small>
      </p>
      <h1>{letter.title}</h1>
      <LetterForm letter={letter} />

      <h2>Initial signatories</h2>
      <p className="muted">
        People you know are real. They appear on the letter straight away and every other signer&apos;s trust is measured
        from them. Add several before you publish.
      </p>
      <SeedForm letterId={letter.id} />

      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <h2>Signers ({rows.length})</h2>
        <form action={recomputeNow}>
          <input type="hidden" name="letterId" value={letter.id} />
          <button className="quiet small">Recalculate scores</button>
        </form>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>State</th>
              <th title="Weight of this signer's judgements, 0 to 1">Trust</th>
              <th title="-1 fake to +1 genuine">Authenticity</th>
              <th>Verdicts</th>
              <th>Notability</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="wrap">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                      {s.name}
                    </a>
                  ) : (
                    s.name
                  )}
                  <br />
                  <small className="muted">{[s.title, s.country].filter(Boolean).join(' · ')}</small>
                </td>
                <td>
                  {s.email}
                  {s.geoCountry && (
                    <>
                      <br />
                      <small className="muted">confirmed from {s.geoCountry}</small>
                    </>
                  )}
                </td>
                <td>
                  {s.status}
                  {s.seed && <span className="badge seed">Signatory</span>}
                  {s.status === 'verified' && s.flagged && <span className="badge warn">Held back</span>}
                  {s.status === 'verified' && !s.seed && s.confirmed && <span className="badge ok">Confirmed</span>}
                </td>
                <td className="num">{s.trust.toFixed(3)}</td>
                <td className="num">{s.authenticity.toFixed(2)}</td>
                <td className="num">{s.authReviews}</td>
                <td className="num">{s.notability.toFixed(2)}</td>
                <td>
                  {s.status === 'removed' ? (
                    <Op id={s.id} op="restore">Restore</Op>
                  ) : (
                    <>
                      {s.seed ? <Op id={s.id} op="unseed">Untrust</Op> : <Op id={s.id} op="seed">Trust</Op>}{' '}
                      <Op id={s.id} op="remove">Remove</Op>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sans muted">
        <small>
          &ldquo;Trust&rdquo; marks a signer as known to you, which also clears a held-back flag. &ldquo;Remove&rdquo; takes
          the name off the letter and blocks that email address from signing it again.
        </small>
      </p>
    </div>
  );
}
