/**
 * Spaced repetition for trainer cases (Leitner boxes). Each case has a box; a good attempt moves it
 * up a box (longer wait before it's due again), a hard one keeps it, a miss ("again") sends it back
 * to box 0, due right away. The trainer picks due cases first (lowest box first); when nothing is
 * due it falls back to its usual weighted pick. Pure logic: the deck is persisted in `state/data`.
 */
import type { Rng } from './drills';

export interface SrsCard {
  box: number;
  /** Epoch ms when the case is due again. */
  due: number;
  /** Epoch ms of the last review. */
  last: number;
  /** Times the case went back to box 0. */
  lapses: number;
}
export type SrsDeck = Record<string, SrsCard>;
export type Grade = 'again' | 'hard' | 'good';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Wait before a case in each box is due again. Box 0 is due right away (the trainer never repeats a case back to back). */
export const INTERVALS_MS = [0, 10 * MIN, HOUR, 8 * HOUR, DAY, 3 * DAY, 7 * DAY, 21 * DAY, 60 * DAY];
export const MAX_BOX = INTERVALS_MS.length - 1;

export interface Attempt {
  ms: number;
  /** Target time for the case (the learning-path stage threshold). */
  targetMs: number;
  /** The alg was asked for (Show algorithm) or shown because the solve got stuck. */
  revealed?: boolean;
  /** Turns beyond what the shortest shown alg needs (wrong turns + undos, a longer own alg). */
  extraMoves?: number;
}

/** Turns over the alg that still count as clean (a wrong turn + its undo is 2). */
const EXTRA_OK = 4;

export function gradeAttempt(a: Attempt): Grade {
  if (a.revealed || a.ms > 2 * a.targetMs) return 'again';
  if (a.ms > a.targetMs || (a.extraMoves ?? 0) > EXTRA_OK) return 'hard';
  return 'good';
}

/** The card after a review graded `grade` at `now` (`card` undefined = first review). */
export function review(card: SrsCard | undefined, grade: Grade, now: number): SrsCard {
  const prev = card ?? { box: 0, due: now, last: now, lapses: 0 };
  const box = grade === 'again' ? 0 : grade === 'hard' ? Math.max(1, Math.min(prev.box, MAX_BOX)) : Math.min(prev.box + 1, MAX_BOX);
  return { box, due: now + INTERVALS_MS[box], last: now, lapses: prev.lapses + (grade === 'again' && card ? 1 : 0) };
}

/** Deck with one more review. */
export const reviewed = (deck: SrsDeck, id: string, grade: Grade, now: number): SrsDeck =>
  ({ ...deck, [id]: review(deck[id], grade, now) });

/** Unseen cases are due. */
export const isDue = (card: SrsCard | undefined, now: number) => !card || card.due <= now;

export const dueIds = (ids: string[], deck: SrsDeck, now: number) => ids.filter((id) => isDue(deck[id], now));

/**
 * A due case to drill next, or null if none is due: cases already reviewed come before unseen ones,
 * lowest box first, random among equals; never the previous case (unless it's the only one).
 */
export function pickDue<C extends { id: string }>(pool: C[], deck: SrsDeck, now: number, prev?: string, rng: Rng = Math.random): C | null {
  const cands = (pool.length > 1 ? pool.filter((c) => c.id !== prev) : pool).filter((c) => isDue(deck[c.id], now));
  if (!cands.length) return null;
  const rank = (c: C) => deck[c.id]?.box ?? MAX_BOX + 1;
  const best = Math.min(...cands.map(rank));
  const top = cands.filter((c) => rank(c) === best);
  return top[Math.floor(rng() * top.length)];
}

/** "now", "8 min", "3 h", "2 d": time until due. */
export function dueIn(card: SrsCard | undefined, now: number): string {
  const ms = card ? card.due - now : 0;
  if (ms <= 0) return 'now';
  const min = Math.ceil(ms / MIN);
  if (min < 60) return `${min} min`;
  const h = Math.round(ms / HOUR);
  if (h < 24) return `${h} h`;
  return `${Math.round(ms / DAY)} d`;
}
