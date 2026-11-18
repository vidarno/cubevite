import type { HintStyle, SolveHint } from '../cube/llHint';
import type { CfopSplits, TimedMove } from '../cube/cfop';
import { createPersisted } from './storage';
import { setAlgPrefs, type AlgPrefs } from '../cube/preferred';
import type { SrsDeck } from '../cube/srs';
import { averageOfLast } from '../cube/stats';

export interface Solve {
  id: string;
  date: number;
  scramble: string;
  /** ms; null = DNF */
  time: number | null;
  penalty?: '+2' | 'DNF';
  smart: boolean;
  /** cube state at start of solve (smart solves only) */
  start?: string;
  moves?: TimedMove[];
  splits?: CfopSplits;
  /** Id of the solve whose start state this one redid (redos stay out of averages and insights). */
  redoOf?: string;
  /** Last-layer hints shown during the solve (Timer). */
  hints?: SolveHint[];
}

export const solvesStore = createPersisted<Solve[]>('cubevite.solves', []);

import type { LearnStatus } from '../cube/learningPath';
export type { LearnStatus };

export interface CaseStats {
  times: number[]; // most recent last, capped
  attempts: number;
}

export const learnStore = createPersisted<Record<string, LearnStatus>>('cubevite.learn', {});
export const caseStatsStore = createPersisted<Record<string, CaseStats>>('cubevite.caseStats', {});
/** Last drill opened in the trainer (also set by the Algorithms page's "drill my learning cases"). */
export const trainerDrillStore = createPersisted<string>('cubevite.trainerDrill', 'PLL');
/** Case ids of the "My weakest cases" drill, set by Insights' "Train my weakest". */
export const weakestStore = createPersisted<string[]>('cubevite.weakest', []);
/** Cases switched off per dynamic-case drill (learning / weakest); see `Drill.dynamicCases`. */
export const trainerExcluded = createPersisted<Record<string, string[]>>('cubevite.trainerExcl', {});
export const trainerSelection = createPersisted<Record<string, string[]>>('cubevite.trainerSel', { OLL: [], PLL: [] });

export interface Settings {
  inspection: boolean;
  hideTimerWhileSolving: boolean;
  showHints: boolean;
  /** Show yellow on top in the 3D view (white cross on the bottom). */
  yellowTop?: boolean;
  /** Arrows on PLL diagrams showing where pieces go (default on). */
  pllArrows?: boolean;
  /** Drills with a smart cube: show the alg / step hint right away instead of behind a button (default on). */
  drillShowAlg?: boolean;
  /** With the alg hidden: still show how to undo a wrong turn (relative to the DB algs). */
  drillUndoTips?: boolean;
  /** Show algs without whole-cube rotations (x/y/z taken out, later moves renamed). */
  noRotations?: boolean;
  /** Cross drill: solve normally, solve without looking (3D view hidden once you start), or plan only. */
  crossMode?: CrossMode;
  /** Cross drill inspection limit in seconds (0 = none; default 15). */
  crossInspect?: number;
  /** Timer: last-layer hints while solving (default 2-look). */
  llHints?: HintStyle;
  /** Trainer: recognition only (clock stops on space / first turn, no execution). */
  drillRecognize?: boolean;
  /** Trainer: due cases first (spaced repetition; default on). */
  srs?: boolean;
  /** Timer: seconds without a turn before the hint name, then before the picture, then the alg (default 5/5/5). */
  hintGaps?: [number, number, number];
}
export type CrossMode = 'solve' | 'noLook' | 'plan';

/** One cross drill attempt (for the trainer's summary and later insights). */
export interface CrossAttempt {
  date: number;
  optimal: number;
  /** null in plan-only mode */
  moves: number | null;
  planMs: number;
  execMs: number | null;
  mode: CrossMode;
  /** A redo of the previous scramble (left out of the summary). */
  redo?: boolean;
}
/** Alg loop (back-to-back reps of one alg) per case id: recent clean rep times and the rep count. */
export interface LoopStats { times: number[]; reps: number; best: number | null }
/** Preferred / own algs per case id; mirrored into the `src/cube/preferred` registry the drills and hints read. */
export const algPrefsStore = createPersisted<AlgPrefs>('cubevite.algPrefs', {});
setAlgPrefs(algPrefsStore.get());
algPrefsStore.subscribe(() => setAlgPrefs(algPrefsStore.get()));

/** Recognition-only trainer attempts per case id: recent recognition times, attempts, misses. */
export interface RecogStats { times: number[]; attempts: number; misses: number }
export const recogStatsStore = createPersisted<Record<string, RecogStats>>('cubevite.recogStats', {});

/** Spaced-repetition boxes per case id (trainer grades, Timer hints). */
export const srsStore = createPersisted<SrsDeck>('cubevite.srs', {});

export const loopStatsStore = createPersisted<Record<string, LoopStats>>('cubevite.loopStats', {});

export const crossLogStore = createPersisted<CrossAttempt[]>('cubevite.crossLog', []);
export const settingsStore = createPersisted<Settings>('cubevite.settings', {
  inspection: false, hideTimerWhileSolving: false, showHints: true, yellowTop: true,
});

/** Solves that count for averages, bests and insights (not redos of an earlier scramble). */
export const countedSolves = (solves: Solve[]) => solves.filter((s) => !s.redoOf);

export function effectiveTime(s: Solve): number | null {
  if (s.penalty === 'DNF' || s.time === null) return null;
  return s.time + (s.penalty === '+2' ? 2000 : 0);
}

/** WCA average of the last n solves: drop best and worst (5%), DNF counts as worst; undefined if fewer than n. */
export const averageOf = (solves: Solve[], n: number) => averageOfLast(solves.map(effectiveTime), n);

export function formatTime(ms: number | null | undefined, digits = 2): string {
  if (ms === undefined) return '–';
  if (ms === null) return 'DNF';
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const sStr = s.toFixed(digits);
  return m > 0 ? `${m}:${sStr.padStart(digits + 3, '0')}` : sStr;
}
