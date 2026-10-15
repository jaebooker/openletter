import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { submitAuthReview, submitComparison } from '@/app/actions';
import { db } from '@/db';
import { authReviews, comparisons, letters, signers, type Signer } from '@/db/schema';
import { currentSigner } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review signers', robots: { index: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ welcome?: string }> };

function Subject({ s }: { s: Signer }) {
  const query = encodeURIComponent([s.name, s.title].filter(Boolean).join(' '));
  return (
    <div>
      <div className="who">{s.name}</div>
      <div className="what">{[s.title, s.country].filter(Boolean).join(' · ') || 'No role or country given'}</div>
      <div className="links">
        {s.url && (
          <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
            {s.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        )}
        {s.showDomain && <span className="muted">Email at @{s.email.split('@')[1]}</span>}
        <a href={`https://duckduckgo.com/?q=${query}`} target="_blank" rel="noopener noreferrer">
          Search the web
        </a>
      </div>
    </div>
  );
}

export default async function ReviewPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const d = await db();
  const [letter] = await d.select().from(letters).where(eq(letters.slug, slug));
  if (!letter) notFound();
  const me = await currentSigner(letter.id);
  if (!me) redirect(`/l/${slug}#sign`);

  const peers = and(eq(signers.letterId, letter.id), eq(signers.status, 'verified'), ne(signers.id, me.id));
  const [{ n: doneAuth }] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(authReviews)
    .where(eq(authReviews.reviewerId, me.id));
  const [{ n: doneComps }] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(comparisons)
    .where(eq(comparisons.reviewerId, me.id));

  // Authenticity: the signer with the fewest reviews so far that I have not judged.
  const [subject] = await d
    .select()
    .from(signers)
    .where(and(peers, sql`${signers.id} not in (select subject_id from auth_reviews where reviewer_id = ${me.id})`))
    .orderBy(asc(signers.authReviews), sql`random()`)
    .limit(1);

  // Notability: a random signer against one of the five closest in current
  // rank that I have not already compared with them. Close pairs are the
  // informative ones.
  let pair: [Signer, Signer] | null = null;
  const [a] = await d.select().from(signers).where(and(peers, eq(signers.flagged, false))).orderBy(sql`random()`).limit(1);
  if (a) {
    const near = await d
      .select()
      .from(signers)
      .where(
        and(
          peers,
          eq(signers.flagged, false),
          ne(signers.id, a.id),
          sql`not exists (select 1 from comparisons c where c.reviewer_id = ${me.id} and c.a_id = least(signers.id, ${a.id}::int) and c.b_id = greatest(signers.id, ${a.id}::int))`,
        ),
      )
      .orderBy(sql`abs(${signers.notability} - ${a.notability}::real)`, sql`random()`)
      .limit(5);
    if (near.length) pair = [a, near[Math.floor(Math.random() * near.length)]];
  }

  const task = subject && (doneAuth <= doneComps || !pair) ? 'auth' : pair ? 'pair' : null;
  const done = doneAuth + doneComps;

  return (
    <>
      <p className="kicker">Peer review</p>
      <h1>{(await searchParams).welcome ? `Thank you, ${me.name}. Your signature is confirmed.` : 'Review other signers'}</h1>
      <p className="lede">
        Now help check the list for <Link href={`/l/${slug}`}>{letter.title}</Link>. Five reviews is plenty. Every one
        makes the letter harder to fake.
      </p>
      <p className="sans muted">
        <small>
          You have made {done} {done === 1 ? 'review' : 'reviews'}. Other signers are reviewing you the same way.
        </small>
      </p>

      {task === 'auth' && subject && (
        <div className="card">
          <h2>Is this a real person signing as themselves?</h2>
          <div className="subject">
            <Subject s={subject} />
          </div>
          <p className="sans muted">
            <small>
              Say yes if you know them, or if a quick search shows a real person who plausibly signed. Say no if the name
              is invented, a joke, or a public figure being impersonated.
            </small>
          </p>
          <form action={submitAuthReview} className="actions">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="subjectId" value={subject.id} />
            <button name="verdict" value="real">
              Yes, looks genuine
            </button>
            <button name="verdict" value="fake" className="quiet">
              No, looks fake
            </button>
            <button name="verdict" value="unsure" className="quiet">
              I can&apos;t tell
            </button>
          </form>
        </div>
      )}

      {task === 'pair' && pair && (
        <div className="card">
          <h2>Whose signature would more people recognise?</h2>
          <form action={submitComparison}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="aId" value={pair[0].id} />
            <input type="hidden" name="bId" value={pair[1].id} />
            <div className="versus">
              {pair.map((s, i) => (
                <div className="subject" key={s.id}>
                  <Subject s={s} />
                  <button name="pick" value={i === 0 ? 'a' : 'b'}>
                    {s.name}
                  </button>
                </div>
              ))}
            </div>
            <p className="actions" style={{ marginTop: '1rem' }}>
              <button name="pick" value="tie" className="quiet">
                About the same, or I can&apos;t tell
              </button>
            </p>
          </form>
          <p className="sans muted">
            <small>This only sets the order of the public list. It is not a judgement of anyone&apos;s worth.</small>
          </p>
        </div>
      )}

      {!task && (
        <div className="card">
          <h2>You are all caught up.</h2>
          <p>There is nobody left for you to review right now. Come back as more people sign.</p>
        </div>
      )}

      <p>
        <Link href={`/l/${slug}`}>Back to the letter</Link>
      </p>
    </>
  );
}
