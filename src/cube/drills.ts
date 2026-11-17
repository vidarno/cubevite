/**
 * Generic drill definitions for the trainer. A drill picks a target state (cube frame) for a case
 * (or for no case: random-state drills), and defines one or more timed steps; the drill is done
 * when its last step is done. Pure logic: the React runner lives in `components/DrillRunner`.
 */
import { OLL, PLL, type AlgCase } from './algs';
import { caseState, isCrossSolved, isF2LSolved, isLLOriented, orientCrossDown } from './cfop';
import { randomStateWithCrossLength, randomUnsolvedCrossState } from './crossDrill';
import { solveCross } from './crossSolver';
import { F2L } from './f2l';
import { pairsDone, randomF2LCaseState, randomF2LState } from './f2lDrill';
import { undoAlg } from './redo';
import { CROSS_DOWN_ROTATION, faceMapFor, mapMove } from './display';
import { applyAlg, invertAlg, isSolved, normalizeCenters, tokenize, type Face } from './facelets';
import { withoutRotations } from './faceTurns';
import { caseAlgList } from './preferred';
import { Follower, type FollowProgress } from './follow';
import { aufToSolve, llCornersPermuted, llEdgesOriented } from './states';
import {
  classifyStep, matchAlg, OCLL_CASES, OLL_EDGES_CASES, PLL_CORNERS_CASES, PLL_EDGES_CASES, randomStateAtStep,
  randomStateForCase, TWO_LOOK_STEPS, type TwoLookStepId,
} from './twoLook';

/** Cross colour used for training, in the cube's own frame: U = white. */
export const TRAINING_CROSS: Face = 'U';

export type Rng = () => number;

export interface DrillCase {
  id: string; // stats key, e.g. "OLL 21"
  label: string; // short tile label, e.g. "21"
  group?: string;
  alg?: string;
  alts?: string[];
  /** Cross-down state for the case picture. */
  diagram?: CaseDiagram;
}

/** OLL / PLL pictures; EO / CP show only edges / only corners (2-look step 1). */
export type DiagramMode = 'OLL' | 'PLL' | 'EO' | 'CP' | 'F2L';
export interface CaseDiagram { state: string; mode: DiagramMode }

/** What a step's case is for a given state, with the alg to show (cross-down / display frame). */
export interface StepHint {
  caseId: string;
  name: string;
  alg: string;
  /** Alternative algs, each with the AUFs it needs (may differ from the main alg's). */
  alts?: { alg: string; preAuf: string; postAuf: string }[];
  /** U move before the alg ('' for none). */
  preAuf: string;
  /** U move after the alg ('' for none). */
  postAuf: string;
  diagram?: CaseDiagram;
}

/** "(U) R U R' U' (U')": the alg with the AUFs it needs. */
export const hintAlg = (h: { alg: string; preAuf: string; postAuf: string }) =>
  [h.preAuf && `(${h.preAuf})`, h.alg, h.postAuf && `(${h.postAuf})`].filter(Boolean).join(' ');

export interface DrillStep {
  id: string;
  label: string;
  /** Done-predicate on the cube-frame state (`c` = the case being drilled, for mixed drills). */
  isDone(state: string, c?: DrillCase | null): boolean;
  /** Recognise this step's case from the (cube-frame) state at the start of the step. */
  classify?(state: string): StepHint | null;
}

export interface Drill {
  id: string; // also the persisted selection key
  label: string;
  /** Picker grouping, e.g. "2-look" / "Full". */
  group: string;
  description: string;
  /** Selectable cases; empty for random-state drills. */
  cases: DrillCase[];
  /** Cube-frame target state to set up for a case (null for random-state drills). */
  pickTarget(c: DrillCase | null, rng?: Rng): string;
  /**
   * The case list changes over time (e.g. "my learning cases"): the selection is stored as the cases
   * switched off, so cases added later start selected.
   */
  dynamicCases?: boolean;
  /** Cases selected before the user picks any (default: all). */
  defaultCases?: string[];
  /** Drills with their own runner UI: cross (inspection, optimal-solution report), f2l (per-pair report). */
  kind?: 'cross' | 'f2l';
  /** Timed steps in order; the drill is done when the last one is. */
  steps: DrillStep[];
}

const AUF = ['', 'U', 'U2', "U'"];

/** Cross-down state -> cube frame with the training cross. */
export function toCubeFrame(crossDown: string, crossFace: Face = TRAINING_CROSS): string {
  const rot = CROSS_DOWN_ROTATION[crossFace];
  return rot ? normalizeCenters(applyAlg(crossDown, invertAlg(rot))) : crossDown;
}

/** Cube-frame state -> cross-down (training cross on D). */
export const toCrossDown = (state: string, crossFace: Face = TRAINING_CROSS) => orientCrossDown(state, crossFace);

const randomAuf = (rng: Rng) => AUF[Math.floor(rng() * 4)];

function algCase(c: AlgCase): DrillCase {
  return {
    id: c.id, label: c.id.replace(`${c.set} `, ''), group: c.group, alg: c.alg, alts: c.alts,
    diagram: { state: caseState(c), mode: c.set },
  };
}

const CASE_BY_DRILL_CASE = new Map([...OLL, ...PLL].map((c) => [c.id, c]));

/** Target for an OLL/PLL case: the case with a random pre-AUF, in the cube frame. */
function llCaseTarget(c: DrillCase | null, rng: Rng = Math.random): string {
  const ac = c && CASE_BY_DRILL_CASE.get(c.id);
  if (!ac) throw new Error('LL case drill needs a case');
  const auf = randomAuf(rng);
  return toCubeFrame(auf ? applyAlg(caseState(ac), auf) : caseState(ac));
}

export const ollDone = (state: string) => {
  const s = toCrossDown(state);
  return isF2LSolved(s, 'D') && isLLOriented(s, 'D');
};

export const OLL_DRILL: Drill = {
  id: 'OLL',
  label: 'OLL',
  group: 'Full',
  description: 'Full OLL: orient the last layer. The case is set up with a random AUF.',
  cases: OLL.map(algCase),
  pickTarget: llCaseTarget,
  steps: [{ id: 'oll', label: 'OLL', isDone: ollDone }],
};

export const PLL_DRILL: Drill = {
  id: 'PLL',
  label: 'PLL',
  group: 'Full',
  description: 'Full PLL: permute the last layer and solve the cube. The case is set up with a random AUF.',
  cases: PLL.map(algCase),
  pickTarget: llCaseTarget,
  steps: [{ id: 'pll', label: 'PLL', isDone: isSolved }],
};

// ---------------------------------------------------------------------------
// 2-look drills

const STEP_DIAGRAM: Record<TwoLookStepId, DiagramMode> = { ollEdges: 'EO', ocll: 'OLL', pllCorners: 'CP', pllEdges: 'PLL' };
/** Step-1 cases get their own names; DB cases are shown by id ("OLL 26", "PLL Ua"). */
const caseTitle = (c: AlgCase) => (c.id.startsWith('2L ') ? c.name : c.id);

/** A drill step for one 2-look step (checked with F2L intact), optionally with a stricter done-test. */
export function twoLookStep(id: TwoLookStepId, isDone?: (state: string) => boolean): DrillStep {
  const step = TWO_LOOK_STEPS[id];
  return {
    id, label: step.label,
    isDone: isDone ?? ((state) => {
      const s = toCrossDown(state);
      return isF2LSolved(s, 'D') && step.isDone(s);
    }),
    classify: (state) => twoLookHint(id, toCrossDown(state)),
  };
}

/** The 2-look case of a cross-down state for one step, as a hint (null if the state doesn't fit the step or skips it). */
export function twoLookHint(id: TwoLookStepId, s: string): StepHint | null {
  const r = classifyStep(id, s);
  // PLL-edges skip: corners and edges solved, only the final AUF is left.
  if (r === 'skip' && id === 'pllEdges' && !isSolved(s)) {
    return { caseId: 'AUF', name: 'Skip (AUF only)', alg: '', preAuf: '', postAuf: aufToSolve(s) ?? '' };
  }
  if (!r || r === 'skip') return null;
  // Preferred alg first (the main alg always matches: it's what recognised the case).
  const [main, ...alts] = caseAlgList(r.case).flatMap((alg) => {
    const m = alg === r.case.alg ? { preAuf: r.preAuf, postAuf: r.postAuf } : matchAlg(id, s, alg);
    return m ? [{ alg, ...m }] : [];
  });
  return {
    caseId: r.case.id, name: caseTitle(r.case), ...main, alts: alts.length ? alts : undefined,
    diagram: { state: caseState(r.case), mode: STEP_DIAGRAM[id] },
  };
}

const stepCase = (step: TwoLookStepId) => (c: AlgCase): DrillCase => ({
  id: c.id, label: c.id.startsWith('2L ') ? c.name : c.id.replace(`${c.set} `, ''), group: c.group, alg: c.alg, alts: c.alts,
  diagram: { state: caseState(c), mode: STEP_DIAGRAM[step] },
});

function stepDrill(id: string, step: TwoLookStepId, cases: AlgCase[], description: string, isDone?: (s: string) => boolean): Drill {
  return {
    id, label: TWO_LOOK_STEPS[step].label, group: '2-look', description,
    cases: cases.map(stepCase(step)),
    pickTarget(c, rng = Math.random) {
      if (!c) throw new Error(`${id} drill needs a case`);
      return toCubeFrame(randomStateForCase(step, c.id, rng));
    },
    steps: [twoLookStep(step, isDone)],
  };
}

export const OLL_EDGES_DRILL = stepDrill('2L OLL edges', 'ollEdges', OLL_EDGES_CASES,
  'Orient the last-layer edges (make the yellow cross): dot, L-shape or line. Corners are random.');
export const OCLL_DRILL = stepDrill('2L OCLL', 'ocll', OCLL_CASES,
  'Orient the corners once the yellow cross is done (OLL 21-27). Permutation is random.');
export const PLL_CORNERS_DRILL = stepDrill('2L PLL corners', 'pllCorners', PLL_CORNERS_CASES,
  'Permute the corners: headlights -> T-perm (or Aa), no headlights -> Y-perm. Edges are random.');
export const PLL_EDGES_DRILL = stepDrill('2L PLL edges', 'pllEdges', PLL_EDGES_CASES,
  'Permute the edges once the corners are solved (Ua, Ub, H, Z) and finish the cube.', isSolved);

export const TWO_LOOK_OLL_DRILL: Drill = {
  id: '2L OLL', label: '2-look OLL', group: '2-look',
  description: 'Random last layer: orient the edges, then the corners. Each step is timed and named.',
  cases: [],
  pickTarget: (_c, rng = Math.random) => toCubeFrame(randomStateAtStep('ollEdges', (s) => !llEdgesOriented(s), rng)),
  steps: [twoLookStep('ollEdges'), twoLookStep('ocll', ollDone)],
};

export const TWO_LOOK_PLL_DRILL: Drill = {
  id: '2L PLL', label: '2-look PLL', group: '2-look',
  description: 'Random oriented last layer: permute the corners, then the edges. Each step is timed and named.',
  cases: [],
  pickTarget: (_c, rng = Math.random) => toCubeFrame(randomStateAtStep('pllCorners', (s) => !llCornersPermuted(s), rng)),
  steps: [twoLookStep('pllCorners'), twoLookStep('pllEdges', isSolved)],
};

// ---------------------------------------------------------------------------
// Cross drill

export const CROSS_ANY = 'Cross any';
/** Optimal cross length of a cross-drill case ("Cross 5" -> 5), null for "any". */
export const crossLevel = (c: { id: string } | null): number | null => {
  const m = c && /^Cross (\d)$/.exec(c.id);
  return m ? Number(m[1]) : null;
};

export const CROSS_DRILL: Drill = {
  id: 'Cross', label: 'Cross', group: 'Cross', kind: 'cross',
  description: 'Random scramble: inspect and plan the white cross, then solve it. Afterwards you see your move count '
    + 'against the optimal and the optimal solutions. Pick levels (optimal length 1-8) or "Any" for real scrambles.',
  cases: [
    { id: CROSS_ANY, label: 'Any' },
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((d) => ({ id: `Cross ${d}`, label: `${d} move${d > 1 ? 's' : ''}` })),
  ],
  defaultCases: [CROSS_ANY],
  pickTarget(c, rng = Math.random) {
    const level = crossLevel(c);
    return level === null ? randomUnsolvedCrossState(TRAINING_CROSS, rng) : randomStateWithCrossLength(TRAINING_CROSS, level, rng);
  },
  steps: [{ id: 'cross', label: 'Cross', isDone: (s) => isCrossSolved(s, TRAINING_CROSS) }],
};

// ---------------------------------------------------------------------------
// F2L drills

const F2L_BY_DRILL_CASE = new Map(F2L.map((c) => [c.id, c]));

export const F2L_DRILL: Drill = {
  id: 'F2L', label: 'F2L cases', group: 'F2L',
  description: 'One F2L case in the front-right slot, everything else of the first two layers solved. '
    + 'The last layer is random, so it doesn\'t give the case away; the case has a random AUF.',
  cases: F2L.map((c) => ({
    id: c.id, label: c.id.replace('F2L ', ''), group: c.group, alg: c.alg, alts: c.alts,
    diagram: { state: caseState(c), mode: 'F2L' },
  })),
  pickTarget(c, rng = Math.random) {
    const fc = c && F2L_BY_DRILL_CASE.get(c.id);
    if (!fc) throw new Error('F2L case drill needs a case');
    return toCubeFrame(randomF2LCaseState(fc, rng));
  },
  steps: [{ id: 'f2l', label: 'F2L', isDone: (s) => isF2LSolved(toCrossDown(s), 'D') }],
};

export const F2L_FULL_DRILL: Drill = {
  id: 'F2L full', label: 'Full F2L', group: 'F2L', kind: 'f2l',
  description: 'Random state with the white cross solved: solve all four pairs. Each pair is timed, with the pause '
    + 'before it (lookahead) and which case it was.',
  cases: [],
  pickTarget: (_c, rng = Math.random) => toCubeFrame(randomF2LState(rng)),
  steps: [1, 2, 3, 4].map((k) => ({ id: `pair${k}`, label: `Pair ${k}`, isDone: (s: string) => pairsDone(toCrossDown(s), k) })),
};

export const DRILLS: Drill[] = [
  TWO_LOOK_OLL_DRILL, OLL_EDGES_DRILL, OCLL_DRILL, TWO_LOOK_PLL_DRILL, PLL_CORNERS_DRILL, PLL_EDGES_DRILL,
  OLL_DRILL, PLL_DRILL, CROSS_DRILL, F2L_DRILL, F2L_FULL_DRILL,
];
export const DRILL_BY_ID = new Map(DRILLS.map((d) => [d.id, d]));

/**
 * Index of the first step not yet done, starting from `from` (steps can complete together,
 * e.g. an OLL skip). Returns steps.length when the drill is finished.
 */
export function advanceSteps(drill: Drill, state: string, from: number, c?: DrillCase | null): number {
  let i = from;
  while (i < drill.steps.length && drill.steps[i].isDone(state, c)) i++;
  return i;
}

// ---------------------------------------------------------------------------
// Following an alg while solving (progress highlight + undo hints)

/** An alg with the AUFs it needs from a given state (cross-down / display frame). */
export interface AlgPlan { alg: string; preAuf: string; postAuf: string }

/**
 * How each of a case's algs (preferred first, then main, alternatives and own algs) solves `state` (cube frame) for a
 * single-step case drill: the pre-AUF that makes it work, plus a post-AUF if the step needs one.
 */
export function casePlans(drill: Drill, c: DrillCase, state: string): AlgPlan[] {
  const step = drill.steps[drill.steps.length - 1];
  const s = toCrossDown(state);
  const plans: AlgPlan[] = [];
  for (const alg of caseAlgList(c)) {
    found: for (const preAuf of AUF) {
      for (const postAuf of AUF) {
        const end = normalizeCenters(applyAlg(s, `${preAuf} ${alg} ${postAuf}`));
        if (step.isDone(toCubeFrame(end), c)) { plans.push({ alg, preAuf, postAuf }); break found; }
      }
    }
  }
  return plans;
}

/**
 * Each plan plus every other pre-AUF its alg also works from (symmetric cases: H, Z, OLL 21, ...),
 * so following live doesn't flag an equivalent AUF as a wrong turn. Order is kept: each plan's own
 * AUF first, then its variants. `isDone` is the step's done-predicate on a cube-frame state.
 */
export function aufVariants(plans: AlgPlan[], state: string, isDone: (cubeState: string) => boolean, crossFace: Face = TRAINING_CROSS): AlgPlan[] {
  const s = toCrossDown(state, crossFace);
  const out: AlgPlan[] = [];
  const seen = new Set<string>();
  const add = (p: AlgPlan) => {
    const key = `${p.preAuf}|${p.alg}`;
    if (!seen.has(key)) { seen.add(key); out.push(p); }
  };
  for (const p of plans) {
    add(p);
    if (!p.alg) continue;
    for (const preAuf of AUF) {
      if (preAuf === p.preAuf) continue;
      const postAuf = AUF.find((post) => isDone(toCubeFrame(normalizeCenters(applyAlg(s, `${preAuf} ${p.alg} ${post}`)), crossFace)));
      if (postAuf !== undefined) add({ alg: p.alg, preAuf, postAuf });
    }
  }
  return out;
}

/** Optimal cross solutions for a cube-frame state, as plans in the cross-down frame (for following live). */
export function crossPlans(state: string, max = 4, face: Face = TRAINING_CROSS): AlgPlan[] {
  const map = faceMapFor(CROSS_DOWN_ROTATION[face]);
  return solveCross(state, face, max)
    .filter(Boolean)
    .map((sol) => ({ alg: tokenize(sol).map((m) => mapMove(m, map)).join(' '), preAuf: '', postAuf: '' }));
}

/**
 * The quickest way back to a drill's start state after doing `log` from it: the moves undone in
 * reverse (merged, so R R becomes R2). Null if the cube isn't where those moves left it
 * (e.g. turned after the result); then the caller falls back to the solver.
 */
export function undoMoves(current: string, target: string, log: string[]): string | null {
  const back = undoAlg(log);
  return applyAlg(current, back) === target ? back : null;
}

/** The plans a recognised step offers (preferred alg first, then the others). */
export const hintPlans = (h: StepHint): AlgPlan[] =>
  [h, ...(h.alts ?? [])].filter((p) => p.alg || p.preAuf || p.postAuf);

/** Plans with the rotations taken out of their algs (the "no rotations" setting), or as they are. */
export const plansFor = (plans: AlgPlan[], noRotations: boolean): AlgPlan[] =>
  noRotations ? plans.map((p) => ({ ...p, alg: withoutRotations(p.alg) })) : plans;

/** Tokens of a plan, with which ones are AUFs. */
export function planMoves(p: AlgPlan): { move: string; auf: boolean }[] {
  return [
    ...tokenize(p.preAuf).map((move) => ({ move, auf: true })),
    ...tokenize(p.alg).map((move) => ({ move, auf: false })),
    ...tokenize(p.postAuf).map((move) => ({ move, auf: true })),
  ];
}

/** Followers for each plan from a cube-frame state; they take cube-frame moves/states. */
export interface AlgFollow { plans: AlgPlan[]; followers: Follower[]; progress: FollowProgress[] }

export function startAlgFollow(plans: AlgPlan[], state: string, crossFace: Face = TRAINING_CROSS): AlgFollow {
  const map = faceMapFor(CROSS_DOWN_ROTATION[crossFace]);
  const opts = { stateKey: (st: string) => toCrossDown(st, crossFace), mapMove: (m: string) => mapMove(m, map) };
  const start = toCrossDown(state, crossFace);
  const followers = plans.map((p) => new Follower(start, planMoves(p).map((t) => t.move), opts));
  return { plans, followers, progress: followers.map((f) => f.progress()) };
}

/** Feed a cube-frame move + resulting state to every follower (mutates the followers). */
export function pushAlgFollow(f: AlgFollow, move: string, state: string): AlgFollow {
  return { ...f, progress: f.followers.map((fl) => fl.push(move, state)) };
}

/** Which plan to show: on-track ones first, then the furthest along; ties keep the main alg. */
export function bestPlan(f: AlgFollow): number {
  let best = 0;
  const score = (p: FollowProgress) => (p.fix.length ? 0 : 1000) + p.done;
  f.progress.forEach((p, i) => { if (score(p) > score(f.progress[best])) best = i; });
  return best;
}

/** Mean of the last 5 times, or null. */
export function recentAvg(ts: number[]): number | null {
  if (!ts.length) return null;
  const last = ts.slice(-5);
  return last.reduce((a, b) => a + b, 0) / last.length;
}

/** Weighted random pick: unseen and slow cases come up more often; never the same case twice in a row. */
export function pickCase<C extends { id: string }>(
  cases: C[], stats: Record<string, { times: number[] }>, prev?: string, rng: Rng = Math.random,
): C {
  const pool = cases.length > 1 ? cases.filter((c) => c.id !== prev) : cases;
  const avgs = pool.map((c) => recentAvg(stats[c.id]?.times ?? []));
  const known = avgs.filter((a): a is number => a !== null);
  const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const weights = avgs.map((a) => (a === null ? 3 : Math.max(0.3, a / mean) ** 2));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
