/**
 * 2-look OLL / 2-look PLL: the four steps, their cases and per-step classifiers.
 *
 * All functions take cross-down states (F2L solved on D, last layer on U; see `orientCrossDown`).
 * A classifier finds the case whose algorithm, after a pre-AUF, completes the step. Step-1 cases
 * map to disjoint state sets (an alg + AUF sends exactly one pattern to "done"), so the first
 * match is the case. Step-2 cases are the existing OCLL / edges-only PLL entries of the DB.
 */
import { applyAlg, applyMove, normalizeCenters } from './facelets';
import { CASE_BY_ID, type AlgCase } from './algs';
import { aufToSolve, llCornersPermuted, llEdgesOriented, llOriented, randomLLState, type Rng } from './states';

const AUF = ['', 'U', 'U2', "U'"];

/** Apply an alg and relabel so centres read U R F D L B (slice moves shift centres). */
const run = (s: string, alg: string) => normalizeCenters(applyAlg(s, alg));

export type TwoLookStepId = 'ollEdges' | 'ocll' | 'pllCorners' | 'pllEdges';

export interface TwoLookMatch {
  case: AlgCase;
  /** U move to do before the alg ('' for none). */
  preAuf: string;
  /** U move that finishes the cube after the alg (only for the last step; '' otherwise). */
  postAuf: string;
}

/** Result of a classifier: the case, 'skip' if the step is already done, or null if the state doesn't fit the step. */
export type StepResult = TwoLookMatch | 'skip' | null;

export interface TwoLookStep {
  id: TwoLookStepId;
  label: string;
  cases: AlgCase[];
  /** The state this step produces (from the previous step's result). */
  isDone: (s: string) => boolean;
  /** Precondition: what the previous step leaves. */
  accepts: (s: string) => boolean;
}

const db = (id: string) => {
  const c = CASE_BY_ID.get(id);
  if (!c) throw new Error(`twoLook: missing DB case ${id}`);
  return c;
};

const step1 = (set: AlgCase['set'], name: string, group: string, alg: string, alts?: string[]): AlgCase =>
  ({ id: `2L ${set} ${name}`, set, name, group, alg, alts, twoLook: true });

/** Edge-orientation cases at AUF '': line horizontal (left-right); L-shape at front + right for `f R U R' U' f'` (`F U R U' R' F'` is the back-left version). */
export const OLL_EDGES_CASES: AlgCase[] = [
  step1('OLL', 'Line', 'Edges', "F R U R' U' F'"),
  step1('OLL', 'L-shape', 'Edges', "f R U R' U' f'"),
  step1('OLL', 'Dot', 'Edges', "F R U R' U' F' f R U R' U' f'"),
];

/** Corner-permutation cases. Headlights: T-perm with headlights on the left (Aa also works, from a different AUF). */
export const PLL_CORNERS_CASES: AlgCase[] = [
  step1('PLL', 'Headlights', 'Corners', db('PLL T').alg, [db('PLL Aa').alg]),
  step1('PLL', 'Diagonal', 'Corners', db('PLL Y').alg),
];

export const OCLL_CASES: AlgCase[] = [21, 22, 23, 24, 25, 26, 27].map((n) => db(`OLL ${n}`));
export const PLL_EDGES_CASES: AlgCase[] = ['Ua', 'Ub', 'H', 'Z'].map((n) => db(`PLL ${n}`));

const always = () => true;

export const TWO_LOOK_STEPS: Record<TwoLookStepId, TwoLookStep> = {
  ollEdges: { id: 'ollEdges', label: 'OLL edges', cases: OLL_EDGES_CASES, isDone: llEdgesOriented, accepts: always },
  ocll: { id: 'ocll', label: 'OCLL', cases: OCLL_CASES, isDone: llOriented, accepts: llEdgesOriented },
  pllCorners: {
    id: 'pllCorners', label: 'PLL corners', cases: PLL_CORNERS_CASES,
    isDone: (s) => llOriented(s) && llCornersPermuted(s), accepts: llOriented,
  },
  pllEdges: {
    id: 'pllEdges', label: 'PLL edges', cases: PLL_EDGES_CASES,
    isDone: (s) => aufToSolve(s) !== null, accepts: (s) => llOriented(s) && llCornersPermuted(s),
  },
};

export const TWO_LOOK_OLL: TwoLookStepId[] = ['ollEdges', 'ocll'];
export const TWO_LOOK_PLL: TwoLookStepId[] = ['pllCorners', 'pllEdges'];

/** The first pre-AUF for which `alg` takes `s` to a state satisfying `done`, or null. */
export function preAufFor(s: string, alg: string, done: (s: string) => boolean): string | null {
  for (const a of AUF) if (done(run(s, `${a} ${alg}`))) return a;
  return null;
}

/** AUFs with which `alg` completes `stepId` from `s` (postAuf only on the last step), or null. */
export function matchAlg(stepId: TwoLookStepId, s: string, alg: string): { preAuf: string; postAuf: string } | null {
  const preAuf = preAufFor(s, alg, TWO_LOOK_STEPS[stepId].isDone);
  if (preAuf === null) return null;
  const postAuf = stepId === 'pllEdges' ? aufToSolve(run(s, `${preAuf} ${alg}`)) ?? '' : '';
  return { preAuf, postAuf };
}

/** Classify a state for one 2-look step. */
export function classifyStep(stepId: TwoLookStepId, s: string): StepResult {
  const step = TWO_LOOK_STEPS[stepId];
  if (!step.accepts(s)) return null;
  if (step.isDone(s)) return 'skip';
  for (const c of step.cases) {
    const m = matchAlg(stepId, s, c.alg);
    if (m) return { case: c, ...m };
  }
  return null;
}

export const classifyOllEdges = (s: string) => classifyStep('ollEdges', s);
export const classifyOcll = (s: string) => classifyStep('ocll', s);
export const classifyPllCorners = (s: string) => classifyStep('pllCorners', s);
export const classifyPllEdges = (s: string) => classifyStep('pllEdges', s);

/** Apply a step result to a state (no-op for 'skip'). */
export function applyStep(s: string, r: TwoLookMatch | 'skip'): string {
  if (r === 'skip') return s;
  const after = run(s, `${r.preAuf} ${r.case.alg}`);
  return r.postAuf ? applyMove(after, r.postAuf) : after;
}

export interface TwoLookPlanStep {
  step: TwoLookStepId;
  result: TwoLookMatch | 'skip';
  /** State before this step. */
  before: string;
}

/**
 * Classify a sequence of steps, applying each recognised alg to get the next step's state.
 * Returns null if some step can't be classified (precondition not met).
 */
export function planSteps(s: string, steps: TwoLookStepId[]): TwoLookPlanStep[] | null {
  const out: TwoLookPlanStep[] = [];
  for (const step of steps) {
    const result = classifyStep(step, s);
    if (!result) return null;
    out.push({ step, result, before: s });
    s = applyStep(s, result);
  }
  return out;
}

/** State after doing `steps` the 2-look way, or null if a step can't be classified. */
export function stateAfterSteps(s: string, steps: TwoLookStepId[]): string | null {
  for (const step of steps) {
    const r = classifyStep(step, s);
    if (!r) return null;
    s = applyStep(s, r);
  }
  return s;
}

const STEPS_BEFORE: Record<TwoLookStepId, TwoLookStepId[]> = {
  ollEdges: [],
  ocll: ['ollEdges'],
  pllCorners: TWO_LOOK_OLL,
  pllEdges: [...TWO_LOOK_OLL, 'pllCorners'],
};

/**
 * A random cross-down state at the start of `step` (earlier 2-look steps done, everything else
 * random, random AUF), satisfying `accept`. Rejection sampling over `randomLLState`.
 */
export function randomStateAtStep(step: TwoLookStepId, accept: (s: string) => boolean = () => true, rng: Rng = Math.random): string {
  for (let i = 0; i < 5000; i++) {
    const s = stateAfterSteps(randomLLState('D', rng), STEPS_BEFORE[step]);
    if (!s) continue;
    const auf = AUF[Math.floor(rng() * 4)];
    const out = auf ? applyMove(s, auf) : s;
    if (accept(out)) return out;
  }
  throw new Error(`randomStateAtStep(${step}): no state accepted`);
}

/** A random state at the start of `step` whose case for that step is `caseId`. */
export function randomStateForCase(step: TwoLookStepId, caseId: string, rng: Rng = Math.random): string {
  return randomStateAtStep(step, (s) => {
    const r = classifyStep(step, s);
    return r !== null && r !== 'skip' && r.case.id === caseId;
  }, rng);
}
