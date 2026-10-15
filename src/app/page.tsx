import { desc, inArray, sql } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { letters } from '@/db/schema';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const d = await db();
  const rows = await d
    .select({
      slug: letters.slug,
      title: letters.title,
      subtitle: letters.subtitle,
      status: letters.status,
      publishedAt: letters.publishedAt,
      count: sql<number>`(select count(*)::int from signers where signers.letter_id = letters.id and signers.status = 'verified' and not signers.flagged)`,
    })
    .from(letters)
    .where(inArray(letters.status, ['published', 'closed']))
    .orderBy(desc(letters.publishedAt));

  return (
    <>
      <p className="kicker">Open letters</p>
      <h1>Every name on the page earns its place.</h1>
      <p className="lede">
        Sign a public letter, confirm your email, then help check the other signers. Signatures are reviewed by the
        people who signed alongside you.
      </p>

      {rows.length === 0 ? (
        <div className="card">
          <p>
            No letters have been published yet. If you run this site, <Link href="/admin">sign in as an organiser</Link>{' '}
            to write the first one.
          </p>
        </div>
      ) : (
        <ul className="letter-list">
          {rows.map((l) => (
            <li key={l.slug}>
              <h2>
                <Link href={`/l/${l.slug}`}>{l.title}</Link>
              </h2>
              {l.subtitle && <p className="muted">{l.subtitle}</p>}
              <p className="sans">
                <small>
                  {l.count.toLocaleString('en')} {l.count === 1 ? 'signature' : 'signatures'}
                  {l.publishedAt && ` · ${l.publishedAt.toLocaleDateString('en', { dateStyle: 'long' })}`}
                  {l.status === 'closed' && ' · closed to new signatures'}
                </small>
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2>How a signature is checked</h2>
      <ol className="steps">
        <li>
          <b>Sign and confirm your email</b>
          <span>Your name appears on the letter as soon as you confirm.</span>
        </li>
        <li>
          <b>Review a few other signers</b>
          <span>Is this a real person signing as themselves? Which of these two is more widely known?</span>
        </li>
        <li>
          <b>Others review you</b>
          <span>Judgements count in proportion to how much the network trusts the person making them.</span>
        </li>
        <li>
          <b>The list sorts itself</b>
          <span>Confirmed signers are marked, suspect ones are held back for the organisers to check.</span>
        </li>
      </ol>
      <p>
        <Link href="/about">Read how the scoring works</Link>
      </p>
    </>
  );
}
