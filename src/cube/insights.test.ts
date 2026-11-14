import { describe, expect, it } from 'vitest';
import { applyAlg, invertAlg, SOLVED, tokenize } from './facelets';
import { analyzeSolve, type TimedMove } from './cfop';
import { CASE_BY_ID } from './algs';
import { toFaceTurns } from './faceTurns';
import { solveInsights, stepTiming, trimmedMean, weakestCaseIds } from './insights';
import { weakestDrill, WEAKEST_DRILL_ID } from './learningPath';

const alg = (id: string) => toFaceTurns(CASE_BY_ID.get(id)!.alg);

/** A recorded smart solve of `parts`, 100 ms per move plus `delays[i]` before move i. */
function solve(parts: string[], delays: Record<number, number> = {}) {
  let t = 0;
  const moves: TimedMove[] = tokenize(parts.join(' ')).map((move, i) => ({ move, t: (t += 100 + (delays[i] ?? 0)) }));
  const start = applyAlg(SOLVED, invertAlg(moves.map((m) => m.move).join(' ')));
  return { start, moves, splits: analyzeSolve(start, moves), time: t };
}

// Cross (2 moves) + two pairs (4 each) = 10 moves, then the last layer.
const F2L = ['F R', "U R U' R'", "U' L' U L"];
const SUNE = alg('OLL 27'); // 7 moves
const T = alg('PLL T'); // 14 moves
const UA = alg('PLL Ua');

describe('stepTiming', () => {
  it('recognition runs to the first alg move (pre-AUF included), execution to the step end', () => {
    // 1 s before the U pre-AUF of the T-perm (move 17), then T from move 18.
    const s = solve([...F2L, SUNE, 'U', T], { 17: 1000 });
    const pll = s.splits.llSteps!.find((x) => x.kind === 'PLL')!;
    expect(pll.startMove).toBe(17);
    const t = stepTiming(pll, s.moves, s.splits.crossFace!);
    expect(t.recognition).toBe(1200); // the 1.1 s gap + the U move
    expect(t.execution).toBe(13 * 100);
  });
});

describe('solveInsights', () => {
  it('per-case recognition / execution means and the weakest cases', () => {
    const solves = [
      solve([...F2L, SUNE, 'U', T], { 17: 1000 }), // slow recognition of T
      solve([...F2L, SUNE, 'U', T], { 17: 2000, 22: 1500 }), // slower, plus a mid-alg pause
      solve([...F2L, SUNE, 'U', UA]),
    ];
    const ins = solveInsights(solves);
    expect(ins.n).toBe(3);
    const t = ins.cases.find((c) => c.caseId === 'PLL T')!;
    expect(t).toMatchObject({ name: 'T-perm', kinds: ['PLL'], drillId: 'PLL', count: 2, recognition: 1700 });
    expect(t.execution).toBe(1300 + 750);
    expect(t.midAlgRate).toBe(0.5);
    const sune = ins.cases.find((c) => c.caseId === 'OLL 27')!;
    expect(sune.count).toBe(3);
    // T is slower than Ua at the same step kind, and its mid-alg pause adds to the score.
    expect(weakestCaseIds(ins, 1)).toEqual(['PLL T']);
    // Ua is faster than the PLL median; Sune and Antisune (OLL step) are equal, at the median: not weak.
    expect(weakestCaseIds(ins)).toEqual(['PLL T']);
    expect(ins.cases.findIndex((c) => c.caseId === 'PLL T')).toBeLessThan(ins.cases.findIndex((c) => c.caseId === 'PLL Ua'));
    expect(ins.pausePerSolve['mid-alg']).toBeCloseTo(1600 / 3);
  });

  it('frequent errors grouped by kind and stage, waste per solve', () => {
    const solves = [solve(["F R R' R", ...F2L.slice(1), SUNE, 'U', T]), solve(["F R R' R", ...F2L.slice(1), SUNE, 'U U U U U', T]), solve([...F2L, SUNE, 'U', T])];
    const ins = solveInsights(solves);
    expect(ins.errors.map((e) => [e.kind, e.stage, e.count, e.solves, e.moves])).toEqual([
      ['cancellation', 'Cross', 2, 2, 4], // same time lost (400 ms), more frequent first
      ['extra AUF', 'PLL', 1, 1, 4],
    ]);
    expect(ins.wastePerSolve.moves).toBeCloseTo(8 / 3);
  });

  it('stage averages over the last 12 and all solves', () => {
    const solves = Array.from({ length: 14 }, (_, i) => solve([...F2L, SUNE, T], { 0: i * 100 }));
    const ins = solveInsights(solves);
    const row = (s: string) => ins.stages.find((x) => x.stage === s)!;
    // Cross = 200 ms + delay; the last 12 have delays 200..1300, trimmed mean drops 200 and 1300.
    expect(row('Cross').last12).toBeCloseTo(200 + 750);
    expect(row('Cross').all).toBeCloseTo(200 + 650);
    expect(row('F2L').all).toBe(800);
    expect(row('OLL').all).toBe(700);
    expect(row('PLL').all).toBe(1400);
    expect(row('LL recognition').all).toBe(200); // first move of each alg
  });

  it('skips manual solves and limits to the most recent solves', () => {
    const ins = solveInsights([{ time: 9000 }, solve([...F2L, SUNE, T]), solve([...F2L, SUNE, UA])], 1);
    expect(ins.n).toBe(1);
    expect(ins.cases.map((c) => c.caseId).sort()).toEqual(['OLL 27', 'PLL Ua']);
    expect(solveInsights([{ time: 9000 }]).stages.every((s) => s.all === undefined)).toBe(true);
  });

  it('trimmedMean', () => {
    expect(trimmedMean([])).toBeUndefined();
    expect(trimmedMean([1, 2, 6])).toBe(3);
    expect(trimmedMean([100, 1, 2, 3, 4])).toBe(3);
  });
});

describe('weakest drill', () => {
  it('mixes the given cases from their own drills, dropping unknown ids', () => {
    const d = weakestDrill(['PLL T', 'OLL 27', '2L OLL Line', 'nope']);
    expect(d.id).toBe(WEAKEST_DRILL_ID);
    expect(d.cases.map((c) => c.id)).toEqual(['PLL T', 'OLL 27', '2L OLL Line']);
    for (const c of d.cases) expect(d.steps[0].isDone(d.pickTarget(c), c)).toBe(false);
  });
});
