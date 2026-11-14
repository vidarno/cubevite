import { describe, expect, it } from 'vitest';
import { applyAlg, invertAlg, SOLVED, tokenize } from './facelets';
import { analyzeSolve, type TimedMove } from './cfop';
import { CASE_BY_ID } from './algs';
import { toFaceTurns } from './faceTurns';
import { analyzeCross, analyzeSmartSolve, moveNearest } from './analysis';

const alg = (id: string) => CASE_BY_ID.get(id)!.alg;

/** Parts as raw tokens, 100 ms per move, plus extra delay before the given move indices. */
function solveOf(parts: string[], delays: Record<number, number> = {}) {
  let t = 0;
  const moves: TimedMove[] = tokenize(parts.join(' ')).map((move, i) => ({ move, t: (t += 100 + (delays[i] ?? 0)) }));
  return { start: applyAlg(SOLVED, invertAlg(moves.map((m) => m.move).join(' '))), moves };
}

// Cross (2) + two pairs (4 each; pairs 1-2 are solved with the cross) + Sune + U T-perm.
const PARTS = ['F R', "U R U' R'", "U' L' U L", alg('OLL 27'), 'U', toFaceTurns(alg('PLL T'))];

describe('analyzeSmartSolve', () => {
  it('stages per move form contiguous bands covering the solve', () => {
    const { start, moves } = solveOf(PARTS);
    const a = analyzeSmartSolve(start, moves)!;
    expect(a.stages).toHaveLength(moves.length);
    expect(a.bands.map((b) => b.stage)).toEqual(['Cross', 'Pair 3', 'Pair 4', 'OLL', 'PLL']);
    expect(a.bands.map((b) => b.coarse)).toEqual(['Cross', 'F2L', 'F2L', 'OLL', 'PLL']);
    expect(a.bands[0]).toMatchObject({ startMove: 0, endMove: 2, start: 0, end: 200 });
    for (let i = 1; i < a.bands.length; i++) {
      expect(a.bands[i].startMove).toBe(a.bands[i - 1].endMove);
      expect(a.bands[i].start).toBe(a.bands[i - 1].end);
    }
    expect(a.bands[a.bands.length - 1].endMove).toBe(moves.length);
    expect(a.algs).toEqual([{ kind: 'OLL', label: 'OLL 27 (Sune)' }, { kind: 'PLL', label: 'T-perm' }]);
  });

  it('a clean solve has no pauses, errors or losses', () => {
    const { start, moves } = solveOf(PARTS);
    const a = analyzeSmartSolve(start, moves)!;
    expect([a.pauses, a.errors, a.biggestLoss, a.pauseMs, a.wastedMoves]).toEqual([[], [], null, 0, 0]);
  });

  it('biggest loss is the largest pause or error', () => {
    // 1 s pause inside the Sune (move 13 = its 4th move), an R R' cancellation in the cross.
    const parts = ["F R R' R", ...PARTS.slice(1)];
    const { start, moves } = solveOf(parts, { 13: 1000 });
    const a = analyzeSmartSolve(start, moves)!;
    expect(a.pauses.map((p) => p.kind)).toEqual(['mid-alg']);
    expect(a.errors.map((e) => e.kind)).toEqual(['cancellation']);
    expect(a.biggestLoss).toMatchObject({ source: 'pause', ms: 1100, at: 13 });
    expect(a.biggestLoss!.label).toMatch(/mid-algorithm: OLL 27/);
    expect(a.wastedMoves).toBe(2);

    const slow = solveOf(parts, { 2: 3000, 13: 1000 }); // a slow cancellation: the error includes the 3 s pause
    expect(analyzeSmartSolve(slow.start, slow.moves)!.biggestLoss).toMatchObject({ source: 'error', ms: 3200, at: 1 });
  });

  it('re-analyses splits saved without last-layer steps', () => {
    const { start, moves } = solveOf(PARTS);
    const { llSteps: _drop, ...old } = analyzeSolve(start, moves);
    const a = analyzeSmartSolve(start, moves, old)!;
    expect(a.splits.llSteps).toHaveLength(2);
    expect(a.algs.map((x) => x.kind)).toEqual(['OLL', 'PLL']);
  });

  it('moveNearest', () => {
    const { moves } = solveOf(['R U', "R'"]);
    expect([moveNearest(moves, 0), moveNearest(moves, 160), moveNearest(moves, 1e6)]).toEqual([0, 1, 2]);
  });
});

describe('cross analysis', () => {
  it('compares your cross with the optimal for the colour used, in the cross-down frame', () => {
    const start = applyAlg(SOLVED, 'F R'); // white (cube-frame U) cross: 2 moves
    const c = analyzeCross(start, ["R'", 'U', "U'", 'R', "R'", "F'"], 'U');
    expect(c).toMatchObject({ face: 'U', colour: 'white', front: 'green', moves: 2, optimal: 2 });
    // z2 puts white on the bottom: cube R' F' is L' F' when held that way.
    expect(c.yourAlg).toBe("L' F'");
    expect(c.solutions).toContain("L' F'");
  });

  it('is part of every smart solve analysis', () => {
    const { start, moves } = solveOf(['R U', ...PARTS]); // two extra moves before the cross
    const a = analyzeSmartSolve(start, moves)!;
    expect(a.cross.face).toBe(a.splits.crossFace);
    expect(a.cross.moves).toBe(a.splits.moveCounts.cross);
    expect(a.cross.optimal).toBeLessThanOrEqual(a.cross.moves);
    expect(a.cross.solutions.length).toBeGreaterThan(0);
    for (const sol of a.cross.solutions) expect(sol.split(' ')).toHaveLength(a.cross.optimal);
  });
});

describe('F2L in the analysis', () => {
  it('a DB F2L alg that breaks the cross on purpose (F moves) is not an error', () => {
    const f2l10 = "F U R U' R' F' R U' R'"; // F2L 10: the F turns take a cross edge out for 6 moves
    const { start, moves } = solveOf([f2l10]);
    const withoutFilter = analyzeSolve(start, moves);
    expect(withoutFilter.pairMoves.length).toBeGreaterThan(0);
    const a = analyzeSmartSolve(start, moves)!;
    expect(a.f2l.find((p) => p.slots.length)?.caseId).toBe('F2L 10');
    expect(a.f2l.find((p) => p.slots.length)?.usedAlg).toBe('main');
    expect(a.errors.filter((e) => e.kind === 'broken cross')).toEqual([]);
  });

  it('the same break is still reported when it is not a DB alg', () => {
    // F (cross broken) ... 5 unrelated moves ... F' (rebuilt): breaks the cross for 6 moves.
    const { start, moves } = solveOf(["R U R'", "F R U R' U' F'", "R U' R'"]);
    const a = analyzeSmartSolve(start, moves)!;
    expect(a.f2l.some((p) => p.usedAlg)).toBe(false);
    expect(a.errors.some((e) => e.kind === 'broken cross')).toBe(true);
  });
});
