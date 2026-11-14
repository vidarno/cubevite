/** Bridges to cubing.js: random-state scrambles, solving, and move sequences between states. */
import { cube3x3x3 } from 'cubing/puzzles';
import { KPattern, type KPuzzle } from 'cubing/kpuzzle';
import { experimentalSolve3x3x3IgnoringCenters } from 'cubing/search';
import { randomScrambleForEvent } from 'cubing/scramble';
import { faceletsToPatternData } from './kpattern';

let kpuzzleP: Promise<KPuzzle> | null = null;
export const kpuzzle = () => (kpuzzleP ??= cube3x3x3.kpuzzle());

export async function toKPattern(state: string): Promise<KPattern> {
  return new KPattern(await kpuzzle(), faceletsToPatternData(state) as never);
}

/** A WCA-style random-state 3x3 scramble. */
export async function randomScramble(): Promise<string> {
  return (await randomScrambleForEvent('333')).toString();
}

/** A move sequence that takes the cube from `from` to `to` (both facelet strings). */
export async function movesBetween(from: string, to: string): Promise<string> {
  const c = (await toKPattern(from)).experimentalToTransformation()!;
  const t = (await toKPattern(to)).experimentalToTransformation()!;
  const solution = await experimentalSolve3x3x3IgnoringCenters(t.invert().applyTransformation(c).toKPattern());
  return solution.toString();
}

/** Setup alg (from solved) for an arbitrary state, used to sync the 3D view. */
export async function setupAlgFor(state: string): Promise<string> {
  const sol = await experimentalSolve3x3x3IgnoringCenters(await toKPattern(state));
  return sol.invert().toString();
}
