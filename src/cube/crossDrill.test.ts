import { describe, expect, it } from 'vitest';
import { applyAlg, FACES, normalizeCenters, SOLVED } from './facelets';
import { faceletsToPatternData } from './kpattern';
import { isCrossSolved } from './cfop';
import { crossDistance } from './crossSolver';
import { crossReport, randomStateWithCrossLength, randomUnsolvedCrossState } from './crossDrill';
import { advanceSteps, CROSS_ANY, CROSS_DRILL, crossLevel, crossPlans, toCrossDown, undoMoves } from './drills';
import { permParity, type Rng } from './states';

function seeded(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expectValid(s: string) {
  const d = faceletsToPatternData(s);
  expect(new Set(d.CORNERS.pieces).size).toBe(8);
  expect(new Set(d.EDGES.pieces).size).toBe(12);
  expect(permParity(d.CORNERS.pieces)).toBe(permParity(d.EDGES.pieces));
  expect(d.CORNERS.orientation.reduce((a, b) => a + b, 0) % 3).toBe(0);
  expect(d.EDGES.orientation.reduce((a, b) => a + b, 0) % 2).toBe(0);
}

describe('cross drill states', () => {
  it('randomStateWithCrossLength gives valid states with exactly that optimal cross, any face', () => {
    const rng = seeded(1);
    for (const face of FACES) {
      for (let d = 1; d <= 8; d++) {
        for (let i = 0; i < 5; i++) {
          const s = randomStateWithCrossLength(face, d, rng);
          expectValid(s);
          expect(crossDistance(s, face)).toBe(d);
        }
      }
    }
  });

  it('fills the rest of the cube at random', () => {
    const rng = seeded(2);
    const states = new Set(Array.from({ length: 50 }, () => randomStateWithCrossLength('U', 1, rng)));
    expect(states.size).toBe(50); // only 15 cross positions at 1 move, so the rest must vary
  });

  it('randomUnsolvedCrossState follows the real length distribution', () => {
    const rng = seeded(3);
    const hist = new Array(9).fill(0);
    for (let i = 0; i < 2000; i++) {
      const s = randomUnsolvedCrossState('U', rng);
      expectValid(s);
      hist[crossDistance(s, 'U')]++;
    }
    expect(hist[0]).toBe(0);
    // Expected shares: 6 moves ~51%, 5 ~24%, 7 ~18%.
    expect(hist[6] / 2000).toBeGreaterThan(0.45);
    expect(hist[6] / 2000).toBeLessThan(0.57);
    expect(hist[5] / 2000).toBeGreaterThan(0.2);
    expect(hist[7] / 2000).toBeGreaterThan(0.14);
  });
});

describe('cross report', () => {
  it('counts merged face turns and lists optimal solutions', () => {
    const start = applyAlg(SOLVED, "F R"); // U cross: 2 moves
    const r = crossReport(start, ["R'", 'U', "U'", "F'"], 'U');
    expect(r.optimal).toBe(2);
    expect(r.yourMoves).toBe(2); // U U' cancels
    expect(r.yourAlg).toBe("R' F'");
    expect(r.solutions).toContain("R' F'");
    for (const sol of r.solutions) expect(isCrossSolved(applyAlg(start, sol), 'U')).toBe(true);
  });

  it('R R counts as one move (R2)', () => {
    const start = applyAlg(SOLVED, 'R2');
    expect(crossReport(start, ['R', 'R'], 'U').yourMoves).toBe(1);
  });
});

describe('cross drill', () => {
  it('levels map to optimal cross lengths of the white (cube-frame U) cross', () => {
    const rng = seeded(4);
    expect(crossLevel(CROSS_DRILL.cases[0])).toBeNull();
    expect(CROSS_DRILL.defaultCases).toEqual([CROSS_ANY]);
    for (const c of CROSS_DRILL.cases) {
      const s = CROSS_DRILL.pickTarget(c, rng);
      const d = crossDistance(s, 'U');
      if (crossLevel(c) === null) expect(d).toBeGreaterThan(0);
      else expect(d).toBe(crossLevel(c));
      expect(advanceSteps(CROSS_DRILL, s, 0, c)).toBe(0);
      const sol = crossReport(s, [], 'U').solutions[0];
      expect(advanceSteps(CROSS_DRILL, applyAlg(s, sol), 0, c)).toBe(1);
    }
  });
});

describe('redo', () => {
  it('undoMoves reverses what was done (merged) and refuses a cube that moved on', () => {
    const target = applyAlg(SOLVED, "R U F' L2 D");
    const log = ['R', 'R', 'U', "U'", 'F', 'D'];
    const current = applyAlg(target, log.join(' '));
    const back = undoMoves(current, target, log);
    expect(back).toBe("D' F' R2");
    expect(applyAlg(current, back!)).toBe(target);
    expect(undoMoves(applyAlg(current, 'B'), target, log)).toBeNull();
    expect(undoMoves(target, target, [])).toBe('');
  });

  it('crossPlans are the optimal solutions in the cross-down frame', () => {
    const rng = seeded(9);
    for (let i = 0; i < 20; i++) {
      const s = CROSS_DRILL.pickTarget(CROSS_DRILL.cases[0], rng);
      const plans = crossPlans(s);
      expect(plans.length).toBeGreaterThan(0);
      for (const p of plans) {
        expect(p.alg.split(' ')).toHaveLength(crossDistance(s, 'U'));
        expect(isCrossSolved(normalizeCenters(applyAlg(toCrossDown(s), p.alg)), 'D')).toBe(true);
      }
    }
  });
});
