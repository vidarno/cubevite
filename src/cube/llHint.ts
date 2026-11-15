/**
 * Last-layer hints during a timed solve (Timer page): once F2L is done on any cross face, work out
 * the current OLL/PLL step and case, and reveal it in tiers (name -> picture -> alg) when the solver
 * pauses or asks. Pure: the Timer feeds moves and clock ticks, and renders `view()`.
 */
import { applyAlg, FACES, isSolved, normalizeCenters, type Face } from './facelets';
import { isF2LSolved, orientCrossDown, recognizeOLL, recognizePLL, caseState } from './cfop';
import { aufToSolve, llCornersPermuted, llEdgesOriented, llOriented, solvedUpToAuf } from './states';
import { caseName } from './algId';
import { TWO_LOOK_STEPS, type TwoLookStepId } from './twoLook';
import {
  aufVariants, hintPlans, plansFor, pushAlgFollow, startAlgFollow, twoLookHint,
  type AlgFollow, type StepHint,
} from './drills';

export type HintStyle = 'off' | '2look' | 'full';

/** 0 = hidden, 1 = step + case name, 2 = + picture, 3 = + alg (followed live). */
export type HintTier = 0 | 1 | 2 | 3;

/** Idle ms (no turns) after which each tier shows on its own: tier k at TIER_DELAYS[k-1]. */
export const TIER_DELAYS = [2000, 4000, 7000] as const;

export interface LLHint extends StepHint {
  stage: 'OLL' | 'PLL';
  /** "OLL edges", "OCLL", "PLL corners", "PLL edges", "OLL", "PLL". */
  stepLabel: string;
  crossFace: Face;
  /** Done-test of the step on a cross-down state (F2L intact included). */
  isDone(crossDown: string): boolean;
}

/** A hint used in a solve (stored on the solve). */
export interface SolveHint {
  caseId: string;
  stepLabel: string;
  /** Highest tier shown. */
  tier: 1 | 2 | 3;
  /** Number of solve moves done when the hint first showed (locates the LL step it belongs to). */
  at: number;
}

const AUF = ['', 'U', 'U2', "U'"];
const run = (s: string, alg: string) => normalizeCenters(applyAlg(s, alg));

/** The face whose F2L (cross + 4 pairs) is solved, if any (not for a solved cube). */
export function f2lFace(state: string): Face | null {
  if (isSolved(state)) return null;
  return FACES.find((f) => isF2LSolved(state, f)) ?? null;
}

/** AUFs with which `alg` finishes a step from cross-down `s`, or null. */
function aufsFor(s: string, alg: string, done: (s: string) => boolean, post: boolean): { preAuf: string; postAuf: string } | null {
  for (const pre of AUF) {
    for (const p of post ? AUF : ['']) {
      if (done(run(s, `${pre} ${alg} ${p}`))) return { preAuf: pre, postAuf: p };
    }
  }
  return null;
}

const STEP_STAGE: Record<TwoLookStepId, 'OLL' | 'PLL'> = { ollEdges: 'OLL', ocll: 'OLL', pllCorners: 'PLL', pllEdges: 'PLL' };

/**
 * The hint for a cube-frame state: null unless F2L is solved and the last layer needs an OLL/PLL
 * alg (an AUF alone gets no hint). '2look' names the 2-look step's case, 'full' the 1-look case.
 */
export function llHintFor(state: string, style: HintStyle): LLHint | null {
  if (style === 'off') return null;
  const face = f2lFace(state);
  if (!face) return null;
  const s = orientCrossDown(state, face);
  if (solvedUpToAuf(s)) return null;
  const f2l = (x: string) => isF2LSolved(x, 'D');

  if (style === '2look') {
    const id: TwoLookStepId = !llEdgesOriented(s) ? 'ollEdges' : !llOriented(s) ? 'ocll' : !llCornersPermuted(s) ? 'pllCorners' : 'pllEdges';
    const h = twoLookHint(id, s);
    if (!h || h.caseId === 'AUF') return null;
    const step = TWO_LOOK_STEPS[id];
    return { ...h, stage: STEP_STAGE[id], stepLabel: step.label, crossFace: face, isDone: (x) => f2l(x) && step.isDone(x) };
  }

  if (!llOriented(s)) {
    const r = recognizeOLL(s);
    if (!r) return null;
    const done = (x: string) => f2l(x) && llOriented(x);
    return {
      caseId: r.case.id, name: caseName(r.case.id), alg: r.case.alg, preAuf: r.preAuf, postAuf: '',
      alts: altPlans(s, r.case.alts, done, false),
      diagram: { state: caseState(r.case), mode: 'OLL' },
      stage: 'OLL', stepLabel: 'OLL', crossFace: face, isDone: done,
    };
  }
  const r = recognizePLL(s);
  if (!r) return null;
  return {
    caseId: r.case.id, name: r.case.name, alg: r.case.alg, preAuf: r.preAuf, postAuf: r.postAuf,
    alts: altPlans(s, r.case.alts, isSolved, true),
    diagram: { state: caseState(r.case), mode: 'PLL' },
    stage: 'PLL', stepLabel: 'PLL', crossFace: face, isDone: isSolved,
  };
}

function altPlans(s: string, alts: string[] | undefined, done: (s: string) => boolean, post: boolean) {
  return alts?.flatMap((alg) => { const m = aufsFor(s, alg, done, post); return m ? [{ alg, ...m }] : []; });
}

/** Final AUF left after the last LL step (for display when no alg is needed). */
export const finalAuf = (state: string) => {
  const face = f2lFace(state);
  return face ? aufToSolve(orientCrossDown(state, face)) : null;
};

export interface HintView {
  hint: LLHint;
  tier: HintTier;
  /** The hint's algs followed live from the step's start (for tier 3). */
  follow: AlgFollow | null;
}

/**
 * Tracks the current LL step through a solve and decides what to reveal. Feed every move with
 * `push`, call `tick` on clock frames (auto tiers on idle time) and `reveal` when the solver asks.
 * While an alg is being done (F2L broken) the hint stays; it is replaced when F2L is intact again
 * and the step or case has changed, and cleared when the step is done.
 */
export class LLHintTracker {
  private cur: { hint: LLHint; tier: HintTier; follow: AlgFollow | null; record?: SolveHint } | null = null;
  private lastMoveAt: number;
  private moves = 0;
  private usedHints: SolveHint[] = [];

  private style: HintStyle;
  private noRotations: boolean;

  constructor(style: HintStyle, noRotations = false, startedAt = 0, startState?: string) {
    this.style = style;
    this.noRotations = noRotations;
    this.lastMoveAt = startedAt;
    if (startState) this.recognise(startState);
  }

  /** A solve move (cube frame) and the state after it; `t` = when (same clock as `tick`). */
  push(move: string, state: string, t: number): void {
    this.moves++;
    this.lastMoveAt = t;
    const c = this.cur;
    if (c) {
      if (c.follow) c.follow = pushAlgFollow(c.follow, move, state);
      if (c.hint.isDone(orientCrossDown(state, c.hint.crossFace))) this.cur = null;
    }
    if (f2lFace(state)) this.recognise(state);
  }

  /** Re-check the case at an F2L-intact state: keep the current hint (and tier) if it's the same case. */
  private recognise(state: string): void {
    const h = llHintFor(state, this.style);
    if (!h) { this.cur = null; return; }
    const c = this.cur;
    if (c && c.hint.caseId === h.caseId && c.hint.stepLabel === h.stepLabel && c.hint.crossFace === h.crossFace) {
      // Same case (e.g. after a U turn): restart the follow unless it's on track mid-alg.
      const p = c.follow?.progress;
      const onTrack = p?.some((x) => x.done > 0 && !x.fix.length);
      if (!onTrack) c.follow = this.followFor(h, state);
      c.hint = h;
      return;
    }
    this.cur = { hint: h, tier: 0, follow: this.followFor(h, state) };
  }

  private followFor(h: LLHint, state: string): AlgFollow | null {
    const done = (cube: string) => h.isDone(orientCrossDown(cube, h.crossFace));
    const plans = aufVariants(plansFor(hintPlans(h), this.noRotations), state, done, h.crossFace);
    return plans.length ? startAlgFollow(plans, state, h.crossFace) : null;
  }

  private setTier(tier: HintTier): void {
    const c = this.cur;
    if (!c || tier <= c.tier) return;
    c.tier = tier;
    // One record per shown step; a later tier of the same step updates it.
    if (c.record) c.record.tier = tier as 1 | 2 | 3;
    else this.usedHints.push(c.record = { caseId: c.hint.caseId, stepLabel: c.hint.stepLabel, tier: tier as 1 | 2 | 3, at: this.moves });
  }

  /** Auto tiers: idle time since the last move. Returns the current tier. */
  tick(now: number): HintTier {
    const c = this.cur;
    if (!c) return 0;
    const idle = now - this.lastMoveAt;
    const auto = TIER_DELAYS.filter((d) => idle >= d).length as HintTier;
    this.setTier(auto);
    return this.cur!.tier;
  }

  /** Show the next tier now (key / tap). */
  reveal(): void {
    const c = this.cur;
    if (c && c.tier < 3) this.setTier((c.tier + 1) as HintTier);
  }

  view(): HintView | null {
    const c = this.cur;
    return c && { hint: c.hint, tier: c.tier, follow: c.follow };
  }

  /** Hints shown so far in this solve. */
  used(): SolveHint[] {
    return this.usedHints.map((h) => ({ ...h }));
  }
}
