import { describe, expect, it } from 'vitest';
import { applyAlg, invertAlg, SOLVED, tokenize } from './facelets';
import { analyzeSolve, type TimedMove } from './cfop';
import { CASE_BY_ID } from './algs';
import { toFaceTurns } from './faceTurns';
import { findPauses, pauseLabel, pauseThreshold, pauseTotals } from './pauses';

const alg = (id: string) => CASE_BY_ID.get(id)!.alg;

/**
 * A solve from `parts`, 100 ms per move; a `.` inside a part adds a 1 s pause before the next move.
 * The start state is the one the whole sequence solves.
 */
function solveOf(parts: string[]): { start: string; moves: TimedMove[] } {
  const moves: TimedMove[] = [];
  let t = 0;
  let pause = false;
  for (const p of parts) {
    for (const chunk of p.split(/(\.)/)) {
      if (chunk === '.') { pause = true; continue; }
      for (const m of tokenize(toFaceTurns(chunk))) {
        if (moves.length) t += pause ? 1100 : 100;
        pause = false;
        moves.push({ move: m, t });
      }
    }
  }
  const start = applyAlg(SOLVED, invertAlg(moves.map((m) => m.move).join(' ')));
  return { start, moves };
}

const summary = (parts: string[]) => {
  const { start, moves } = solveOf(parts);
  return findPauses(moves, analyzeSolve(start, moves)).map((p) => [p.kind, p.stage, p.where ?? p.caseId ?? null]);
};

describe('pauses', () => {
  it('threshold is max(0.5 s, 3x median gap)', () => {
    const at = (ts: number[]) => ts.map((t) => ({ move: 'R', t }));
    expect(pauseThreshold(at([0, 100, 200, 300]))).toBe(500);
    expect(pauseThreshold(at([0, 300, 600, 900, 2000]))).toBe(900);
    expect(pauseThreshold([])).toBe(500);
  });

  it('a fluent solve has no pauses', () => {
    expect(summary(["F", "U R U' R'", "U' L' U L", alg('OLL 27'), alg('PLL T')])).toEqual([]);
  });

  it('classifies cross, F2L lookahead (between / inside a pair), recognition and mid-alg pauses', () => {
    const r = summary([
      'F . R', // cross done after both moves (the two back slots come solved with it)
      ". U R . U' R'", // pair 3: found after a pause, paused inside
      ". U' L' U L", // pair 4
      `. ${alg('OLL 27')}`.replace("R U R' U R", "R U R' . U R"), // recognition, then mid-alg in Sune
      `U . ${alg('PLL T')} . U`, // pre-AUF then recognition, final AUF after a pause
    ]);
    expect(r).toEqual([
      ['lookahead', 'Cross', null],
      ['lookahead', 'Pair 3', 'between pairs'],
      ['lookahead', 'Pair 3', 'inside pair'],
      ['lookahead', 'Pair 4', 'between pairs'],
      ['recognition', 'OLL', 'OLL 27'],
      ['mid-alg', 'OLL', 'OLL 27'],
      ['recognition', 'PLL', 'PLL T'],
      ['recognition', 'AUF', null],
    ]);
  });

  it('mid-alg pauses carry the alg and the drill to practise it; 2-look steps use their own drills', () => {
    const { start, moves } = solveOf([`F R U R' . U' F'`, alg('OLL 27'), alg('PLL Jb')]);
    const ps = findPauses(moves, analyzeSolve(start, moves));
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ kind: 'mid-alg', stage: 'OLL edges', caseId: '2L OLL Line', drillId: '2L OLL edges', duration: 1100 });
    expect(pauseLabel(ps[0])).toContain('Line');
    expect(pauseTotals(ps)).toEqual({ recognition: 0, lookahead: 0, 'mid-alg': 1100 });
  });

  it('pause before the AUF after an OLL with a PLL skip is AUF recognition', () => {
    expect(summary([alg('OLL 27'), '. U'])).toEqual([['recognition', 'AUF', null]]);
  });

  it('old analyses without llSteps still get stages', () => {
    const { start, moves } = solveOf([`U . ${alg('OLL 27')}`, `. ${alg('PLL T')}`]);
    const sp = analyzeSolve(start, moves);
    delete sp.llSteps;
    expect(findPauses(moves, sp).map((p) => [p.kind, p.stage])).toEqual([['recognition', 'OLL'], ['recognition', 'PLL']]);
  });
});
