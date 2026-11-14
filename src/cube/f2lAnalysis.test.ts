import { describe, expect, it } from 'vitest';
import { analyzeSolve, solvedSlots, type TimedMove } from './cfop';
import { applyAlg, invertAlg, SOLVED, tokenize } from './facelets';
import { faceMapFor, mapMove } from './display';
import { toCubeFrame } from './drills';
import { F2L_BY_ID } from './f2l';
import { analyzeF2L } from './f2lAnalysis';
import { randomF2LCaseState, randomF2LState } from './f2lDrill';
import { pairStatus, recognizeF2L, recognizeF2LSlots, F2L_SLOTS } from './f2lRecognize';
import { toFaceTurns } from './faceTurns';
import type { Rng } from './states';

function seeded(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const timed = (moves: string[]): TimedMove[] => moves.map((move, i) => ({ move, t: (i + 1) * 100 }));
const POP: Record<string, string> = { RF: "R U R'", FL: "L' U' L", LB: "L U L'", BR: "R' U' R" };

/** Solve F2L from a cross-down state by inserting free pairs with the DB moves (popping stuck pieces). */
function solveF2L(start: string): string[] {
  let s = start;
  const out: string[] = [];
  for (let guard = 0; guard < 20 && solvedSlots(s, 'D').length < 4; guard++) {
    const free = recognizeF2LSlots(s);
    // No free pair: pop a stuck piece out, rotating through the unsolved slots (always popping the same one can loop).
    const open = F2L_SLOTS.filter((x) => pairStatus(s, x) !== 'solved');
    const seq = free.length ? free[0].moves : POP[open[guard % open.length]];
    s = applyAlg(s, seq);
    out.push(...tokenize(seq));
  }
  return out;
}

describe('analyzeF2L', () => {
  it('pairs solved with the DB algs: slots, cases, used alg, move counts', () => {
    const rng = seeded(4);
    for (let n = 0; n < 20; n++) {
      const start = randomF2LState(rng);
      const moves = timed(solveF2L(start));
      const pairs = analyzeF2L(start, moves, analyzeSolve(start, moves));
      expect(pairs).toHaveLength(4);
      expect(pairs.flatMap((p) => p.slots).sort()).toEqual(['BR', 'FL', 'LB', 'RF']);
      for (const p of pairs) {
        if (!p.caseId) continue; // stuck piece popped out first: no case
        if (p.usedAlg) expect(p.yourMoves).toBe(p.dbMoves);
        expect(p.dbAlg).toContain(F2L_BY_ID.get(p.caseId)!.alg);
      }
      expect(pairs.some((p) => p.usedAlg === 'main')).toBe(true);
    }
  });

  it('works in the cube frame with the white cross on U (moves reported cross-down)', () => {
    const start = randomF2LState(seeded(8));
    const solution = solveF2L(start);
    const z2 = faceMapFor('z2');
    const moves = timed(solution.map((m) => mapMove(m, z2)));
    const cubeStart = toCubeFrame(start, 'U');
    const sp = analyzeSolve(cubeStart, moves);
    expect(sp.crossFace).toBe('U');
    const pairs = analyzeF2L(cubeStart, moves, sp);
    expect(pairs.flatMap((p) => p.slots).sort()).toEqual(['BR', 'FL', 'LB', 'RF']);
    expect(pairs.map((p) => p.yourAlg).join(' ')).toBe(
      pairs.map((p) => toFaceTurns(solution.slice(p.startMove, p.endMove).join(' '))).join(' '));
  });

  it('recognises an alternative alg', () => {
    const c = F2L_BY_ID.get('F2L 5')!;
    const start = randomF2LCaseState({ alg: c.alg }, seeded(2));
    const pre = ['', 'U', 'U2', "U'"].find((a) => solvedSlots(applyAlg(start, `${a} ${c.alts![0]}`), 'D').length === 4)!;
    const moves = timed(tokenize(`${pre} ${c.alts![0]}`));
    const pairs = analyzeF2L(start, moves, analyzeSolve(start, moves));
    const last = pairs[pairs.length - 1];
    expect(last.caseId).toBe('F2L 5');
    expect(last.usedAlg).toBe('alt');
    expect(pairs.slice(0, 3).every((p) => p.slots.length === 0)).toBe(true); // already solved at the start
  });

  it('flags a much shorter pair that was available (pair order)', () => {
    // FR: a long both-in-slot case; BL: a basic insert.
    const long = F2L_BY_ID.get('F2L 38')!;
    let start = applyAlg(SOLVED, invertAlg(long.alg));
    start = applyAlg(start, "L U' L'");
    const fr = recognizeF2L(start, 'FR')!;
    const bl = recognizeF2L(start, 'BL')!;
    expect(tokenize(bl.moves).length + 3).toBeLessThanOrEqual(tokenize(fr.moves).length);
    const moves = timed([...tokenize(fr.moves), ...tokenize(recognizeF2L(applyAlg(start, fr.moves), 'BL')!.moves)]);
    const pairs = analyzeF2L(start, moves, analyzeSolve(start, moves)).filter((p) => p.slots.length);
    expect(pairs[0].slots).toEqual(['RF']);
    expect(pairs[0].better).toEqual({ slot: 'LB', caseId: bl.case.id, moves: tokenize(bl.moves).length });
    expect(pairs[1].better).toBeNull();
  });
});
