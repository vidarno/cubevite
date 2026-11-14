import { describe, expect, it } from 'vitest';
import { applyAlg, applyMove, FACES, SOLVED, type Face } from './facelets';
import { isCrossSolved } from './cfop';
import { crossDistance, crossDistances, crossDistribution, FACE_TURNS, solveCross } from './crossSolver';
import type { Rng } from './states';

function seeded(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randomScramble = (rng: Rng, n: number) =>
  Array.from({ length: n }, () => FACE_TURNS[Math.floor(rng() * 18)]).join(' ');

/** Shortest cross solution by plain iterative deepening on facelets (no tables). */
function bruteForce(state: string, face: Face, limit: number): number {
  const search = (s: string, d: number, lastFace: string): boolean => {
    if (d === 0) return isCrossSolved(s, face);
    return FACE_TURNS.some((m) => m[0] !== lastFace && search(applyMove(s, m), d - 1, m[0]));
  };
  for (let d = 0; d <= limit; d++) if (search(state, d, '')) return d;
  return Infinity;
}

describe('cross solver', () => {
  it('has the known distance distribution (190080 states, all ≤ 8 moves), built in < 200 ms', () => {
    const t0 = performance.now();
    crossDistance(SOLVED, 'D'); // first use builds the D table (this test runs first)
    expect(performance.now() - t0).toBeLessThan(200);
    const dist = crossDistribution('D');
    expect(dist).toEqual([1, 15, 158, 1394, 9809, 46381, 97254, 34966, 102]);
    expect(dist.reduce((a, b) => a + b, 0)).toBe(190080);
  });

  it('every face has the same distribution', () => {
    const d = crossDistribution('D');
    for (const f of FACES) expect(crossDistribution(f)).toEqual(d);
  });

  it('solved and one move away', () => {
    for (const f of FACES) expect(crossDistance(SOLVED, f)).toBe(0);
    expect(solveCross(SOLVED, 'D')).toEqual(['']);
    expect(crossDistance(applyMove(SOLVED, 'R'), 'D')).toBe(1);
    expect(solveCross(applyMove(SOLVED, 'R'), 'D', 5)).toEqual(["R'"]);
    expect(crossDistance(applyMove(SOLVED, 'U'), 'D')).toBe(0);
    expect(crossDistances(applyMove(SOLVED, 'U'))).toEqual({ U: 1, R: 1, F: 1, D: 0, L: 1, B: 1 });
  });

  it('matches brute force on short scrambles, every face', () => {
    const rng = seeded(7);
    for (let i = 0; i < 24; i++) {
      const s = applyAlg(SOLVED, randomScramble(rng, 1 + (i % 4)));
      const face = FACES[i % 6];
      const d = crossDistance(s, face);
      expect(d).toBeLessThanOrEqual(4);
      expect(bruteForce(s, face, 4)).toBe(d);
    }
  });

  it('distance is a lower bound no brute force can beat on random states', () => {
    // A full brute force to depth 8 is too slow: check that no solution of length <= min(d - 1, 4) exists.
    const rng = seeded(11);
    for (let i = 0; i < 6; i++) {
      const s = applyAlg(SOLVED, randomScramble(rng, 25));
      const d = crossDistance(s, 'D');
      expect(bruteForce(s, 'D', Math.min(d - 1, 4))).toBe(Infinity);
    }
  });

  it('returns distinct optimal solutions that solve the cross', () => {
    const rng = seeded(3);
    for (let i = 0; i < 60; i++) {
      const s = applyAlg(SOLVED, randomScramble(rng, 25));
      const face = FACES[i % 6];
      const d = crossDistance(s, face);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(8);
      const sols = solveCross(s, face, 5);
      expect(sols.length).toBeGreaterThanOrEqual(1);
      expect(new Set(sols).size).toBe(sols.length);
      for (const sol of sols) {
        expect(sol.split(' ').filter(Boolean)).toHaveLength(d);
        expect(isCrossSolved(applyAlg(s, sol), face)).toBe(true);
      }
    }
  });

  it('lists commuting opposite-face turns once', () => {
    expect(solveCross(applyAlg(SOLVED, 'R2 L2'), 'D', 20)).toEqual(['R2 L2']);
  });

});
