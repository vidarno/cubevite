/**
 * F2L drill logic (cross-down states): random case setups with a random last layer, random
 * cross-solved states for full-F2L practice, and the per-pair report of a full-F2L attempt.
 */
import { applyAlg, invertAlg } from './facelets';
import { isCrossSolved, solvedSlots } from './cfop';
import { type F2LCase } from './f2l';
import { F2L_SLOTS, pairStatus, recognizeF2L, slotName, type F2LSlot } from './f2lRecognize';
import { randomLLState, randomStateWithCrossSolved, type Rng } from './states';

const AUF = ['', 'U', 'U2', "U'"];

/**
 * A case at front-right with a random pre-AUF and a uniformly random last layer (so the LL
 * doesn't give the case away). The case alg only moves U-layer and FR positions, so applying its
 * inverse to a random LL state gives the case placement with the LL still random.
 */
export function randomF2LCaseState(c: Pick<F2LCase, 'alg'>, rng: Rng = Math.random): string {
  const auf = AUF[Math.floor(rng() * 4)];
  return applyAlg(randomLLState('D', rng), `${invertAlg(c.alg)} ${auf}`);
}

/** A random cross-solved state with none of the four pairs solved. */
export function randomF2LState(rng: Rng = Math.random): string {
  for (;;) {
    const s = randomStateWithCrossSolved('D', rng);
    if (solvedSlots(s, 'D').length === 0) return s;
  }
}

/** Full-F2L step k (1-based) is done when the cross and at least k pairs are solved. */
export const pairsDone = (stateCrossDown: string, k: number) =>
  isCrossSolved(stateCrossDown, 'D') && solvedSlots(stateCrossDown, 'D').length >= k;

export interface PairReport {
  /** Slots solved in this step (two when a pair came for free / was multislotted; empty for a skip). */
  slots: F2LSlot[];
  /** Case of the (first) solved slot when the step started; null if a piece was stuck in another slot. */
  caseId: string | null;
  /** Step time (ms), including the pause before it. */
  time: number;
  /** Time from the end of the previous pair (or the first turn) to the first move of this pair. */
  pauseBefore: number;
  moves: number;
}

/**
 * Per-pair breakdown of a full-F2L attempt.
 * @param stepStates cross-down state at the start of each step (states[0] = the start state)
 * @param endState cross-down state at the end
 * @param splits elapsed ms at which each step finished
 * @param moveTimes elapsed ms of every move (first move = 0)
 */
export function f2lPairReport(stepStates: string[], endState: string, splits: number[], moveTimes: number[]): PairReport[] {
  return splits.map((end, i) => {
    const startT = i ? splits[i - 1] : 0;
    const from = stepStates[i];
    const to = stepStates[i + 1] ?? endState;
    const before = solvedSlots(from, 'D');
    const slots = solvedSlots(to, 'D').filter((s) => !before.includes(s)).map(slotName);
    const first = slots[0];
    const caseId = first && pairStatus(from, first) === 'case' ? recognizeF2L(from, first)!.case.id : null;
    // Moves of this step: after the previous split (the move finishing it belongs to it) up to this one.
    const idx = moveTimes.flatMap((t, k) => ((i === 0 ? t <= end : t > startT && t <= end) ? [k] : []));
    const firstMove = idx.length ? moveTimes[idx[0]] : end;
    return { slots, caseId, time: end - startT, pauseBefore: Math.max(0, firstMove - startT), moves: idx.length };
  });
}

export { F2L_SLOTS };
