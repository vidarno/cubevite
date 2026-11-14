import { describe, expect, it } from 'vitest';
import { applyAlg, invertAlg, SOLVED, tokenize } from './facelets';
import { analyzeSolve, type TimedMove } from './cfop';
import { CASE_BY_ID, OLL, PLL } from './algs';
import { toFaceTurns } from './faceTurns';
import { errorLabel, findErrors, wasteByStage } from './errors';

const alg = (id: string) => CASE_BY_ID.get(id)!.alg;

/** A solve of `parts` as a smart cube reports it (quarter turns, X2 = X X), 100 ms per move. */
function solveOf(parts: string[]) {
  const moves: TimedMove[] = parts.flatMap((p) => tokenize(toFaceTurns(p)))
    .flatMap((m) => (m.endsWith('2') ? [m[0], m[0]] : [m]))
    .map((move, i) => ({ move, t: i * 100 }));
  const start = applyAlg(SOLVED, invertAlg(moves.map((m) => m.move).join(' ')));
  return { start, moves };
}
/** Like solveOf, but keeps the parts' tokens as given (no merging). */
function rawSolveOf(parts: string[]) {
  const moves: TimedMove[] = tokenize(parts.join(' ')).map((move, i) => ({ move, t: i * 100 }));
  return { start: applyAlg(SOLVED, invertAlg(moves.map((m) => m.move).join(' '))), moves };
}
const errorsOf = ({ start, moves }: { start: string; moves: TimedMove[] }) => findErrors(start, moves, analyzeSolve(start, moves));
const brief = (s: { start: string; moves: TimedMove[] }) => errorsOf(s).map((e) => [e.kind, e.stage, e.moves, e.detail ?? null]);

const FLUENT = ['F R', "U R U' R'", "U' L' U L", alg('OLL 27'), `U ${alg('PLL T')}`];

describe('solve errors', () => {
  it('a clean solve (half turns as two quarter turns, slices, every DB alg) has no errors', () => {
    expect(brief(solveOf(FLUENT))).toEqual([]);
    for (const c of [...OLL, ...PLL]) {
      for (const a of [c.alg, ...(c.alts ?? [])]) expect(brief(solveOf([a])), `${c.id}: ${a}`).toEqual([]);
    }
  });

  it('cancellations and overturns', () => {
    expect(brief(rawSolveOf(['F R R\' R', ...FLUENT.slice(1)]))).toEqual([['cancellation', 'Cross', 2, "R R'"]]);
    expect(brief(rawSolveOf(["F R' R' R'", ...FLUENT.slice(1)]))).toEqual([['cancellation', 'Cross', 2, "R' R' R'"]]);
  });

  it('extra AUFs in the last layer', () => {
    expect(brief(rawSolveOf([...FLUENT.slice(0, 4), 'U U U U', FLUENT[4]]))).toEqual([['extra AUF', 'PLL', 4, 'U U U U']]);
    expect(brief(rawSolveOf([...FLUENT.slice(0, 4), "U U'", FLUENT[4]]))).toEqual([['extra AUF', 'PLL', 2, "U U'"]]);
    // U moves in F2L are not AUFs
    expect(brief(rawSolveOf(['F R', "U U U R U' R'", ...FLUENT.slice(2)]))).toEqual([['cancellation', 'Pair 3', 2, 'U U U']]);
  });

  it('loops: undone and redone F2L pair; restarted alg in the last layer', () => {
    const pair = solveOf(['F R', "U R U' R'", "R U R' U'", "U R U' R'", ...FLUENT.slice(2)]);
    expect(brief(pair)).toEqual([['loop', 'Pair 3', 8, null]]);
    const restart = rawSolveOf([...FLUENT.slice(0, 3), "R U R' R U' R'", ...FLUENT.slice(3)]);
    const errs = errorsOf(restart);
    expect(errs.map((e) => [e.kind, e.stage, e.moves])).toEqual([['restarted alg', 'OLL', 6]]);
    expect(errs[0].ms).toBe(600);
    expect(errorLabel(errs[0])).toBe('restarted the alg: 6 moves wasted');
  });

  it('broken pair: a solved pair taken out, another pair solved, then rebuilt', () => {
    // R U R' takes the solved green-red pair out; B U B' solves the blue-red pair; U R U R' re-inserts it.
    const s = solveOf(["R U R' B U B' U R U R'"]);
    const errs = errorsOf(s);
    expect(errs.map((e) => [e.kind, e.detail, e.moves, e.start, e.end])).toEqual([['broken pair', 'red-green pair', 10, 0, 10]]);
    expect(errorLabel(errs[0])).toBe('broke the red-green pair, rebuilt after 10 moves');
    // B U B' breaks the cross for two moves: technique, not an error. Short breaks of a pair likewise.
    expect(brief(solveOf(["U' R U R' U R U' R'"]))).toEqual([]);
  });

  it('waste per stage', () => {
    const s = rawSolveOf(['F R R\' R', "U R U' R'", "U' L' U L", alg('OLL 27'), 'U U U U', FLUENT[4]]);
    expect(wasteByStage(errorsOf(s))).toEqual([
      { stage: 'Cross', count: 1, moves: 2, ms: 200 },
      { stage: 'PLL', count: 1, moves: 4, ms: 400 },
    ]);
  });
});
