import { describe, expect, it } from 'vitest';
import { applyAlg, invertAlg, SOLVED, tokenize } from './facelets';
import { analyzeSolve, llCaseTags, type TimedMove } from './cfop';
import { toFaceTurns } from './faceTurns';
import { randomLLState, type Rng } from './states';
import { planSteps } from './twoLook';
import { CASE_BY_ID } from './algs';

function seeded(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A solve of `parts` (algs, done as a smart cube reports them), 100 ms per move, from the state they solve. */
function solveOf(parts: string[]): { start: string; moves: TimedMove[]; bounds: number[] } {
  const moves: TimedMove[] = [];
  const bounds: number[] = [];
  for (const p of parts) {
    for (const m of tokenize(toFaceTurns(p))) moves.push({ move: m, t: (moves.length + 1) * 100 });
    bounds.push(moves.length);
  }
  const start = applyAlg(SOLVED, invertAlg(moves.map((m) => m.move).join(' ')));
  return { start, moves, bounds };
}

const alg = (id: string) => CASE_BY_ID.get(id)!.alg;

describe('last-layer segmentation', () => {
  it('2-look OLL + 2-look PLL: four sub-steps with the right cases, times and move ranges', () => {
    const rng = seeded(21);
    let checked = 0;
    for (let n = 0; n < 400 && checked < 60; n++) {
      const plan = planSteps(randomLLState('D', rng), ['ollEdges', 'ocll', 'pllCorners', 'pllEdges']);
      if (!plan || plan.some((p) => p.result === 'skip')) continue;
      const parts = plan.map((p) => (p.result === 'skip' ? '' : `${p.result.preAuf} ${p.result.case.alg} ${p.result.postAuf}`));
      const { start, moves, bounds } = solveOf(parts);
      const r = analyzeSolve(start, moves);
      expect(r.crossFace).toBe('D');
      expect(r.moveCounts.f2l).toBe(0);
      const steps = r.llSteps!;
      expect(steps.map((s) => s.kind)).toEqual(['OLL edges', 'OCLL', 'PLL corners', 'PLL edges']);
      expect(steps.map((s) => s.caseId)).toEqual(plan.map((p) => (p.result === 'skip' ? null : p.result.case.id)));
      // Step boundaries = where each alg ended (preAufs belong to the next step).
      expect(steps.map((s) => s.endMove)).toEqual(bounds);
      expect(steps.map((s) => s.startMove)).toEqual([0, ...bounds.slice(0, 3)]);
      expect(steps[3].end).toBe(moves[moves.length - 1].t);
      expect(steps[1].start).toBe(moves[bounds[0] - 1].t);
      checked++;
    }
    expect(checked).toBe(60);
  });

  it('1-look OLL + 1-look PLL', () => {
    // A state solved by OLL 33 then Ga: set up by inverting both.
    const { start, moves } = solveOf([alg('OLL 33'), alg('PLL Ga')]);
    const r = analyzeSolve(start, moves);
    expect(r.llSteps!.map((s) => [s.kind, s.caseId])).toEqual([['OLL', 'OLL 33'], ['PLL', 'PLL Ga']]);
    expect(r.ollCase).toBe('OLL 33');
  });

  it('OCLL case and edges-only PLL are 1-look (no checkpoint to pass)', () => {
    const { start, moves } = solveOf([alg('OLL 26'), alg('PLL Ua')]);
    expect(analyzeSolve(start, moves).llSteps!.map((s) => [s.kind, s.caseId])).toEqual([['OLL', 'OLL 26'], ['PLL', 'PLL Ua']]);
  });

  it('mixed: 2-look OLL, then 1-look PLL', () => {
    const { start, moves } = solveOf(["F R U R' U' F'", alg('OLL 27'), alg('PLL Jb')]);
    const steps = analyzeSolve(start, moves).llSteps!;
    expect(steps.map((s) => s.kind)).toEqual(['OLL edges', 'OCLL', 'PLL']);
    expect(steps[0].caseId).toBe('2L OLL Line');
    expect(steps[2].caseId).toBe('PLL Jb');
    expect(llCaseTags(analyzeSolve(start, moves))).toEqual(['Line + OLL 27', 'PLL Jb']);
    expect(llCaseTags({ ollCase: 'OLL 5', pllCase: 'PLL skip' })).toEqual(['OLL 5', 'PLL skip']); // older solves
  });

  it('skips: OLL skip has no OLL step; AUF-only PLL has no PLL step', () => {
    const pllOnly = solveOf([alg('PLL T')]);
    expect(analyzeSolve(pllOnly.start, pllOnly.moves).llSteps!.map((s) => s.kind)).toEqual(['PLL']);
    const ollThenAuf = solveOf([alg('OLL 27'), 'U']);
    expect(analyzeSolve(ollThenAuf.start, ollThenAuf.moves).llSteps!.map((s) => s.kind)).toEqual(['OLL']);
  });

  it("a 1-look OLL alg that passes no clean checkpoint stays 1-look (OLL 3)", () => {
    const { start, moves } = solveOf([alg('OLL 3')]);
    expect(analyzeSolve(start, moves).llSteps!.map((s) => s.kind)).toEqual(['OLL']);
  });
});
