/**
 * Everything the analysis UI shows about one smart-cube solve (task 2.6), derived on the fly from
 * the recorded moves: stage of every move, LL algs used, pauses, errors, the biggest time loss and
 * the stage bands of the timeline. Pure; the components only lay it out.
 */
import { analyzeSolve, type CfopSplits, type LLStepKind, type TimedMove } from './cfop';
import { stepLabel } from './algId';
import { findPauses, pauseLabel, stageOfMove, type Pause } from './pauses';
import { COLOR, coarseStage, errorLabel, findErrors, type SolveError } from './errors';
import { crossReport } from './crossDrill';
import { analyzeF2L, type F2LPairAnalysis } from './f2lAnalysis';
import { CROSS_DOWN_ROTATION, faceMapFor, mapMove } from './display';
import { tokenize, type Face } from './facelets';

export type CoarseStage = 'Cross' | 'F2L' | 'OLL' | 'PLL';

export interface StageBand {
  /** "Cross", "Pair 2", "OCLL", "PLL edges", "AUF", ... */
  stage: string;
  coarse: CoarseStage;
  /** Moves moves[startMove .. endMove-1]; times from the move before the band (0 for the first) to its last move. */
  startMove: number;
  endMove: number;
  start: number;
  end: number;
}

export interface TimeLoss {
  source: 'pause' | 'error';
  ms: number;
  /** Move index to jump to: the state the solver was looking at / where the error began. */
  at: number;
  label: string;
}

/** Your cross vs the optimal one for the same scramble and colour. Moves are in the cross-down frame. */
export interface CrossAnalysis {
  face: Face;
  /** "white", ...; and the colour in front when the cross is held on the bottom. */
  colour: string;
  front: string;
  /** Your cross moves, merged face turns (R R = R2). */
  moves: number;
  yourAlg: string;
  optimal: number;
  solutions: string[];
}

export interface SolveAnalysis {
  splits: CfopSplits;
  cross: CrossAnalysis;
  /** Each F2L pair: slot, case, your moves vs the DB alg, pair-order hint. */
  f2l: F2LPairAnalysis[];
  /** Stage label per move. */
  stages: string[];
  bands: StageBand[];
  /** Last-layer algs in order: "OLL edges: Line", "OCLL: OLL 27 (Sune)", ... */
  algs: { kind: LLStepKind; label: string }[];
  pauses: Pause[];
  errors: SolveError[];
  /** Largest single pause or error by time, null for a clean solve. */
  biggestLoss: TimeLoss | null;
  pauseMs: number;
  wastedMoves: number;
  wastedMs: number;
}


/** How a cross colour is held: that colour on the bottom and the colour in front (cross-down rotation). */
export function crossHold(face: Face): { colour: string; front: string } {
  const map = faceMapFor(CROSS_DOWN_ROTATION[face]);
  const front = (Object.keys(map) as Face[]).find((f) => map[f] === 'F')!;
  return { colour: COLOR[face], front: COLOR[front] };
}

/** Cross analysis for the scramble `start` and the moves up to the end of the cross (cube frame). */
export function analyzeCross(start: string, crossMoves: string[], face: Face): CrossAnalysis {
  const r = crossReport(start, crossMoves, face);
  const map = faceMapFor(CROSS_DOWN_ROTATION[face]);
  const down = (alg: string) => tokenize(alg).map((m) => mapMove(m, map)).join(' ');
  return {
    face, ...crossHold(face),
    moves: r.yourMoves, yourAlg: down(r.yourAlg), optimal: r.optimal, solutions: r.solutions.map(down),
  };
}

/**
 * Analyse a smart solve. `splits` may be the stored analysis; it is recomputed when it predates
 * last-layer steps (`llSteps`).
 */
export function analyzeSmartSolve(start: string, moves: TimedMove[], splits?: CfopSplits): SolveAnalysis | null {
  if (!moves.length) return null;
  const sp = splits?.llSteps ? splits : analyzeSolve(start, moves);
  if (!sp.crossFace) return null;
  const stages = moves.map((_, i) => stageOfMove(i, moves, sp));
  const bands: StageBand[] = [];
  stages.forEach((stage, i) => {
    const last = bands[bands.length - 1];
    if (last && last.stage === stage) { last.endMove = i + 1; last.end = moves[i].t; return; }
    bands.push({ stage, coarse: coarseStage(stage), startMove: i, endMove: i + 1, start: i ? moves[i - 1].t : 0, end: moves[i].t });
  });
  const pauses = findPauses(moves, sp);
  const f2l = analyzeF2L(start, moves, sp);
  // A database F2L alg may break the cross / a pair on purpose (F-moves, sledgehammer) and restores it
  // within the pair: not an error when that pair was done with the alg.
  const byAlg = f2l.filter((p) => p.usedAlg);
  const errors = findErrors(start, moves, sp).filter((e) => !((e.kind === 'broken cross' || e.kind === 'broken pair')
    && byAlg.some((p) => e.start >= p.startMove && e.end <= p.endMove)));
  const losses: TimeLoss[] = [
    ...pauses.map((p): TimeLoss => ({ source: 'pause', ms: p.duration, at: p.at, label: pauseLabel(p) })),
    ...errors.map((e): TimeLoss => ({ source: 'error', ms: e.ms, at: e.start, label: `${e.stage}: ${errorLabel(e)}` })),
  ];
  const biggestLoss = losses.reduce<TimeLoss | null>((b, l) => (l.ms > 0 && (!b || l.ms > b.ms) ? l : b), null);
  return {
    splits: sp,
    cross: analyzeCross(start, moves.slice(0, sp.moveCounts.cross ?? 0).map((m) => m.move), sp.crossFace),
    f2l,
    stages,
    bands,
    algs: (sp.llSteps ?? []).map((s) => ({ kind: s.kind, label: stepLabel(s) })),
    pauses,
    errors,
    biggestLoss,
    pauseMs: pauses.reduce((n, p) => n + p.duration, 0),
    wastedMoves: errors.reduce((n, e) => n + e.moves, 0),
    wastedMs: errors.reduce((n, e) => n + e.ms, 0),
  };
}

/** Analysis of a stored solve (null for manual solves / solves without a detected cross). */
export function analysisOf(solve: { start?: string; moves?: TimedMove[]; splits?: CfopSplits }): SolveAnalysis | null {
  if (!solve.moves?.length || !solve.start) return null;
  return analyzeSmartSolve(solve.start, solve.moves, solve.splits);
}

/** Index of the move closest in time to `t` (for clicks on the timeline). */
export function moveNearest(moves: TimedMove[], t: number): number {
  let best = 0;
  moves.forEach((m, i) => { if (Math.abs(m.t - t) < Math.abs(moves[best].t - t)) best = i; });
  return best;
}
