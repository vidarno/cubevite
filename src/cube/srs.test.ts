import { describe, expect, it } from 'vitest';
import { targetMsFor } from './learningPath';
import { dueIds, dueIn, gradeAttempt, INTERVALS_MS, isDue, MAX_BOX, pickDue, review, reviewed, type SrsDeck } from './srs';

const T0 = 1_800_000_000_000;
const MIN = 60_000;

describe('gradeAttempt', () => {
  it('again when revealed or over twice the target; hard when slow or with many extra turns; else good', () => {
    expect(gradeAttempt({ ms: 1000, targetMs: 4000, revealed: true })).toBe('again');
    expect(gradeAttempt({ ms: 8001, targetMs: 4000 })).toBe('again');
    expect(gradeAttempt({ ms: 4001, targetMs: 4000 })).toBe('hard');
    expect(gradeAttempt({ ms: 2000, targetMs: 4000, extraMoves: 5 })).toBe('hard');
    expect(gradeAttempt({ ms: 2000, targetMs: 4000, extraMoves: 4 })).toBe('good');
    expect(gradeAttempt({ ms: 4000, targetMs: 4000 })).toBe('good');
  });
});

describe('review', () => {
  it('good climbs a box per review, with growing intervals, capped at the last box', () => {
    let c = review(undefined, 'good', T0);
    expect(c).toEqual({ box: 1, due: T0 + INTERVALS_MS[1], last: T0, lapses: 0 });
    for (let i = 0; i < 20; i++) c = review(c, 'good', c.due);
    expect(c.box).toBe(MAX_BOX);
    expect(c.due - c.last).toBe(INTERVALS_MS[MAX_BOX]);
  });
  it('hard keeps the box (at least 1); again goes to box 0, due now, and counts a lapse (not on a first review)', () => {
    expect(review(undefined, 'hard', T0)).toMatchObject({ box: 1, due: T0 + 10 * MIN });
    const c = { box: 4, due: T0, last: T0 - 1, lapses: 0 };
    expect(review(c, 'hard', T0)).toMatchObject({ box: 4, due: T0 + INTERVALS_MS[4] });
    expect(review(c, 'again', T0)).toEqual({ box: 0, due: T0, last: T0, lapses: 1 });
    expect(review(undefined, 'again', T0).lapses).toBe(0);
  });
});

describe('due cases', () => {
  const deck: SrsDeck = {
    a: { box: 3, due: T0 - 1, last: 0, lapses: 0 },
    b: { box: 1, due: T0 - 1, last: 0, lapses: 0 },
    c: { box: 0, due: T0 + MIN, last: 0, lapses: 0 },
  };
  const pool = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  it('unseen and past-due cases are due', () => {
    expect(isDue(undefined, T0)).toBe(true);
    expect(dueIds(pool.map((c) => c.id), deck, T0)).toEqual(['a', 'b', 'd']);
  });
  it('picks the lowest box among due reviewed cases, then unseen, never the previous one', () => {
    expect(pickDue(pool, deck, T0)!.id).toBe('b');
    expect(pickDue(pool, deck, T0, 'b')!.id).toBe('a');
    expect(pickDue(pool, { ...deck, a: { ...deck.a, due: T0 + 1 } }, T0, 'b')!.id).toBe('d');
    expect(pickDue([{ id: 'c' }], deck, T0)).toBeNull();
    expect(pickDue([{ id: 'b' }], deck, T0, 'b')!.id).toBe('b');
  });
  it('random among equals', () => {
    const d2 = reviewed(reviewed({}, 'x', 'again', T0), 'y', 'again', T0);
    const xy = [{ id: 'x' }, { id: 'y' }];
    expect(pickDue(xy, d2, T0, undefined, () => 0)!.id).toBe('x');
    expect(pickDue(xy, d2, T0, undefined, () => 0.99)!.id).toBe('y');
  });
  it('a missed case is due again right after another case', () => {
    let d: SrsDeck = {};
    d = reviewed(d, 'a', 'good', T0);
    d = reviewed(d, 'b', 'again', T0);
    expect(pickDue([{ id: 'a' }, { id: 'b' }], d, T0 + 1000, 'a')!.id).toBe('b');
  });
  it('dueIn reads nicely', () => {
    expect(dueIn(undefined, T0)).toBe('now');
    expect(dueIn({ box: 1, due: T0 + 9.5 * MIN, last: 0, lapses: 0 }, T0)).toBe('10 min');
    expect(dueIn({ box: 3, due: T0 + 8 * 60 * MIN, last: 0, lapses: 0 }, T0)).toBe('8 h');
    expect(dueIn({ box: 5, due: T0 + 3 * 24 * 60 * MIN, last: 0, lapses: 0 }, T0)).toBe('3 d');
    expect(dueIn({ box: 2, due: T0 + 59.5 * MIN, last: 0, lapses: 0 }, T0)).toBe('1 h');
    expect(dueIn({ box: 4, due: T0 + 24 * 60 * MIN - 5000, last: 0, lapses: 0 }, T0)).toBe('1 d');
  });
});

describe('targetMsFor', () => {
  it('uses the learning-path stage of the case (first stage wins), default otherwise', () => {
    expect(targetMsFor('2L OLL Dot')).toBe(4000);
    expect(targetMsFor('OLL 27')).toBe(4000); // OCLL: 2-look OLL stage
    expect(targetMsFor('PLL Ua')).toBe(4000);
    expect(targetMsFor('PLL T')).toBe(5000);
    expect(targetMsFor('F2L 3')).toBe(5000);
  });
});
