/**
 * Insights across smart-cube solves (task 2.7): per-case recognition / execution times of the
 * last-layer steps, the most frequent errors, average pause and waste per solve, and stage
 * averages ("ao12 splits"). Pure; built on `analysisOf` of each solve.
 */
import type { CfopSplits, LLStep, LLStepKind, TimedMove } from './cfop';
import { analysisOf } from './analysis';
import { caseName } from './algId';
import { algStartOf, DRILL_FOR_STEP, type PauseKind } from './pauses';
import { coarseStage, type ErrorKind } from './errors';

export interface InsightSolve {
  start?: string;
  moves?: TimedMove[];
  splits?: CfopSplits;
  time: number | null;
}

/** Recognition (step start → first alg move, pre-AUF included) and execution (→ step end) of one LL step, ms. */
export function stepTiming(step: LLStep, moves: TimedMove[], crossFace: NonNullable<CfopSplits['crossFace']>) {
  const a = algStartOf(step, moves, crossFace);
  const first = a < step.endMove ? moves[a].t : step.end;
  return { recognition: first - step.start, execution: step.end - first };
}

export interface CaseInsight {
  caseId: string;
  name: string;
  /** Step kinds the case was seen at ("OCLL", "OLL", ...): a case can come up 1-look and 2-look. */
  kinds: LLStepKind[];
  /** Trainer drill to practise it (from the first kind seen). */
  drillId: string;
  count: number;
  recognition: number;
  execution: number;
  total: number;
  /** Mid-algorithm pauses per occurrence. */
  midAlgRate: number;
  /** Weakness score: total / median total of cases at the same step kind, + mid-alg pause rate / 2. */
  score: number;
}

export interface ErrorInsight {
  kind: ErrorKind;
  stage: 'Cross' | 'F2L' | 'OLL' | 'PLL';
  count: number;
  /** Solves it happened in. */
  solves: number;
  moves: number;
  ms: number;
}

export type StageName = 'Cross' | 'F2L' | 'OLL' | 'PLL' | 'LL recognition' | 'Total';
export const STAGE_NAMES: StageName[] = ['Cross', 'F2L', 'OLL', 'PLL', 'LL recognition', 'Total'];

export interface Insights {
  /** Analysed solves (smart, cross found), most recent `limit`. */
  n: number;
  /** Trimmed mean per stage over the last 12 and over all analysed solves (undefined: not enough data). */
  stages: { stage: StageName; last12?: number; all?: number }[];
  cases: CaseInsight[];
  errors: ErrorInsight[];
  /** Mean pause time per solve by kind, and mean waste per solve. */
  pausePerSolve: Record<PauseKind, number>;
  wastePerSolve: { moves: number; ms: number };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Mean without the best and worst 5% (at least one each) once there are 5 values; plain mean below that. */
export function trimmedMean(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  if (xs.length < 5) return mean(xs);
  const trim = Math.max(1, Math.ceil(xs.length * 0.05));
  return mean([...xs].sort((a, b) => a - b).slice(trim, xs.length - trim));
}

/** Stage durations of one solve (null when the stage wasn't reached / recorded). */
function stageDurations(sp: CfopSplits, time: number | null, recognition: number): Record<StageName, number | null> {
  const f2l = sp.pairs.length === 4 ? sp.pairs[3] : null;
  return {
    Cross: sp.cross,
    F2L: f2l !== null && sp.cross !== null ? f2l - sp.cross : null,
    OLL: sp.oll !== null && f2l !== null ? sp.oll - f2l : null,
    PLL: sp.pll !== null && sp.oll !== null ? sp.pll - sp.oll : null,
    'LL recognition': f2l !== null ? recognition : null,
    Total: time,
  };
}

export function solveInsights(solves: InsightSolve[], limit = 100): Insights {
  const analysed = solves.slice(-limit).flatMap((s) => {
    const a = analysisOf(s);
    return a ? [{ s, a }] : [];
  });
  const perCase = new Map<string, { kinds: LLStepKind[]; rec: number[]; exec: number[]; midAlg: number }>();
  const errs = new Map<string, ErrorInsight & { seen: Set<number> }>();
  const stageRows: Record<StageName, number | null>[] = [];
  const pauseSum: Record<PauseKind, number> = { recognition: 0, lookahead: 0, 'mid-alg': 0 };
  let wasteMoves = 0, wasteMs = 0;

  analysed.forEach(({ s, a }, si) => {
    const sp = a.splits;
    let llRec = 0;
    for (const step of sp.llSteps ?? []) {
      const t = stepTiming(step, s.moves!, sp.crossFace!);
      llRec += t.recognition;
      if (!step.caseId) continue;
      const c = perCase.get(step.caseId) ?? { kinds: [], rec: [], exec: [], midAlg: 0 };
      if (!c.kinds.includes(step.kind)) c.kinds.push(step.kind);
      c.rec.push(t.recognition);
      c.exec.push(t.execution);
      c.midAlg += a.pauses.filter((p) => p.kind === 'mid-alg' && p.at > step.startMove && p.at < step.endMove).length;
      perCase.set(step.caseId, c);
    }
    stageRows.push(stageDurations(sp, s.time, llRec));
    for (const p of a.pauses) pauseSum[p.kind] += p.duration;
    wasteMoves += a.wastedMoves;
    wasteMs += a.wastedMs;
    for (const e of a.errors) {
      const stage = coarseStage(e.stage);
      const key = `${e.kind}|${stage}`;
      const r = errs.get(key) ?? { kind: e.kind, stage, count: 0, solves: 0, moves: 0, ms: 0, seen: new Set<number>() };
      r.count++; r.moves += e.moves; r.ms += e.ms; r.seen.add(si); r.solves = r.seen.size;
      errs.set(key, r);
    }
  });

  // Cases: means, then the score relative to other cases of the same step kind.
  const cases: CaseInsight[] = [...perCase.entries()].map(([caseId, c]) => {
    const recognition = mean(c.rec), execution = mean(c.exec);
    return {
      caseId, name: caseName(caseId), kinds: c.kinds, drillId: DRILL_FOR_STEP[c.kinds[0]], count: c.rec.length,
      recognition, execution, total: recognition + execution, midAlgRate: c.midAlg / c.rec.length, score: 0,
    };
  });
  for (const c of cases) {
    const peers = cases.filter((o) => o.kinds[0] === c.kinds[0]).map((o) => o.total);
    c.score = c.total / Math.max(median(peers), 1) + c.midAlgRate / 2;
  }
  cases.sort((a, b) => b.score - a.score || b.total - a.total);

  const column = (rows: Record<StageName, number | null>[], st: StageName) =>
    trimmedMean(rows.map((r) => r[st]).filter((v): v is number => v !== null));
  const n = analysed.length || 1;
  return {
    n: analysed.length,
    stages: STAGE_NAMES.map((stage) => ({ stage, last12: column(stageRows.slice(-12), stage), all: column(stageRows, stage) })),
    cases,
    errors: [...errs.values()].map(({ seen: _seen, ...e }) => e).sort((a, b) => b.ms - a.ms || b.count - a.count),
    pausePerSolve: { recognition: pauseSum.recognition / n, lookahead: pauseSum.lookahead / n, 'mid-alg': pauseSum['mid-alg'] / n },
    wastePerSolve: { moves: wasteMoves / n, ms: wasteMs / n },
  };
}

/**
 * Case ids for "Train my weakest": the top `n` by score among cases that are actually weak (slower
 * than the median of their step's cases, or with mid-alg pauses: score > 1).
 */
export const weakestCaseIds = (ins: Insights, n = 5) => ins.cases.filter((c) => c.score > 1).slice(0, n).map((c) => c.caseId);
