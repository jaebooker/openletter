import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db } from '@/db';
import { letters, signers } from '@/db/schema';
import { currentSigner, isAdmin } from '@/lib/auth';
import { SignForm } from './sign-form';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ all?: string }> };

async function load(slug: string) {
  const d = await db();
  const [letter] = await d.select().from(letters).where(eq(letters.slug, slug));
  if (!letter) return null;
  if (letter.status === 'draft' && !(await isAdmin())) return null;
  return { d, letter };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).slug);
  if (!found) return {};
  const { title, subtitle } = found.letter;
  return { title, description: subtitle || undefined, openGraph: { title, description: subtitle || undefined, type: 'article' } };
}

const PAGE = 200;

export default async function LetterPage({ params, searchParams }: Props) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { d, letter } = found;
  const showAll = (await searchParams).all === '1';

  const visible = and(eq(signers.letterId, letter.id), eq(signers.status, 'verified'), eq(signers.flagged, false));
  const [{ count }] = await d.select({ count: sql<number>`count(*)::int` }).from(signers).where(visible);
  const list = await d
    .select({
      id: signers.id,
      name: signers.name,
      title: signers.title,
      country: signers.country,
      seed: signers.seed,
      confirmed: signers.confirmed,
    })
    .from(signers)
    .where(visible)
    .orderBy(desc(signers.notability), desc(signers.confirmed), asc(signers.verifiedAt))
    .limit(showAll ? 100000 : PAGE);
  const me = await currentSigner(letter.id);

  return (
    <article>
      {letter.status === 'draft' && <p className="notice">Draft. Only organisers can see this page.</p>}
      <p className="kicker">Open letter</p>
      <h1>{letter.title}</h1>
      {letter.subtitle && <p className="lede">{letter.subtitle}</p>}
      {letter.publishedAt && (
        <p className="sans muted">
          <small>{letter.publishedAt.toLocaleDateString('en', { dateStyle: 'long' })}</small>
        </p>
      )}

      <div className="tally">
        <span>
          <strong>{count.toLocaleString('en')}</strong> {count === 1 ? 'signature' : 'signatures'}
        </span>
        {me ? (
          <Link className="button" href={`/l/${letter.slug}/review`}>
            Review other signers
          </Link>
        ) : letter.status === 'published' ? (
          <a className="button" href="#sign">
            Sign this letter
          </a>
        ) : null}
      </div>

      <div className="prose">
        <Markdown remarkPlugins={[remarkGfm]}>{letter.body}</Markdown>
      </div>

      <hr />

      <section id="sign">
        {me ? (
          <div className="card">
            <h2>You signed this letter, {me.name}.</h2>
            <p>
              Help keep the list honest. <Link href={`/l/${letter.slug}/review`}>Review a few other signers</Link>.
            </p>
          </div>
        ) : letter.status === 'published' ? (
          <div className="card">
            <h2>Add your name</h2>
            <SignForm slug={letter.slug} />
          </div>
        ) : letter.status === 'closed' ? (
          <p className="notice">This letter is closed to new signatures.</p>
        ) : null}
      </section>

      <section id="signers">
        <h2>Signed by</h2>
        {list.length === 0 ? (
          <p className="muted">No confirmed signatures yet.</p>
        ) : (
          <ul className="signers">
            {list.map((s) => (
              <li key={s.id}>
                <span className="who">{s.name}</span>
                {s.seed ? (
                  <span className="badge seed" title="Initial signatory, known to the organisers">
                    Signatory
                  </span>
                ) : s.confirmed ? (
                  <span className="badge ok" title="Confirmed as genuine by trusted fellow signers">
                    Peer-confirmed
                  </span>
                ) : null}
                {(s.title || s.country) && <span className="what">{[s.title, s.country].filter(Boolean).join(' · ')}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="sans">
          <small>
            {!showAll && count > list.length && (
              <>
                Showing the first {list.length.toLocaleString('en')}. <Link href={`/l/${letter.slug}?all=1#signers`}>Show all {count.toLocaleString('en')}</Link>
                {' · '}
              </>
            )}
            <a href={`/l/${letter.slug}/signers.csv`}>Download the list (CSV)</a> ·{' '}
            <Link href="/about">How signatures are verified</Link>
          </small>
        </p>
      </section>
    </article>
  );
}
