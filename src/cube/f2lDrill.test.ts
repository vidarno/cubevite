import { describe, expect, it } from 'vitest';
import { F2L } from './f2l';
import { applyAlg, tokenize } from './facelets';
import { isCrossSolved, isF2LSolved, solvedSlots } from './cfop';
import { recognizeF2L } from './f2lRecognize';
import { f2lPairReport, pairsDone, randomF2LCaseState, randomF2LState } from './f2lDrill';
import { llOriented } from './states';
import type { Rng } from './states';

function seeded(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('F2L drill states', () => {
  it('case states: the chosen case at FR, other slots + cross solved, LL random', () => {
    const rng = seeded(5);
    let oriented = 0;
    for (const c of F2L) for (let i = 0; i < 5; i++) {
      const s = randomF2LCaseState(c, rng);
      expect(isCrossSolved(s, 'D')).toBe(true);
      expect(solvedSlots(s, 'D').sort()).toEqual(['BR', 'FL', 'LB']);
      expect(recognizeF2L(s, 'FR')?.case.id).toBe(c.id);
      expect(isF2LSolved(applyAlg(s, recognizeF2L(s, 'FR')!.moves), 'D')).toBe(true);
      if (llOriented(applyAlg(s, recognizeF2L(s, 'FR')!.moves))) oriented++;
    }
    expect(oriented).toBeLessThan(20); // LL is random, not left solved (OLL skip ~1/216)
  });

  it('full-F2L states: cross solved, no pair solved', () => {
    const rng = seeded(9);
    for (let i = 0; i < 200; i++) {
      const s = randomF2LState(rng);
      expect(isCrossSolved(s, 'D')).toBe(true);
      expect(solvedSlots(s, 'D')).toEqual([]);
      expect(pairsDone(s, 1)).toBe(false);
    }
  });
});

describe('f2lPairReport', () => {
  it('splits a solve into pairs with slots, cases, pauses and moves', () => {
    // Solve a full-F2L state by repeatedly inserting recognised free pairs (taking stuck pieces out first).
    const rng = seeded(21);
    const start = randomF2LState(rng);
    let s = start;
    const moves: string[] = [];
    const states = [start];
    const splits: number[] = [];
    const times: number[] = [];
    let t = 0;
    let k = 1;
    for (let guard = 0; guard < 20 && solvedSlots(s, 'D').length < 4; guard++) {
      const free = ['RF', 'FL', 'LB', 'BR'].map((sl) => recognizeF2L(s, sl)).filter(Boolean);
      // A stuck pair: pop the first unsolved slot out with its own trigger (always frees something).
      const seq = free.length ? free[0]!.moves : "R U R'";
      t += 1000; // pause before the pair
      for (const m of tokenize(seq)) {
        s = applyAlg(s, m); moves.push(m); times.push(t); t += 100;
        while (k <= 4 && pairsDone(s, k)) { splits.push(times[times.length - 1]); states.push(s); k++; }
      }
    }
    times[0] = 0; // the timer starts on the first turn
    expect(isF2LSolved(s, 'D')).toBe(true);
    const report = f2lPairReport(states.slice(0, 4), s, splits, times);
    expect(report).toHaveLength(4);
    expect(report.flatMap((r) => r.slots).sort()).toEqual(['BR', 'FL', 'LB', 'RF']);
    expect(report.reduce((a, r) => a + r.moves, 0)).toBe(moves.length);
    for (const r of report.slice(1)) if (r.moves) expect(r.pauseBefore).toBeGreaterThanOrEqual(900);
    expect(report.some((r) => r.caseId?.startsWith('F2L '))).toBe(true);
  });
});
