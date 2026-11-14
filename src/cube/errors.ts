/**
 * Errors and wasted moves in smart-cube solves (task 2.5).
 *
 * - loop: the cube returns to a state it was in before; every move in between is wasted.
 *   Loops are taken maximal (a loop inside a bigger loop is part of it). A loop made of turns of
 *   one face only is a *cancellation* (R R', U2 U2), or an *extra AUF* on the last-layer face during
 *   the last layer. A loop inside a last-layer step is a *restarted alg* (started, undone, redone).
 * - overturn: consecutive turns of one face that end up shorter (R R R = R'): extra quarter turns
 *   are wasted; on the last-layer face during the last layer it counts as an extra AUF.
 * - broken progress: during F2L, the cross (allowing a D-layer offset) or a solved pair is broken
 *   and only rebuilt more than `BROKEN_MIN_MOVES` moves later (shorter breaks are normal
 *   technique: sledgehammer, D-move inserts). Reported with the moves until it was rebuilt, an
 *   upper bound of the waste (other pairs may have progressed meanwhile). Checked on the loop-free
 *   path, so a pair undone and redone is only reported as a loop.
 */
import { applyMove, type Face } from './facelets';
import { isCrossSolved, opposite, solvedSlots, type CfopSplits, type TimedMove } from './cfop';
import { stageOfMove } from './pauses';

export type ErrorKind = 'cancellation' | 'extra AUF' | 'loop' | 'restarted alg' | 'broken cross' | 'broken pair';

export interface SolveError {
  kind: ErrorKind;
  /** Moves involved: moves[start .. end-1]. */
  start: number;
  end: number;
  /** Wasted moves (quarter turns as reported); for broken progress: moves until rebuilt. */
  moves: number;
  /** Time lost (ms), same convention. */
  ms: number;
  stage: string;
  /** "R R'", "green-red pair", ... */
  detail?: string;
}

/** Breaks of solved F2L progress shorter than this (in moves) are technique, not errors. */
export const BROKEN_MIN_MOVES = 4;

/** Colour of each cube-frame face (GAN: white U, green F). */
export const COLOR: Record<Face, string> = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' };

const quarterTurns = (m: string) => (m.endsWith('2') ? 2 : 1);
const amount = (m: string) => (m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1);

/** Find the errors of a solve. `splits` = `analyzeSolve(start, moves)`. */
export function findErrors(start: string, moves: TimedMove[], splits: CfopSplits): SolveError[] {
  const states = [start];
  for (const m of moves) states.push(applyMove(states[states.length - 1], m.move));
  /** Time at which state k was reached. */
  const tAt = (k: number) => (k > 0 ? moves[k - 1].t : 0);
  const stage = (i: number) => stageOfMove(i, moves, splits);
  const f2lEnd = splits.moveCounts.f2l ?? Infinity;
  const llFace = splits.crossFace ? opposite(splits.crossFace) : null;
  const isAufAt = (i: number) => i >= f2lEnd && moves[i].move[0] === llFace;
  const out: SolveError[] = [];

  // --- loops (maximal): a path stack of state indices; returning to a state on it closes a loop.
  const loops: [number, number][] = [];
  const path: number[] = [];
  const pos = new Map<string, number>();
  states.forEach((s, k) => {
    const p = pos.get(s);
    if (p === undefined) { pos.set(s, path.length); path.push(k); return; }
    const i = path[p];
    for (const q of path.splice(p + 1)) pos.delete(states[q]);
    while (loops.length && loops[loops.length - 1][0] >= i) loops.pop();
    loops.push([i, k]);
  });
  const inLoop = new Array(moves.length).fill(false);
  for (const [i, k] of loops) {
    for (let j = i; j < k; j++) inLoop[j] = true;
    const ms = moves.slice(i, k).map((m) => m.move);
    const oneFace = ms.every((m) => m[0] === ms[0][0]);
    const step = splits.llSteps?.find((s) => i >= s.startMove && k <= s.endMove);
    const kind: ErrorKind = oneFace ? (isAufAt(i) ? 'extra AUF' : 'cancellation') : step ? 'restarted alg' : 'loop';
    out.push({ kind, start: i, end: k, moves: k - i, ms: tAt(k) - tAt(i), stage: stage(i), detail: ms.length <= 4 ? ms.join(' ') : undefined });
  }

  // --- overturns: runs of one face (outside loops) using more quarter turns than their net turn.
  for (let i = 0; i < moves.length;) {
    let k = i + 1;
    if (!inLoop[i]) while (k < moves.length && !inLoop[k] && moves[k].move[0] === moves[i].move[0]) k++;
    const run = moves.slice(i, k).map((m) => m.move);
    const net = run.reduce((n, m) => n + amount(m), 0) % 4;
    const waste = run.reduce((n, m) => n + quarterTurns(m), 0) - (net === 2 ? 2 : net ? 1 : 0);
    if (!inLoop[i] && waste > 0) {
      const ms = Math.round(((tAt(k) - tAt(i)) * waste) / (k - i));
      out.push({ kind: isAufAt(i) ? 'extra AUF' : 'cancellation', start: i, end: k, moves: waste, ms, stage: stage(i), detail: run.join(' ') });
    }
    i = k;
  }

  // --- broken progress during F2L.
  const face = splits.crossFace;
  const crossEnd = splits.moveCounts.cross;
  if (face && crossEnd !== null && splits.moveCounts.f2l !== null) {
    const crossOk = (s: string) => {
      for (let n = 0; n < 4; n++, s = applyMove(s, face)) if (isCrossSolved(s, face)) return true;
      return false;
    };
    const brokenAt = new Map<string, number>(); // piece ('cross' / slot name) -> state index where it broke
    const solved = new Set<string>();
    // Walk the loop-free path: states inside a loop are skipped (the loop is reported already).
    const insideLoop = (k: number) => loops.some(([i, e]) => i < k && k < e);
    for (let k = crossEnd; k <= splits.moveCounts.f2l; k++) {
      if (insideLoop(k)) continue;
      const s = states[k];
      const now = new Set([...(crossOk(s) ? ['cross'] : []), ...solvedSlots(s, face)]);
      for (const p of now) {
        const b = brokenAt.get(p);
        if (b !== undefined) {
          brokenAt.delete(p);
          if (k - b > BROKEN_MIN_MOVES) {
            const detail = p === 'cross' ? `${COLOR[face]} cross` : `${[...p].map((f) => COLOR[f as Face]).join('-')} pair`;
            out.push({ kind: p === 'cross' ? 'broken cross' : 'broken pair', start: b - 1, end: k, moves: k - b + 1, ms: tAt(k) - tAt(b - 1), stage: stage(b - 1), detail });
          }
        }
        solved.add(p);
      }
      for (const p of solved) if (!now.has(p) && !brokenAt.has(p)) brokenAt.set(p, k);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Coarse stage of a stage label: Cross / F2L / OLL / PLL. */
export function coarseStage(stage: string): 'Cross' | 'F2L' | 'OLL' | 'PLL' {
  if (stage === 'Cross') return 'Cross';
  if (stage.startsWith('Pair')) return 'F2L';
  if (stage.startsWith('OLL') || stage === 'OCLL') return 'OLL';
  return 'PLL';
}

/** Error count, wasted moves and time per coarse stage (only stages with errors). */
export function wasteByStage(errors: SolveError[]): { stage: string; count: number; moves: number; ms: number }[] {
  const order = ['Cross', 'F2L', 'OLL', 'PLL'];
  const by = new Map<string, { stage: string; count: number; moves: number; ms: number }>();
  for (const e of errors) {
    const st = coarseStage(e.stage);
    const r = by.get(st) ?? { stage: st, count: 0, moves: 0, ms: 0 };
    r.count++; r.moves += e.moves; r.ms += e.ms;
    by.set(st, r);
  }
  return [...by.values()].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
}

/** "loop: 6 moves", "cancellation: R R'", "broken pair: green-red pair (rebuilt after 9 moves)". */
export function errorLabel(e: SolveError): string {
  switch (e.kind) {
    case 'broken cross':
    case 'broken pair':
      return `broke the ${e.detail}, rebuilt after ${e.moves} moves`;
    case 'loop':
      return `back to an earlier state: ${e.moves} moves wasted`;
    case 'restarted alg':
      return `restarted the alg: ${e.moves} moves wasted`;
    default:
      return `${e.kind}${e.detail ? ` (${e.detail})` : ''}: ${e.moves} move${e.moves === 1 ? '' : 's'} wasted`;
  }
}
