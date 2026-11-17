/**
 * Learning path: 2-look OLL (10 algs) -> 2-look PLL (6) -> full PLL (21) -> full OLL (57).
 * Progress comes from the learn status (new / learning / learned) and trainer stats; a case is
 * suggested as learned once the mean of its last 5 drill times is under the stage threshold.
 * Pure logic; the views live in AlgsPage / TrainerPage.
 */
import {
  DRILL_BY_ID, OCLL_DRILL, OLL_DRILL, OLL_EDGES_DRILL, PLL_CORNERS_DRILL, PLL_DRILL, PLL_EDGES_DRILL, recentAvg,
  type Drill, type DrillCase,
} from './drills';

export type LearnStatus = 'new' | 'learning' | 'learned';

export interface Stage {
  id: string;
  label: string;
  description: string;
  /** Case drills whose cases make up the stage, in order. */
  drills: Drill[];
  /** Suggest "learned" when the mean of the last 5 times is below this (ms). */
  thresholdMs: number;
}

export const SUGGEST_MIN_TIMES = 5;

export const LEARNING_PATH: Stage[] = [
  {
    id: '2L-OLL', label: '2-look OLL', thresholdMs: 4000, drills: [OLL_EDGES_DRILL, OCLL_DRILL],
    description: 'Orient the edges (make the yellow cross: dot, L-shape, line), then the corners (OCLL, 7 cases).',
  },
  {
    id: '2L-PLL', label: '2-look PLL', thresholdMs: 4000, drills: [PLL_CORNERS_DRILL, PLL_EDGES_DRILL],
    description: 'Permute the corners (headlights -> T-perm, diagonal -> Y-perm), then the edges (Ua, Ub, H, Z).',
  },
  {
    id: 'PLL', label: 'Full PLL', thresholdMs: 5000, drills: [PLL_DRILL],
    description: 'All 21 PLLs: permute the last layer in one look. The edges-only ones are already known from 2-look.',
  },
  {
    id: 'OLL', label: 'Full OLL', thresholdMs: 5000, drills: [OLL_DRILL],
    description: 'All 57 OLLs: orient the last layer in one look. OCLL (21-27) is already known from 2-look.',
  },
];

export interface StageItem { drill: Drill; c: DrillCase }

/** The stage's cases (one entry per case id, first drill wins). */
export function stageItems(stage: Stage): StageItem[] {
  const seen = new Set<string>();
  const out: StageItem[] = [];
  for (const drill of stage.drills) {
    for (const c of drill.cases) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ drill, c });
    }
  }
  return out;
}

type StatsMap = Record<string, { times: number[] } | undefined>;
type LearnMap = Record<string, LearnStatus | undefined>;

/** True when the case is fast enough (mean of last 5 under the threshold, at least 5 times) but not marked learned. */
export function suggestLearned(caseId: string, thresholdMs: number, learn: LearnMap, stats: StatsMap): boolean {
  if (learn[caseId] === 'learned') return false;
  const times = stats[caseId]?.times ?? [];
  if (times.length < SUGGEST_MIN_TIMES) return false;
  const avg = recentAvg(times);
  return avg !== null && avg < thresholdMs;
}

export interface StageProgress {
  total: number;
  learned: number;
  learning: number;
  /** Case ids suggested for "learned". */
  suggested: string[];
  done: boolean;
}

export function stageProgress(stage: Stage, learn: LearnMap, stats: StatsMap): StageProgress {
  const items = stageItems(stage);
  const status = (id: string) => learn[id] ?? 'new';
  const learned = items.filter((i) => status(i.c.id) === 'learned').length;
  return {
    total: items.length,
    learned,
    learning: items.filter((i) => status(i.c.id) === 'learning').length,
    suggested: items.filter((i) => suggestLearned(i.c.id, stage.thresholdMs, learn, stats)).map((i) => i.c.id),
    done: learned === items.length,
  };
}

/** The first stage that isn't fully learned (null when everything is). */
export function currentStage(learn: LearnMap): Stage | null {
  return LEARNING_PATH.find((s) => stageItems(s).some((i) => learn[i.c.id] !== 'learned')) ?? null;
}

export const LEARNING_DRILL_ID = 'learning';
export const WEAKEST_DRILL_ID = 'weakest';

/**
 * A drill mixing cases from several case drills (ids as used in the DB / 2-look steps). Each case is
 * set up and checked by the case drill it comes from along the learning path (all single-step), so
 * the step's done-test takes the case. Unknown ids are dropped.
 */
export function mixedDrill(meta: Pick<Drill, 'id' | 'label' | 'group' | 'description'>, caseIds: Iterable<string>): Drill {
  const index = new Map<string, StageItem>();
  for (const i of LEARNING_PATH.flatMap(stageItems)) if (!index.has(i.c.id)) index.set(i.c.id, i);
  const byId = new Map<string, StageItem>();
  for (const id of caseIds) { const i = index.get(id); if (i) byId.set(id, i); }
  const source = (c: DrillCase | null) => {
    const i = c && byId.get(c.id);
    if (!i) throw new Error(`${meta.id} drill: unknown case`);
    return i.drill;
  };
  return {
    ...meta,
    // Mixed sets: label DB cases by full id ("OLL 21", "PLL T"); step-1 cases keep their names.
    cases: [...byId.values()].map((i) => (i.c.id.startsWith('2L ') ? i.c : { ...i.c, label: i.c.id })),
    dynamicCases: true,
    pickTarget: (c, rng) => source(c).pickTarget(c, rng),
    steps: [{ id: 'case', label: 'Case', isDone: (state, c) => source(c ?? null).steps[0].isDone(state, c) }],
  };
}

/** Every case marked "learning" along the path, in path order. */
export function learningDrill(learn: LearnMap): Drill {
  const ids = LEARNING_PATH.flatMap(stageItems).map((i) => i.c.id).filter((id) => learn[id] === 'learning');
  return mixedDrill({
    id: LEARNING_DRILL_ID,
    label: 'My learning cases',
    group: 'Learning path',
    description: 'Every case marked "learning" on the Algorithms page, mixed. Due cases come first (spaced repetition), then slow and new ones more often.',
  }, ids);
}

/** The weakest cases from solve insights ("Train my weakest"). */
export function weakestDrill(caseIds: string[]): Drill {
  return mixedDrill({
    id: WEAKEST_DRILL_ID,
    label: 'My weakest cases',
    group: 'Learning path',
    description: 'The last-layer cases that cost you the most time in your recent solves (from Insights), mixed.',
  }, caseIds);
}

/** Default target for cases outside the learning path (F2L cases). */
export const DEFAULT_TARGET_MS = 5000;
let targetIndex: Map<string, number> | null = null;

/** Target time for a case (spaced-repetition grading): its learning-path stage threshold. */
export function targetMsFor(caseId: string): number {
  targetIndex ??= new Map(LEARNING_PATH.flatMap((st) => stageItems(st).map((i) => [i.c.id, st.thresholdMs] as const)).reverse());
  return targetIndex.get(caseId) ?? DEFAULT_TARGET_MS;
}

/** Drill by id, including the dynamic learning / weakest drills. */
export function drillById(id: string, learn: LearnMap, weakest: string[] = []): Drill | undefined {
  if (id === LEARNING_DRILL_ID) return learningDrill(learn);
  if (id === WEAKEST_DRILL_ID) return weakestDrill(weakest);
  return DRILL_BY_ID.get(id);
}
