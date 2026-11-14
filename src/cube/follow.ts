/**
 * Follow-along tracker for scrambles / setup sequences performed on a smart cube.
 * Matching is state-based, so R2 done as R' R', or "R L" done as "L R", is accepted.
 * Wrong turns are collected (and simplified) so the UI can show how to undo them.
 */
import { applyMove, parseMove, tokenize } from './facelets';
import { faceTurnsByToken, framesByToken, isRotation, moveInFrame, type Frame } from './faceTurns';

const AXIS: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };

function fmt(face: string, amount: number): string | null {
  const a = ((amount % 4) + 4) % 4;
  return a === 0 ? null : face + (a === 2 ? '2' : a === 3 ? "'" : '');
}

/** Merge consecutive same-face moves, also across a commuting opposite-face move. */
export function simplify(moves: string[]): string[] {
  const out: { face: string; amount: number }[] = [];
  for (const m of moves) {
    const { family, amount } = parseMove(m);
    let merged = false;
    for (let j = out.length - 1; j >= 0 && j >= out.length - 2; j--) {
      if (out[j].face === family) {
        out[j].amount = (out[j].amount + amount) % 4;
        if (out[j].amount === 0) out.splice(j, 1);
        merged = true;
        break;
      }
      if (AXIS[out[j].face] !== AXIS[family] || AXIS[family] === undefined) break;
    }
    if (!merged) out.push({ face: family, amount });
  }
  return out.map((o) => fmt(o.face, o.amount)).filter((x): x is string => !!x);
}

export const invertSimple = (moves: string[]) =>
  [...moves].reverse().map((m) => {
    const { family, amount } = parseMove(m);
    return fmt(family, 4 - amount)!;
  });

export interface FollowProgress {
  moves: string[];
  /** number of moves fully completed */
  done: number;
  /** true if the next (double) move is half done */
  half: boolean;
  /**
   * Moves needed to get back on track (empty when on track), named as the cube is held at this
   * point of the alg (after its rotations, which the smart cube can't see).
   */
  fix: string[];
  /** The same undo if the alg's rotations so far were skipped (only when it differs from `fix`). */
  fixUnrotated?: string[];
  complete: boolean;
}

export interface FollowOptions {
  /**
   * Maps a reported state into the alg's frame (e.g. cube frame -> cross-down). The alg's prefix
   * states are compared after `normalizeCenters`, so wide moves, slices and rotations in the alg
   * match the face turns a fixed-centre smart cube reports.
   */
  stateKey?: (state: string) => string;
  /** Maps a reported move into the alg's frame (used for the undo hint). */
  mapMove?: (move: string) => string;
}

/**
 * Per-face quarter-turn amounts strictly between "nothing done" and "token done" for a token's
 * face turns: each face at 0, its target, or (for a half turn) one quarter either way.
 */
function partials(turns: [string, number][]): number[][] {
  const options = turns.map(([, n]) => (n === 2 ? [0, 1, 3, 2] : [0, n]));
  let combos: number[][] = [[]];
  for (const opt of options) combos = combos.flatMap((c) => opt.map((a) => [...c, a]));
  const target = turns.map(([, n]) => n).join();
  return combos.filter((c) => c.some((a) => a) && c.join() !== target);
}

export class Follower {
  readonly moves: string[];
  private prefix: string[] = [];
  private halves = new Map<string, number>(); // state -> index of the half-done move
  private done = 0;
  private half = false;
  private deviation: string[] = [];
  private stateKey: (state: string) => string;
  private mapMove: (move: string) => string;
  private frames: Frame[];

  /**
   * `start` is in the alg's frame (already mapped by `stateKey` if one is given). The alg's states
   * are built from its face-turn form (what a fixed-centre smart cube reports): a wide move is
   * the opposite face turn, a slice two face turns, and rotations re-label later moves.
   */
  constructor(start: string, alg: string | string[], opts: FollowOptions = {}) {
    this.moves = typeof alg === 'string' ? tokenize(alg) : alg;
    this.stateKey = opts.stateKey ?? ((s) => s);
    this.mapMove = opts.mapMove ?? ((m) => m);
    this.frames = framesByToken(this.moves.join(' '));
    let s = start;
    this.prefix.push(s);
    faceTurnsByToken(this.moves.join(' ')).forEach((turns, i) => {
      // Part-way states of this token count as "half done": either direction of a half turn,
      // and one face of a slice (same axis, so the two faces commute) done before the other.
      for (const amounts of partials(turns)) {
        let p = s;
        turns.forEach(([face], k) => { if (amounts[k]) p = applyMove(p, { family: face, amount: amounts[k] as 1 | 2 | 3 }); });
        if (!this.halves.has(p)) this.halves.set(p, i);
      }
      for (const [face, n] of turns) s = applyMove(s, { family: face, amount: n as 1 | 2 | 3 });
      this.prefix.push(s);
    });
  }

  get target() {
    return this.prefix[this.prefix.length - 1];
  }

  /** Feed a move and the resulting cube state. */
  push(move: string, reported: string): FollowProgress {
    const state = this.stateKey(reported);
    move = this.mapMove(move);
    // Look for the furthest prefix (at or after the current one) matching the new state.
    let found = -1;
    for (let k = this.prefix.length - 1; k >= this.done; k--) {
      if (this.prefix[k] === state) { found = k; break; }
    }
    const h = this.halves.get(state);
    if (found >= 0 && (h === undefined || found > h)) {
      this.done = found; this.half = false; this.deviation = [];
    } else if (h !== undefined && h >= this.done) {
      this.done = h; this.half = true; this.deviation = [];
    } else {
      this.deviation = simplify([...this.deviation, move]);
    }
    return this.progress();
  }

  progress(): FollowProgress {
    const fix = invertSimple(this.deviation);
    // A rotation still to come is assumed done (it's invisible; following it is the plan).
    let k = this.done;
    while (k < this.moves.length && isRotation(this.moves[k])) k++;
    const held = fix.map((m) => moveInFrame(m, this.frames[k]));
    return {
      moves: this.moves, done: this.done, half: this.half,
      fix: held, complete: this.done === this.moves.length && !this.deviation.length,
      ...(held.join() !== fix.join() ? { fixUnrotated: fix } : {}),
    };
  }
}
