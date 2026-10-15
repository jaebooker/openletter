import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { authReviews, comparisons, signers } from '../db/schema';
import { authenticityScores, bradleyTerry, standing, trustScores, type Verdict } from './scoring';

/**
 * Recalculate trust, authenticity and notability for every verified signer of
 * a letter and write the results back. Cheap enough to run after each review
 * for letters with a few thousand signers; for much larger letters move this to
 * a scheduled job.
 */
export async function recomputeLetter(letterId: number): Promise<void> {
  const d = await db();
  const rows = await d
    .select({ id: signers.id, seed: signers.seed })
    .from(signers)
    .where(and(eq(signers.letterId, letterId), eq(signers.status, 'verified')));
  if (rows.length === 0) return;

  const ids = rows.map((r) => r.id);
  const seeds = rows.filter((r) => r.seed).map((r) => r.id);
  const vouches = (
    await d
      .select({ reviewer: authReviews.reviewerId, subject: authReviews.subjectId, verdict: authReviews.verdict })
      .from(authReviews)
      .where(eq(authReviews.letterId, letterId))
  ).map((v) => ({ ...v, verdict: v.verdict as Verdict }));
  const comps = await d.select().from(comparisons).where(eq(comparisons.letterId, letterId));

  const trust = trustScores(ids, seeds, vouches);
  const auth = authenticityScores(ids, trust, vouches);
  const notability = bradleyTerry(
    ids,
    comps.map((c) => ({ a: c.aId, b: c.bId, winner: c.winnerId, weight: trust.get(c.reviewerId) ?? 0 })),
  );

  for (let i = 0; i < rows.length; i += 500) {
    const values = sql.join(
      rows.slice(i, i + 500).map((r) => {
        const a = auth.get(r.id)!;
        const st = standing(a, r.seed);
        return sql`(${r.id}::int, ${trust.get(r.id) ?? 0}::real, ${a.score}::real, ${a.real + a.fake}::int, ${notability.get(r.id) ?? 0}::real, ${st === 'confirmed'}::boolean, ${st === 'flagged'}::boolean)`;
      }),
      sql`, `,
    );
    await d.execute(sql`
      UPDATE signers AS s
      SET trust = v.trust, authenticity = v.auth, auth_reviews = v.n, notability = v.nb, confirmed = v.ok, flagged = v.fl
      FROM (VALUES ${values}) AS v(id, trust, auth, n, nb, ok, fl)
      WHERE s.id = v.id`);
  }
}
