import { describe, expect, it } from 'vitest';
import { applyAlg, applyMove, invertMove, isSolved, parseMove, SOLVED, tokenize } from './facelets';
import { toFaceTurns } from './faceTurns';
import {
  advanceSteps, aufVariants, bestPlan, casePlans, DRILLS, hintPlans, pushAlgFollow, startAlgFollow, type AlgFollow, OCLL_DRILL, OLL_DRILL, OLL_EDGES_DRILL, PLL_CORNERS_DRILL, PLL_DRILL, PLL_EDGES_DRILL, pickCase,
  toCrossDown, toCubeFrame, TWO_LOOK_OLL_DRILL, TWO_LOOK_PLL_DRILL, type Drill,
} from './drills';
import { isCrossSolved } from './cfop';
import { OLL, PLL } from './algs';

const AUF = ['', 'U', 'U2', "U'"];
const fixed = (k: number) => () => (k + 0.5) / 4; // rng that picks AUF[k]

/** Apply a (display/cross-down frame) alg to a cube-frame state. */
const applyCrossDown = (state: string, alg: string) => toCubeFrame(applyAlg(toCrossDown(state), alg));

describe('frame helpers', () => {
  it('toCubeFrame inverts toCrossDown', () => {
    const s = applyAlg(SOLVED, "R U F' D2 L");
    expect(toCubeFrame(toCrossDown(s))).toBe(s);
    expect(toCrossDown(toCubeFrame(s))).toBe(s);
  });

  it('LL case targets keep the white (cube-frame U) cross', () => {
    for (const c of OLL_DRILL.cases.slice(0, 5)) expect(isCrossSolved(OLL_DRILL.pickTarget(c), 'U')).toBe(true);
  });
});

describe('OLL / PLL drills', () => {
  const check = (drill: Drill, algs: Map<string, string>) => {
    expect(drill.cases.length).toBe(algs.size);
    for (const c of drill.cases) {
      for (let k = 0; k < 4; k++) {
        const target = drill.pickTarget(c, fixed(k));
        expect(advanceSteps(drill, target, 0)).toBe(0);
        // undo the random pre-AUF, then the case alg finishes the drill
        const undo = AUF[k] ? invertMove(AUF[k]) : '';
        const after = applyCrossDown(target, `${undo} ${algs.get(c.id)}`);
        expect(advanceSteps(drill, after, 0), `${c.id} with AUF ${AUF[k]}`).toBe(drill.steps.length);
      }
    }
  };
  it('every OLL case is set up unsolved and finished by its alg', () => check(OLL_DRILL, new Map(OLL.map((c) => [c.id, c.alg]))));
  it('every PLL case is set up unsolved and finished by its alg', () => check(PLL_DRILL, new Map(PLL.map((c) => [c.id, c.alg]))));

  it('OLL is done before the cube is solved (PLL left)', () => {
    const tPerm = toCubeFrame(applyAlg(SOLVED, "R U R' U' R' F R2 U' R' U' R U R' F'"));
    expect(isSolved(tPerm)).toBe(false);
    expect(OLL_DRILL.steps[0].isDone(tPerm)).toBe(true);
    expect(PLL_DRILL.steps[0].isDone(tPerm)).toBe(false);
  });

  it('drill ids are unique and case ids unique within a drill', () => {
    expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
    for (const d of DRILLS) expect(new Set(d.cases.map((c) => c.id)).size).toBe(d.cases.length);
  });
});

describe('advanceSteps', () => {
  const twoStep: Drill = {
    id: 't', label: 't', group: 't', description: '', cases: [], pickTarget: () => SOLVED,
    steps: [
      { id: 'a', label: 'a', isDone: (s) => s[0] === 'U' },
      { id: 'b', label: 'b', isDone: isSolved },
    ],
  };
  it('skips steps completed together and stays put otherwise', () => {
    expect(advanceSteps(twoStep, SOLVED, 0)).toBe(2);
    const notSolved = applyAlg(SOLVED, 'R');
    expect(advanceSteps(twoStep, notSolved, 0)).toBe(1);
    expect(advanceSteps(twoStep, applyAlg(SOLVED, 'L'), 0)).toBe(0);
  });
});

describe('pickCase', () => {
  const cases = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('never repeats the previous case', () => {
    for (let i = 0; i < 50; i++) expect(pickCase(cases, {}, 'a').id).not.toBe('a');
    expect(pickCase([{ id: 'a' }], {}, 'a').id).toBe('a');
  });
  it('prefers slow and unseen cases', () => {
    const stats = { a: { times: [1000] }, b: { times: [5000] } };
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 3000; i++) counts[pickCase(cases, stats, undefined, rng).id]++;
    expect(counts.b).toBeGreaterThan(counts.a);
    expect(counts.c).toBeGreaterThan(counts.a);
  });
});

/** Do the step's hint (pre-AUF + alg + post-AUF) in the cross-down frame. */
const doHint = (drill: Drill, state: string, step: number) => {
  const h = drill.steps[step].classify!(state);
  expect(h, `${drill.id} step ${step} classified`).not.toBeNull();
  return applyCrossDown(state, `${h!.preAuf} ${h!.alg} ${h!.postAuf}`);
};

describe('2-look drills', () => {
  let seed = 11;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  it('step drills: every case is set up as that case, with the white cross, and its hint finishes the drill', () => {
    for (const drill of [OLL_EDGES_DRILL, OCLL_DRILL, PLL_CORNERS_DRILL, PLL_EDGES_DRILL]) {
      for (const c of drill.cases) {
        for (let i = 0; i < 5; i++) {
          const target = drill.pickTarget(c, rng);
          expect(isCrossSolved(target, 'U')).toBe(true);
          expect(advanceSteps(drill, target, 0)).toBe(0);
          expect(drill.steps[0].classify!(target)!.caseId).toBe(c.id);
          expect(advanceSteps(drill, doHint(drill, target, 0), 0), `${drill.id} ${c.id}`).toBe(1);
        }
      }
    }
  });

  it('combined drills: two steps, each classified, the first never skipped, hints solve the cube', () => {
    for (const drill of [TWO_LOOK_OLL_DRILL, TWO_LOOK_PLL_DRILL]) {
      expect(drill.steps).toHaveLength(2);
      for (let i = 0; i < 100; i++) {
        let s = drill.pickTarget(null, rng);
        expect(advanceSteps(drill, s, 0)).toBe(0);
        s = doHint(drill, s, 0);
        const step = advanceSteps(drill, s, 0);
        expect(step).toBeGreaterThanOrEqual(1);
        if (step === 1) s = doHint(drill, s, 1);
        expect(advanceSteps(drill, s, 0)).toBe(2);
        if (drill === TWO_LOOK_PLL_DRILL) expect(isSolved(s)).toBe(true);
      }
    }
  });

  it('alternatives come with their own AUFs and also complete the step', () => {
    for (let i = 0; i < 20; i++) {
      const target = PLL_CORNERS_DRILL.pickTarget(PLL_CORNERS_DRILL.cases[0], rng); // headlights
      const h = PLL_CORNERS_DRILL.steps[0].classify!(target)!;
      expect(h.alts).toHaveLength(1);
      const a = h.alts![0];
      expect(advanceSteps(PLL_CORNERS_DRILL, applyCrossDown(target, `${a.preAuf} ${a.alg}`), 0)).toBe(1);
    }
  });

  it('step-1 case diagrams use edge-only / corner-only modes', () => {
    expect(OLL_EDGES_DRILL.cases.map((c) => c.diagram!.mode)).toEqual(['EO', 'EO', 'EO']);
    expect(PLL_CORNERS_DRILL.cases.map((c) => c.label)).toEqual(['Headlights', 'Diagonal']);
    expect(PLL_CORNERS_DRILL.cases.every((c) => c.diagram!.mode === 'CP')).toBe(true);
  });
});

describe('following the alg while solving', () => {
  /** Perform a cross-down alg on the cube as a smart cube reports it: cube-frame face turns. */
  const asCubeTurns = (alg: string) => tokenize(toFaceTurns(`z2 ${alg} z2`)).flatMap((m) => {
    const { family, amount } = parseMove(m);
    return amount === 2 ? [family, family] : [m]; // smart cubes report quarter turns
  });

  const perform = (state: string, f: AlgFollow, moves: string[]) => {
    for (const m of moves) { state = applyMove(state, m); f = pushAlgFollow(f, m, state); }
    return { state, f };
  };

  it('every OLL/PLL case alg (and alt) can be followed to completion from a random AUF', () => {
    for (const drill of [OLL_DRILL, PLL_DRILL]) {
      for (const [k, c] of drill.cases.entries()) {
        const target = drill.pickTarget(c, fixed(k % 4));
        const plans = casePlans(drill, c, target);
        expect(plans.length, c.id).toBe(1 + (c.alts?.length ?? 0));
        plans.forEach((p, i) => {
          const r = perform(target, startAlgFollow(plans, target), asCubeTurns(`${p.preAuf} ${p.alg} ${p.postAuf}`));
          expect(r.f.progress[i].complete, `${c.id} plan ${i}`).toBe(true);
          expect(r.f.progress[i].fix).toEqual([]);
          expect(drill.steps[0].isDone(r.state, c)).toBe(true);
        });
      }
    }
  });

  it('a wrong turn gives an undo hint in the display frame, and undoing it gets back on track', () => {
    const c = PLL_DRILL.cases.find((x) => x.id === 'PLL T')!;
    const target = PLL_DRILL.pickTarget(c, fixed(0));
    const plans = casePlans(PLL_DRILL, c, target);
    const moves = asCubeTurns(`${plans[0].preAuf} ${plans[0].alg}`);
    let r = perform(target, startAlgFollow(plans, target), moves.slice(0, 3));
    const done = r.f.progress[0].done;
    expect(r.f.progress[0].fix).toEqual([]);
    // Cube-frame D is the display-frame U (yellow on top).
    r = perform(r.state, r.f, ['D']);
    expect(r.f.progress[0].fix).toEqual(["U'"]);
    expect(r.f.progress[0].done).toBe(done);
    r = perform(r.state, r.f, ["D'"]);
    expect(r.f.progress[0].fix).toEqual([]);
    r = perform(r.state, r.f, moves.slice(3));
    expect(r.f.progress[0].complete).toBe(true);
  });

  it('shows the alt the user is actually doing', () => {
    const c = PLL_DRILL.cases.find((x) => x.alts?.length)!;
    const target = PLL_DRILL.pickTarget(c, fixed(1));
    const plans = casePlans(PLL_DRILL, c, target);
    const alt = asCubeTurns(`${plans[1].preAuf} ${plans[1].alg}`);
    const r = perform(target, startAlgFollow(plans, target), alt.slice(0, Math.min(4, alt.length - 1)));
    expect(r.f.progress[1].fix).toEqual([]);
    expect(r.f.progress[bestPlan(r.f)].fix).toEqual([]);
  });

  it('symmetric cases accept every AUF that works (no false undo), and each variant solves', () => {
    const isDone = (c: Parameters<typeof casePlans>[1]) => (st: string) => PLL_DRILL.steps[0].isDone(st, c);
    const h = PLL_DRILL.cases.find((x) => x.id === 'PLL H')!;
    const target = PLL_DRILL.pickTarget(h, fixed(0));
    const plans = aufVariants(casePlans(PLL_DRILL, h, target), target, isDone(h));
    // H is symmetric: every pre-AUF works with every alg (some post-AUF).
    const algs = new Set(plans.map((p) => p.alg));
    expect(plans.length).toBe(4 * algs.size);
    for (const [i, p] of plans.entries()) {
      const r = perform(target, startAlgFollow(plans, target), asCubeTurns(`${p.preAuf} ${p.alg} ${p.postAuf}`));
      expect(r.f.progress[i].complete, `${p.preAuf} ${p.alg}`).toBe(true);
      expect(r.f.progress[bestPlan(r.f)].fix).toEqual([]);
    }
    // T has no symmetry: its plans stay as they are.
    const t = PLL_DRILL.cases.find((x) => x.id === 'PLL T')!;
    const tt = PLL_DRILL.pickTarget(t, fixed(2));
    expect(aufVariants(casePlans(PLL_DRILL, t, tt), tt, isDone(t))).toEqual(casePlans(PLL_DRILL, t, tt));
  });

  it('2-look step hints give followable plans', () => {
    const drill = TWO_LOOK_PLL_DRILL;
    for (let i = 0; i < 20; i++) {
      const target = drill.pickTarget(null);
      const h = drill.steps[0].classify!(target)!;
      const plans = hintPlans(h);
      const r = perform(target, startAlgFollow(plans, target), asCubeTurns(`${h.preAuf} ${h.alg} ${h.postAuf}`));
      expect(r.f.progress[0].complete).toBe(true);
      expect(drill.steps[0].isDone(r.state)).toBe(true);
    }
  });
});
