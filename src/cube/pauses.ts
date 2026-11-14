/**
 * Pause detection for smart-cube solves (task 2.4).
 *
 * A pause is a gap between two consecutive moves longer than max(0.5 s, 3 × the solve's median
 * gap). Each pause is placed in the CFOP stage it falls in and classified:
 * - recognition: at the start of a last-layer step (before the alg, AUF moves included) or before a
 *   final AUF - the solver is looking at the case;
 * - lookahead: during the cross, between F2L pairs (finding the next pair) or inside a pair;
 * - mid-alg: inside the moves of a last-layer alg - the alg isn't fluent yet, drill it.
 * Pure: works on the recorded moves and the stored analysis (`CfopSplits`).
 */
import type { CfopSplits, LLStep, LLStepKind, TimedMove } from './cfop';
import type { Face } from './facelets';
import { caseName, stepLabel } from './algId';
import { opposite } from './cfop';

export type PauseKind = 'recognition' | 'lookahead' | 'mid-alg';

export interface Pause {
  /** The pause is before `moves[at]` (after `at` moves). */
  at: number;
  /** ms since solve start when the pause began (time of the previous move). */
  start: number;
  duration: number;
  kind: PauseKind;
  /** Stage label: "Cross", "Pair 2", "OLL", "OCLL", "PLL edges", "AUF", ... */
  stage: string;
  /** Lookahead in F2L: before a pair (finding it) or inside one. */
  where?: 'between pairs' | 'inside pair';
  /** Last-layer steps: the case and (mid-alg) the alg label, with the trainer drill to practise it. */
  caseId?: string | null;
  alg?: string;
  drillId?: string;
}

export const MIN_PAUSE_MS = 500;
export const PAUSE_MEDIAN_FACTOR = 3;

/** Gaps between consecutive moves: gaps[i] = moves[i+1].t - moves[i].t. */
const gapsOf = (moves: TimedMove[]) => moves.slice(1).map((m, i) => m.t - moves[i].t);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Pause threshold for a solve: max(0.5 s, 3 × median gap). */
export function pauseThreshold(moves: TimedMove[]): number {
  return Math.max(MIN_PAUSE_MS, PAUSE_MEDIAN_FACTOR * median(gapsOf(moves)));
}

/** Trainer drill for practising a case recognised at a last-layer step of this kind. */
export const DRILL_FOR_STEP: Record<LLStepKind, string> = {
  OLL: 'OLL',
  'OLL edges': '2L OLL edges',
  OCLL: '2L OCLL',
  PLL: 'PLL',
  'PLL corners': '2L PLL corners',
  'PLL edges': '2L PLL edges',
};

/**
 * Find and classify the pauses of a solve. `splits` must come from `analyzeSolve` on the same moves
 * (without `llSteps`, i.e. an old solve, last-layer pauses only get the OLL / PLL / AUF stage and no
 * case; re-run `analyzeSolve` for the full classification).
 */
export function findPauses(moves: TimedMove[], splits: CfopSplits): Pause[] {
  if (moves.length < 2) return [];
  const threshold = pauseThreshold(moves);
  const out: Pause[] = [];
  gapsOf(moves).forEach((gap, i) => {
    if (gap <= threshold) return;
    const at = i + 1;
    out.push({ at, start: moves[i].t, duration: gap, ...classify(at, moves, splits) });
  });
  return out;
}

type Classification = Pick<Pause, 'kind' | 'stage' | 'where' | 'caseId' | 'alg' | 'drillId'>;

function classify(at: number, moves: TimedMove[], sp: CfopSplits): Classification {
  const mc = sp.moveCounts;
  if (!sp.crossFace || mc.cross === null || at < mc.cross) return { kind: 'lookahead', stage: 'Cross' };
  // F2L: pair k spans (previous boundary, pairMoves[k]].
  if (mc.f2l === null || at < mc.f2l) {
    let prev = mc.cross;
    for (let k = 0; k < sp.pairMoves.length; k++) {
      const end = sp.pairMoves[k];
      if (at < end) return { kind: 'lookahead', stage: `Pair ${k + 1}`, where: at === prev ? 'between pairs' : 'inside pair' };
      prev = end;
    }
    // F2L not finished (shouldn't happen for a solved cube): count as finding the next pair.
    return { kind: 'lookahead', stage: `Pair ${sp.pairMoves.length + 1}`, where: at === prev ? 'between pairs' : 'inside pair' };
  }

  const llFace = opposite(sp.crossFace);
  const isAuf = (j: number) => moves[j]?.move[0] === llFace;
  const solveEnd = mc.pll ?? moves.length;

  const steps = sp.llSteps;
  if (!steps) {
    // Older analysis: only stage bounds.
    const stage = mc.oll === null || at < mc.oll ? 'OLL' : at < solveEnd ? 'PLL' : 'AUF';
    if (stage === 'AUF') return { kind: 'recognition', stage };
    const startOf = stage === 'OLL' ? mc.f2l : mc.oll!;
    let j = startOf;
    while (j < at && isAuf(j)) j++;
    return { kind: j === at ? 'recognition' : 'mid-alg', stage };
  }

  const step = steps.find((s) => at >= s.startMove && at < s.endMove);
  if (!step) {
    // Between steps only AUF moves remain (an LL skip, or the final AUF).
    return { kind: 'recognition', stage: 'AUF' };
  }
  const base = { stage: step.kind, caseId: step.caseId, drillId: DRILL_FOR_STEP[step.kind] };
  const algStart = algStartOf(step, moves, sp.crossFace);
  if (at <= algStart) return { kind: 'recognition', ...base };
  // Trailing AUF of the solve's last step: recognising the final AUF.
  if (step.endMove === solveEnd) {
    let algEnd = step.endMove;
    while (algEnd > algStart && isAuf(algEnd - 1)) algEnd--;
    if (at >= algEnd) return { kind: 'recognition', stage: 'AUF' };
  }
  return { kind: 'mid-alg', ...base, alg: stepLabel(step) };
}

/**
 * Index of the first move of a last-layer step's alg: leading AUFs (and D moves done with them)
 * are part of recognising the case. Caveat: an alg's own U/D moves at its very start count too.
 */
export function algStartOf(step: Pick<LLStep, 'startMove' | 'endMove'>, moves: TimedMove[], crossFace: Face): number {
  const ll = opposite(crossFace);
  let j = step.startMove;
  while (j < step.endMove && (moves[j].move[0] === ll || moves[j].move[0] === crossFace)) j++;
  return j;
}

/** Total pause time per kind. */
export function pauseTotals(pauses: Pause[]): Record<PauseKind, number> {
  const t: Record<PauseKind, number> = { recognition: 0, lookahead: 0, 'mid-alg': 0 };
  for (const p of pauses) t[p.kind] += p.duration;
  return t;
}

/** One-line description: "recognition before OLL 27 (Sune)", "lookahead between pairs (Pair 3)". */
export function pauseLabel(p: Pause): string {
  const cn = p.caseId ? caseName(p.caseId) : null;
  switch (p.kind) {
    case 'recognition':
      return p.stage === 'AUF' ? 'recognising the AUF' : `recognition: ${p.stage}${cn ? ` (${cn})` : ''}`;
    case 'lookahead':
      return p.where ? `lookahead ${p.where} (${p.stage})` : `lookahead (${p.stage})`;
    case 'mid-alg':
      return `mid-algorithm: ${p.alg ?? cn ?? p.stage} - not fluent yet`;
  }
}

/** Stage label of `moves[at]` ("Cross", "Pair 2", "OCLL", "AUF", ...). */
export const stageOfMove = (at: number, moves: TimedMove[], splits: CfopSplits) => classify(at, moves, splits).stage;
