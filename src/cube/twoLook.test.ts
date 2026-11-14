import { describe, expect, it } from 'vitest';
import { applyAlg, invertAlg, isSolved, normalizeCenters, SOLVED } from './facelets';
import { isF2LSolved } from './cfop';
import { aufToSolve, llCornersPermuted, llEdgesOriented, llOriented, randomLLState, type Rng } from './states';
import {
  applyStep, classifyOcll, classifyOllEdges, classifyPllCorners, classifyPllEdges, classifyStep, OCLL_CASES,
  OLL_EDGES_CASES, PLL_CORNERS_CASES, PLL_EDGES_CASES, planSteps, preAufFor, TWO_LOOK_OLL, TWO_LOOK_PLL,
  TWO_LOOK_STEPS, type TwoLookMatch, type TwoLookStepId,
} from './twoLook';

function seeded(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const orientedEdges = (s: string) => [1, 3, 5, 7].filter((i) => s[i] === 'U'); // UB, UL, UR, UF
const setup = (alg: string) => normalizeCenters(applyAlg(SOLVED, invertAlg(alg)));

describe('2-look step-1 cases', () => {
  it('edge cases have the standard patterns at AUF ""', () => {
    const [line, l, dot] = OLL_EDGES_CASES;
    expect(orientedEdges(setup(line.alg))).toEqual([3, 5]); // horizontal line
    expect(orientedEdges(setup(l.alg))).toEqual([5, 7]); // front + right (checked against cubing.js)
    expect(orientedEdges(setup(dot.alg))).toEqual([]);
  });

  it('every step alg preserves F2L', () => {
    for (const id of Object.keys(TWO_LOOK_STEPS) as TwoLookStepId[]) {
      for (const c of TWO_LOOK_STEPS[id].cases) {
        for (const a of [c.alg, ...(c.alts ?? [])]) expect(isF2LSolved(setup(a), 'D')).toBe(true);
      }
    }
  });

  it('corner cases: headlights (T) and diagonal (Y) need corner permutation; edges cases do not', () => {
    for (const c of PLL_CORNERS_CASES) {
      expect(llOriented(setup(c.alg))).toBe(true);
      expect(llCornersPermuted(setup(c.alg))).toBe(false);
    }
    for (const c of PLL_EDGES_CASES) expect(llCornersPermuted(setup(c.alg))).toBe(true);
    for (const c of OCLL_CASES) expect(llEdgesOriented(setup(c.alg))).toBe(true);
  });

  it('Aa (alternative) solves headlights from some AUF', () => {
    const headlights = PLL_CORNERS_CASES[0];
    for (const a of ['', 'U', 'U2', "U'"]) {
      const s = applyAlg(setup(headlights.alg), a);
      expect(preAufFor(s, headlights.alts![0], TWO_LOOK_STEPS.pllCorners.isDone)).not.toBeNull();
    }
  });
});

describe('classifiers', () => {
  it('skip on solved, null when the precondition fails', () => {
    for (const id of Object.keys(TWO_LOOK_STEPS) as TwoLookStepId[]) expect(classifyStep(id, SOLVED)).toBe('skip');
    const unoriented = setup("F R U R' U' F'");
    expect(classifyOcll(unoriented)).toBeNull();
    expect(classifyPllCorners(unoriented)).toBeNull();
    expect(classifyPllEdges(setup(PLL_CORNERS_CASES[1].alg))).toBeNull(); // diagonal corners
  });

  it('recognise each case from every AUF and return the AUF that works', () => {
    const checks: [TwoLookStepId, typeof OLL_EDGES_CASES][] = [
      ['ollEdges', OLL_EDGES_CASES], ['ocll', OCLL_CASES], ['pllCorners', PLL_CORNERS_CASES], ['pllEdges', PLL_EDGES_CASES],
    ];
    for (const [step, cases] of checks) {
      for (const c of cases) {
        for (const a of ['', 'U', 'U2', "U'"]) {
          const s = applyAlg(setup(c.alg), a);
          const r = classifyStep(step, s) as TwoLookMatch;
          expect(r.case.id, `${c.id} after ${a}`).toBe(c.id);
          expect(TWO_LOOK_STEPS[step].isDone(applyStep(s, r))).toBe(true);
        }
      }
    }
    expect((classifyOllEdges(setup(OLL_EDGES_CASES[1].alg)) as TwoLookMatch).preAuf).toBe('');
    // Ua shown with a pre-AUF that needs a finishing U move: postAuf completes the solve.
    const ua = applyAlg(setup("M2 U M U2 M' U M2"), 'U');
    const r = classifyPllEdges(ua) as TwoLookMatch;
    expect(isSolved(applyStep(ua, r))).toBe(true);
  });

  it('every random LL state: each step is recognised, and applying the shown AUF + alg completes it', () => {
    const rng = seeded(7);
    const seen = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const start = randomLLState('D', rng);
      const plan = planSteps(start, [...TWO_LOOK_OLL, ...TWO_LOOK_PLL]);
      expect(plan, `unclassified ${start}`).not.toBeNull();
      let s = start;
      for (const p of plan!) {
        expect(p.before).toBe(s);
        if (p.result !== 'skip') {
          const r = p.result;
          seen.set(r.case.id, (seen.get(r.case.id) ?? 0) + 1);
          s = normalizeCenters(applyAlg(s, `${r.preAuf} ${r.case.alg} ${r.postAuf}`));
        } else seen.set(`skip ${p.step}`, (seen.get(`skip ${p.step}`) ?? 0) + 1);
        expect(TWO_LOOK_STEPS[p.step].isDone(s)).toBe(true);
        expect(isF2LSolved(s, 'D')).toBe(true);
      }
      // A PLL-edges skip can still leave a final AUF.
      expect(aufToSolve(s)).not.toBeNull();
    }
    // Every case occurs (skips of the edge steps are rarer but appear in 1000 samples).
    for (const c of [...OLL_EDGES_CASES, ...OCLL_CASES, ...PLL_CORNERS_CASES, ...PLL_EDGES_CASES]) {
      expect(seen.get(c.id) ?? 0, c.id).toBeGreaterThan(0);
    }
    for (const step of ['ollEdges', 'ocll', 'pllCorners', 'pllEdges']) expect(seen.get(`skip ${step}`) ?? 0, step).toBeGreaterThan(0);
  });

  it('classifiers agree with the generic one', () => {
    const s = randomLLState('D', seeded(3));
    expect(classifyOllEdges(s)).toEqual(classifyStep('ollEdges', s));
  });
});
