import { describe, expect, it } from 'vitest';
import { averageOfLast, best, rollingAverage, timeAxis, trimmedAverage } from './stats';

describe('trimmedAverage', () => {
  it('ao5 drops best and worst; one DNF counts as worst, two make it DNF', () => {
    expect(trimmedAverage([10, 20, 30, 40, 1000])).toBe(30);
    expect(trimmedAverage([10, 20, 30, 40, null])).toBe(30);
    expect(trimmedAverage([10, 20, 30, null, null])).toBeNull();
  });
  it('ao100 drops 5 at each end', () => {
    const t = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(trimmedAverage(t)).toBe(50.5);
    expect(trimmedAverage([...t.slice(0, 95), null, null, null, null, null])).not.toBeNull();
    expect(trimmedAverage([...t.slice(0, 94), null, null, null, null, null, null])).toBeNull();
  });
  it('too few times to trim', () => {
    expect(trimmedAverage([1, 2])).toBeNull();
  });
});

describe('averageOfLast / rollingAverage', () => {
  const times = [10, 20, 30, 40, 50, 60];
  it('uses the last n; undefined before n', () => {
    expect(averageOfLast(times, 5)).toBe(40);
    expect(averageOfLast(times.slice(0, 4), 5)).toBeUndefined();
  });
  it('the running ao5 after each solve', () => {
    expect(rollingAverage(times, 5)).toEqual([undefined, undefined, undefined, undefined, 30, 40]);
    expect(rollingAverage([1, 2, 3, null, null, 9], 5)).toEqual([undefined, undefined, undefined, undefined, null, null]);
  });
  it('best skips DNF and missing', () => {
    expect(best([undefined, null, 30, 20])).toBe(20);
    expect(best([undefined, null])).toBeNull();
  });
});

describe('timeAxis', () => {
  it('whole-second ticks around the times, ignoring the slowest 5%', () => {
    const t = [...Array.from({ length: 40 }, (_, i) => 30_000 + i * 500), 300_000];
    const ax = timeAxis(t);
    expect(ax.min).toBeLessThanOrEqual(30_000);
    expect(ax.max).toBeGreaterThanOrEqual(49_500);
    expect(ax.max).toBeLessThan(100_000);
    expect(ax.ticks[0]).toBe(ax.min);
    expect(ax.ticks.at(-1)).toBe(ax.max);
    expect(ax.ticks.every((x) => x % 1000 === 0)).toBe(true);
    expect(ax.ticks.length).toBeLessThanOrEqual(8);
  });
  it('one time or none still gives an axis', () => {
    expect(timeAxis([12_340]).ticks.length).toBeGreaterThan(1);
    expect(timeAxis([]).max).toBeGreaterThan(0);
  });
});
