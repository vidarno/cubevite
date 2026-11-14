/**
 * Getting back to an earlier start state (redoing a scramble or a drill case) in as few moves as
 * possible: pick the shortest of the candidate sequences that actually lead there.
 */
import { applyAlg, invertAlg, tokenize } from './facelets';
import { canonicalFaceTurns } from './faceTurns';

/** Shortest candidate that takes `current` to `target` (null if none does). '' when already there. */
export function shortestWayBack(current: string, target: string, candidates: (string | null | undefined)[]): string | null {
  if (current === target) return '';
  let best: string | null = null;
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    if (best !== null && tokenize(c).length >= tokenize(best).length) continue;
    if (applyAlg(current, c) === target) best = c;
  }
  return best;
}

/** Moves undone in reverse (merged: R R -> R2, R R' -> nothing). */
export const undoAlg = (moves: string[]) => invertAlg(canonicalFaceTurns(moves.join(' ')));
