/**
 * Alg loop: repeat one alg back-to-back from whatever state the cube is in (no setup, no
 * recognition) to train execution. Each rep is followed state-based (like the drill's alg follow)
 * and timed from its first to its last move. Pure logic; the UI lives in `components/AlgLoop`.
 */
import { pushAlgFollow, startAlgFollow, type AlgFollow, type AlgPlan } from './drills';
import { applyAlg, FACES, normalizeCenters, SOLVED, tokenize } from './facelets';
import { faceTurnsByToken, toFaceTurns } from './faceTurns';

export interface LoopRep {
  ms: number;
  /** Moves reported during the rep (quarter turns, as the cube sends them). */
  moves: number;
  /** No extra turns: at most the quarter turns the alg needs (a wrong turn + undo adds two). */
  clean: boolean;
  /** Index of the plan (main alg / alternative) that was done. */
  plan: number;
}

export interface LoopState {
  plans: AlgPlan[];
  /** Cube-frame state the current cycle of reps started from (to notice "back to start"). */
  cycleStart: string;
  /** reps.length when the cycle started. */
  cycleFrom: number;
  /** Cube-frame state the current rep starts from. */
  anchor: string;
  /** The current rep's follow, anchored at `anchor`. */
  follow: AlgFollow;
  /** Timestamp of the rep's first move; null until the rep has started. */
  repStart: number | null;
  repMoves: number;
  /** Per plan: no wrong turn against it so far in this rep (used to tell which alt was done). */
  planClean: boolean[];
  /** Per plan: quarter turns a smart cube reports for it. */
  quarters: number[];
  reps: LoopRep[];
  /** The last completed rep brought the cube back to the cycle's start, after this many reps (else null). */
  backAfter: number | null;
}

/** Algs as plain plans (no AUFs: a loop repeats the alg exactly). */
export const loopPlans = (algs: string[]): AlgPlan[] =>
  algs.filter(Boolean).map((alg) => ({ alg, preAuf: '', postAuf: '' }));

export function startLoop(plans: AlgPlan[], state: string): LoopState {
  return {
    plans, cycleStart: state, cycleFrom: 0, anchor: state, follow: startAlgFollow(plans, state), repStart: null, repMoves: 0,
    planClean: plans.map(() => true), quarters: plans.map((p) => quarterTurns(p.alg)), reps: [], backAfter: null,
  };
}

/** Throw away the current rep and start a new one from `state` (keeps completed reps). */
export const restartRep = (s: LoopState, state: string): LoopState => ({
  ...s, anchor: state, follow: startAlgFollow(s.plans, state), repStart: null, repMoves: 0, planClean: s.plans.map(() => true),
});

/** Start a new rep and a new cycle from `state` (turns outside a rep, or a manual restart). */
export const reanchor = (s: LoopState, state: string): LoopState =>
  ({ ...restartRep(s, state), cycleStart: state, cycleFrom: s.reps.length, backAfter: null });

/**
 * Feed a cube-frame move (+ resulting state, timestamp ms). A rep starts on the first move that
 * follows an alg; moves before that (an AUF, a fix) just move the rep's anchor. Undoing a started rep
 * back to its anchor resets it. Extra turns (a wrong turn and its undo) make the rep unclean.
 * Plans ending in the same state can all complete; the rep counts the one that stayed on track.
 */
export function loopMove(s: LoopState, move: string, state: string, ts: number): LoopState {
  if (state === s.anchor) return restartRep(s, state);
  const follow = pushAlgFollow(s.follow, move, state);
  const planClean = s.planClean.map((c, i) => c && !follow.progress[i].fix.length);
  if (s.repStart === null && !planClean.some(Boolean)) return reanchor(s, state);
  const repStart = s.repStart ?? ts;
  const repMoves = s.repMoves + 1;
  const complete = follow.progress.map((p) => p.complete);
  if (!complete.some(Boolean)) return { ...s, follow, repStart, repMoves, planClean };
  let plan = complete.findIndex((c, i) => c && planClean[i]);
  if (plan < 0) plan = complete.indexOf(true);
  const rep: LoopRep = { ms: ts - repStart, moves: repMoves, clean: repMoves <= s.quarters[plan], plan };
  const reps = [...s.reps, rep];
  const back = state === s.cycleStart;
  return {
    ...restartRep(s, state), reps, backAfter: back ? reps.length - s.cycleFrom : null,
    cycleFrom: back ? reps.length : s.cycleFrom,
  };
}

/** Number of reps after which the alg returns the cube to where it started (e.g. T-perm 2, Sune 6). */
export function algOrder(alg: string, max = 1260): number {
  let st = SOLVED;
  for (let k = 1; k <= max; k++) {
    st = normalizeCenters(applyAlg(st, alg));
    if (st === SOLVED) return k;
  }
  return Infinity;
}

/** The alg leaves the cube rotated (needs a regrip back to green front / yellow top between reps). */
export function endsRotated(alg: string): boolean {
  const st = applyAlg(SOLVED, alg);
  return FACES.some((f, i) => st[i * 9 + 4] !== f);
}

/** Quarter turns a smart cube reports for an alg (half turns count 2; wide moves / slices as face turns). */
export const quarterTurns = (alg: string) =>
  faceTurnsByToken(alg).flat().reduce((n, [, a]) => n + (a === 2 ? 2 : 1), 0);

/** Face-turn count of an alg (what a smart cube sees, half turns as one), for TPS. */
export const faceTurnCount = (alg: string) => tokenize(toFaceTurns(alg)).length;

export interface LoopSummary { reps: number; clean: number; best: number | null; mean: number | null }

/** Session numbers over clean reps (unclean ones count as reps but not in the times). */
export function summarize(reps: LoopRep[]): LoopSummary {
  const t = reps.filter((r) => r.clean).map((r) => r.ms);
  return {
    reps: reps.length, clean: t.length,
    best: t.length ? Math.min(...t) : null,
    mean: t.length ? t.reduce((a, b) => a + b, 0) / t.length : null,
  };
}
