/**
 * Fills the database with a demo letter: 5 initial signatories, 24 ordinary
 * signers who review each other, and a ring of 6 fake accounts that vouch only
 * for each other. Run with `npm run seed` while the server is stopped.
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { authReviews, comparisons, letters, signers } from '../src/db/schema';
import { recomputeLetter } from '../src/lib/recompute';

let state = 42;
const rnd = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

const FIRST = ['Amara', 'Bao', 'Clara', 'Dmitri', 'Elif', 'Farid', 'Greta', 'Hugo', 'Ines', 'Jonas', 'Kavya', 'Lior', 'Mina', 'Noor', 'Otto', 'Priya', 'Quinn', 'Rosa', 'Sven', 'Tala', 'Uma', 'Viktor', 'Wren', 'Ximena', 'Yusuf', 'Zofia', 'Anders', 'Beatriz', 'Chidi'];
const LAST = ['Okafor', 'Nguyen', 'Lindqvist', 'Volkov', 'Demir', 'Rahimi', 'Hoffmann', 'Marchetti', 'Carvalho', 'Becker', 'Iyer', 'Shapiro', 'Tanaka', 'Haddad', 'Brandt', 'Menon', 'Gallagher', 'Moreno', 'Nilsson', 'Kealoha', 'Devi', 'Petrov', 'Ashby', 'Castillo', 'Kaya', 'Nowak', 'Holm', 'Sousa', 'Eze'];
const ROLES = ['Professor of Statistics', 'Research Librarian', 'Postdoctoral Fellow', 'Science Journalist', 'PhD Candidate', 'Senior Lecturer in Public Policy', 'Software Engineer', 'Editor', 'Data Scientist', 'Associate Professor of Physics'];
const ORGS = ['Northfield University', 'Harbour Institute', 'Open Knowledge Lab', 'Riverside College', 'Meridian Research Centre', 'City Public Library'];
const COUNTRIES = ['Nigeria', 'Vietnam', 'Sweden', 'Germany', 'Turkey', 'Brazil', 'India', 'Japan', 'Ireland', 'Mexico', 'Poland', 'Canada'];

const BODY = `**This is a demonstration letter.** The signers below are invented so you can see how peer verification behaves. Replace it with your own from the organiser pages.

Research paid for by the public should be readable by the public. Today much of it sits behind paywalls that the people who funded it cannot afford to cross.

> We call on public research funders to require that every paper, dataset and piece of code produced with their grants is freely available from the day of publication.

## Why we are signing

- **Fairness.** Taxpayers should not pay twice, once for the research and again to read it.
- **Speed.** Open results are checked, reused and built upon faster.
- **Trust.** Claims that anyone can inspect are claims that are easier to believe.

## What we ask

1. Immediate open access to publicly funded papers, with no embargo period.
2. Data and code deposited in a public repository alongside each paper.
3. Funding for the libraries and repositories that make this possible.

Not every signer will agree with every reason above. All of us agree with the call.`;

async function main() {
  const d = await db();
  const slug = 'open-research-demo';
  await d.delete(letters).where(eq(letters.slug, slug));
  const [letter] = await d
    .insert(letters)
    .values({
      slug,
      title: 'Public Research Should Be Public',
      subtitle: 'A demonstration letter calling for open access to publicly funded research',
      body: BODY,
      status: 'published',
      publishedAt: new Date(),
    })
    .returning();

  const people = Array.from({ length: 29 }, (_, i) => ({
    letterId: letter.id,
    name: `${FIRST[i]} ${LAST[(i * 7) % LAST.length]}`,
    email: `signer${i + 1}@example.org`,
    title: `${ROLES[i % ROLES.length]}, ${pick(ORGS)}`,
    country: pick(COUNTRIES),
    status: 'verified',
    seed: i < 5,
    verifiedAt: new Date(Date.now() - (29 - i) * 3600_000),
  }));
  const ring = Array.from({ length: 6 }, (_, i) => ({
    letterId: letter.id,
    name: ['Albert Einstien', 'Taylor Swfit', 'Definitely A. Person', 'J. Doe', 'Test Test', 'Queen of England'][i],
    email: `ring${i + 1}@example.net`,
    title: i < 2 ? 'World-famous celebrity' : '',
    country: '',
    status: 'verified',
    seed: false,
    verifiedAt: new Date(),
  }));
  const honest = await d.insert(signers).values(people).returning({ id: signers.id });
  const fakes = await d.insert(signers).values(ring).returning({ id: signers.id });
  const h = honest.map((r) => r.id);
  const f = fakes.map((r) => r.id);

  const reviews: (typeof authReviews.$inferInsert)[] = [];
  const seen = new Set<string>();
  const add = (reviewerId: number, subjectId: number, verdict: string) => {
    const k = `${reviewerId}:${subjectId}`;
    if (reviewerId === subjectId || seen.has(k)) return;
    seen.add(k);
    reviews.push({ letterId: letter.id, reviewerId, subjectId, verdict });
  };
  // Honest signers review a handful of people each, and are usually right.
  // The last four signed most recently and nobody has reviewed them yet.
  const reviewable = h.slice(0, -4);
  for (const r of h) {
    for (let k = 0; k < 5; k++) {
      if (rnd() < 0.3) add(r, pick(f), rnd() < 0.9 ? 'fake' : 'unsure');
      else add(r, pick(reviewable), rnd() < 0.92 ? 'real' : 'unsure');
    }
  }
  // The ring vouches for itself and attacks two real signers.
  for (const r of f) {
    for (const s of f) add(r, s, 'real');
    add(r, h[6], 'fake');
    add(r, h[7], 'fake');
  }
  await d.insert(authReviews).values(reviews);

  // Notability: earlier signers are "better known", with some noise.
  const comps: (typeof comparisons.$inferInsert)[] = [];
  const seenC = new Set<string>();
  for (const r of h) {
    for (let k = 0; k < 6; k++) {
      const x = pick(h);
      const y = pick(h);
      const [a, b] = [Math.min(x, y), Math.max(x, y)];
      const key = `${r}:${a}:${b}`;
      if (a === b || a === r || b === r || seenC.has(key)) continue;
      seenC.add(key);
      comps.push({ letterId: letter.id, reviewerId: r, aId: a, bId: b, winnerId: rnd() < 0.1 ? null : rnd() < 0.8 ? a : b });
    }
  }
  await d.insert(comparisons).values(comps);
  await recomputeLetter(letter.id);

  const out = await d.select().from(signers).where(eq(signers.letterId, letter.id));
  const count = (p: (s: (typeof out)[number]) => boolean) => out.filter(p).length;
  console.log(`Seeded /l/${slug}: ${out.length} signers, ${reviews.length} verdicts, ${comps.length} comparisons`);
  console.log(`  initial signatories ${count((s) => s.seed)} | peer-confirmed ${count((s) => s.confirmed && !s.seed)} | held back ${count((s) => s.flagged)} | unmarked ${count((s) => !s.confirmed && !s.flagged)}`);
  console.log(`  ring held back: ${out.filter((s) => f.includes(s.id) && s.flagged).length}/${f.length}; ring max trust: ${Math.max(...out.filter((s) => f.includes(s.id)).map((s) => s.trust))}`);
  console.log(`  real signers held back: ${out.filter((s) => h.includes(s.id) && s.flagged).length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
