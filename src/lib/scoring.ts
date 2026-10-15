/**
 * The verification engine. Pure functions, no I/O.
 *
 * 1. trustScores      who do we listen to?   seeded personalised PageRank over "this person is real" vouches
 * 2. authenticity     is this signer real?   trust-weighted balance of real / fake verdicts
 * 3. bradleyTerry     how notable are they?  trust-weighted pairwise ranking
 */

export type Verdict = 'real' | 'fake' | 'unsure';
export interface Vouch {
  reviewer: number;
  subject: number;
  verdict: Verdict;
}
export interface WeightedComparison {
  a: number;
  b: number;
  /** id of the more notable signer, or null for "about the same" */
  winner: number | null;
  weight: number;
}

export const THRESHOLDS = {
  /** authenticity score at or above which a signer is shown as peer-confirmed */
  confirm: 0.3,
  /** authenticity score at or below which a signer is hidden pending organiser review */
  flag: -0.3,
  /** minimum number of real/fake verdicts before either label applies */
  minReviews: 2,
  /** smoothing, in units of one fully trusted reviewer */
  prior: 0.5,
};

/**
 * Trust flows out from the seed signers (people the organisers know are real)
 * along "real" vouches, with a restart back to the seeds at every step.
 *
 * The property that matters: accounts that only vouch for each other, and that
 * nobody trusted has vouched for, receive exactly zero trust. Creating a
 * thousand fake signers buys an attacker nothing until a trusted signer vouches
 * for one of them, and then only a diluted share.
 *
 * With no seeds the restart is uniform, which gives every verified signer a
 * baseline voice. That is weaker, so organisers should always mark seeds.
 *
 * Returns values scaled so the most trusted signer is 1.
 */
export function trustScores(
  ids: number[],
  seeds: number[],
  vouches: Vouch[],
  damping = 0.85,
  maxIters = 100,
): Map<number, number> {
  const n = ids.length;
  const out = new Map<number, number>();
  if (n === 0) return out;
  const idx = new Map(ids.map((id, i) => [id, i] as const));

  const restart = new Float64Array(n);
  const seedIdx = [...new Set(seeds)].map((s) => idx.get(s)).filter((i): i is number => i !== undefined);
  if (seedIdx.length > 0) for (const i of seedIdx) restart[i] = 1 / seedIdx.length;
  else restart.fill(1 / n);

  const edges: number[][] = ids.map(() => []);
  for (const v of vouches) {
    if (v.verdict !== 'real') continue;
    const r = idx.get(v.reviewer);
    const s = idx.get(v.subject);
    if (r === undefined || s === undefined || r === s) continue;
    edges[r].push(s);
  }

  let t = Float64Array.from(restart);
  for (let k = 0; k < maxIters; k++) {
    const next = new Float64Array(n);
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      const e = edges[i];
      if (e.length === 0) {
        dangling += t[i];
        continue;
      }
      const share = t[i] / e.length;
      for (const j of e) next[j] += share;
    }
    let delta = 0;
    for (let i = 0; i < n; i++) {
      const v = (1 - damping) * restart[i] + damping * (next[i] + dangling * restart[i]);
      delta += Math.abs(v - t[i]);
      next[i] = v;
    }
    t = next;
    if (delta < 1e-12) break;
  }

  let max = 0;
  for (let i = 0; i < n; i++) if (t[i] > max) max = t[i];
  for (let i = 0; i < n; i++) out.set(ids[i], max > 0 ? t[i] / max : 0);
  return out;
}

export interface Authenticity {
  /** -1 (trusted reviewers say fake) .. +1 (trusted reviewers say real) */
  score: number;
  real: number;
  fake: number;
}

export function authenticityScores(
  ids: number[],
  trust: Map<number, number>,
  vouches: Vouch[],
  prior = THRESHOLDS.prior,
): Map<number, Authenticity> {
  const acc = new Map(ids.map((id): [number, { pos: number; neg: number; real: number; fake: number }] => [id, { pos: 0, neg: 0, real: 0, fake: 0 }]));
  for (const v of vouches) {
    if (v.verdict === 'unsure' || v.reviewer === v.subject) continue;
    const a = acc.get(v.subject);
    if (!a || !trust.has(v.reviewer)) continue;
    const w = trust.get(v.reviewer) ?? 0;
    if (v.verdict === 'real') {
      a.pos += w;
      a.real++;
    } else {
      a.neg += w;
      a.fake++;
    }
  }
  const out = new Map<number, Authenticity>();
  for (const [id, a] of acc) {
    out.set(id, { score: (a.pos - a.neg) / (a.pos + a.neg + prior), real: a.real, fake: a.fake });
  }
  return out;
}

export type Standing = 'confirmed' | 'flagged' | 'unreviewed';

export function standing(a: Authenticity, isSeed: boolean): Standing {
  if (isSeed) return 'confirmed';
  if (a.fake >= THRESHOLDS.minReviews && a.score <= THRESHOLDS.flag) return 'flagged';
  if (a.real + a.fake >= THRESHOLDS.minReviews && a.score >= THRESHOLDS.confirm) return 'confirmed';
  return 'unreviewed';
}

/**
 * Bradley-Terry strengths fitted with the classic minorise-maximise update.
 * Each signer also plays `prior` wins and `prior` losses against a phantom
 * opponent of strength 1, which keeps every estimate finite and pulls signers
 * with little evidence towards the middle.
 *
 * Returns log-strengths: 0 is "no evidence either way", higher is more notable.
 */
export function bradleyTerry(
  ids: number[],
  comps: WeightedComparison[],
  prior = 1,
  maxIters = 200,
): Map<number, number> {
  const n = ids.length;
  const idx = new Map(ids.map((id, i) => [id, i] as const));
  const wins = new Float64Array(n);
  const games: Map<number, number>[] = ids.map(() => new Map());

  for (const c of comps) {
    const i = idx.get(c.a);
    const j = idx.get(c.b);
    if (i === undefined || j === undefined || i === j || !(c.weight > 0)) continue;
    if (c.winner === c.a) wins[i] += c.weight;
    else if (c.winner === c.b) wins[j] += c.weight;
    else {
      wins[i] += c.weight / 2;
      wins[j] += c.weight / 2;
    }
    games[i].set(j, (games[i].get(j) ?? 0) + c.weight);
    games[j].set(i, (games[j].get(i) ?? 0) + c.weight);
  }

  let p = new Float64Array(n).fill(1);
  for (let k = 0; k < maxIters; k++) {
    const next = new Float64Array(n);
    let delta = 0;
    for (let i = 0; i < n; i++) {
      let denom = (2 * prior) / (p[i] + 1);
      for (const [j, w] of games[i]) denom += w / (p[i] + p[j]);
      next[i] = (wins[i] + prior) / denom;
      delta += Math.abs(next[i] - p[i]);
    }
    p = next;
    if (delta < 1e-10) break;
  }

  const out = new Map<number, number>();
  for (let i = 0; i < n; i++) out.set(ids[i], Math.log(p[i]));
  return out;
}
