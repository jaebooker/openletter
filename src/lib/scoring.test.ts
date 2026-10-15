import { describe, expect, it } from 'vitest';
import { authenticityScores, bradleyTerry, standing, trustScores, type Vouch } from './scoring';

const real = (reviewer: number, subject: number): Vouch => ({ reviewer, subject, verdict: 'real' });
const fake = (reviewer: number, subject: number): Vouch => ({ reviewer, subject, verdict: 'fake' });

describe('trustScores', () => {
  it('gives a Sybil ring zero trust when nobody trusted vouches for it', () => {
    const ids = [1, 2, 3, 10, 11, 12];
    const vouches = [real(1, 2), real(2, 3), real(10, 11), real(11, 12), real(12, 10), real(10, 12)];
    const t = trustScores(ids, [1], vouches);
    expect(t.get(10)).toBe(0);
    expect(t.get(11)).toBe(0);
    expect(t.get(12)).toBe(0);
    expect(t.get(2)!).toBeGreaterThan(0);
  });

  it('decays with distance from the seeds', () => {
    const t = trustScores([1, 2, 3, 4], [1], [real(1, 2), real(2, 3), real(3, 4)]);
    expect(t.get(1)).toBe(1);
    expect(t.get(2)!).toBeGreaterThan(t.get(3)!);
    expect(t.get(3)!).toBeGreaterThan(t.get(4)!);
    expect(t.get(4)!).toBeGreaterThan(0);
  });

  it('dilutes a vouch spread across many subjects', () => {
    const focused = trustScores([1, 2], [1], [real(1, 2)]);
    const spread = trustScores([1, 2, 3, 4, 5], [1], [real(1, 2), real(1, 3), real(1, 4), real(1, 5)]);
    expect(spread.get(2)!).toBeLessThan(focused.get(2)!);
  });

  it('falls back to a uniform baseline with no seeds', () => {
    const t = trustScores([1, 2, 3], [], []);
    expect(t.get(1)).toBeCloseTo(1);
    expect(t.get(2)).toBeCloseTo(1);
    expect(t.get(3)).toBeCloseTo(1);
  });

  it('ignores fake and unsure verdicts, self-vouches and unknown ids', () => {
    const t = trustScores([1, 2], [1], [fake(1, 2), { reviewer: 1, subject: 2, verdict: 'unsure' }, real(2, 2), real(1, 99)]);
    expect(t.get(2)).toBe(0);
  });
});

describe('authenticity', () => {
  const ids = [1, 2, 3, 4, 10, 11, 12];
  const seeds = [1, 2];

  it('confirms a signer vouched for by trusted reviewers', () => {
    const v = [real(1, 3), real(2, 3)];
    const a = authenticityScores(ids, trustScores(ids, seeds, v), v);
    expect(standing(a.get(3)!, false)).toBe('confirmed');
  });

  it('flags only after two trusted fake verdicts', () => {
    const one = [fake(1, 4)];
    const a1 = authenticityScores(ids, trustScores(ids, seeds, one), one);
    expect(standing(a1.get(4)!, false)).toBe('unreviewed');
    const two = [fake(1, 4), fake(2, 4)];
    const a2 = authenticityScores(ids, trustScores(ids, seeds, two), two);
    expect(standing(a2.get(4)!, false)).toBe('flagged');
  });

  it('gives untrusted accounts no power to confirm each other or flag anyone', () => {
    const v = [real(10, 11), real(11, 12), real(12, 10), real(11, 10), fake(10, 3), fake(11, 3), fake(12, 3), real(1, 3), real(2, 3)];
    const a = authenticityScores(ids, trustScores(ids, seeds, v), v);
    expect(a.get(10)!.score).toBe(0);
    expect(standing(a.get(10)!, false)).toBe('unreviewed');
    expect(standing(a.get(3)!, false)).toBe('confirmed');
  });

  it('never flags a seed', () => {
    const v = [fake(1, 2), fake(3, 2)];
    const a = authenticityScores(ids, trustScores(ids, seeds, v), v);
    expect(standing(a.get(2)!, true)).toBe('confirmed');
  });
});

describe('bradleyTerry', () => {
  it('recovers a transitive order', () => {
    const s = bradleyTerry([1, 2, 3], [
      { a: 1, b: 2, winner: 1, weight: 1 },
      { a: 2, b: 3, winner: 2, weight: 1 },
    ]);
    expect(s.get(1)!).toBeGreaterThan(s.get(2)!);
    expect(s.get(2)!).toBeGreaterThan(s.get(3)!);
  });

  it('leaves signers with no comparisons at zero', () => {
    const s = bradleyTerry([1, 2, 3], [{ a: 1, b: 2, winner: 1, weight: 1 }]);
    expect(s.get(3)).toBeCloseTo(0);
  });

  it('treats a tie as no information about order', () => {
    const s = bradleyTerry([1, 2], [{ a: 1, b: 2, winner: null, weight: 1 }]);
    expect(s.get(1)).toBeCloseTo(s.get(2)!);
  });

  it('weights comparisons by reviewer trust and drops zero-weight ones', () => {
    const s = bradleyTerry([1, 2], [
      { a: 1, b: 2, winner: 2, weight: 0 },
      { a: 1, b: 2, winner: 2, weight: 0.1 },
      { a: 1, b: 2, winner: 1, weight: 1 },
    ]);
    expect(s.get(1)!).toBeGreaterThan(s.get(2)!);
  });

  it('stays finite for an unbeaten signer', () => {
    const comps = Array.from({ length: 50 }, () => ({ a: 1, b: 2, winner: 1, weight: 1 }));
    const s = bradleyTerry([1, 2], comps);
    expect(Number.isFinite(s.get(1)!)).toBe(true);
    expect(Number.isFinite(s.get(2)!)).toBe(true);
  });
});
