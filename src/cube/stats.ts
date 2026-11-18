/**
 * Solve-time statistics: WCA-style averages (ao5 / ao12 / ao100) and their running values over a
 * list of solves, for the Timer and the progress chart. Times are ms; null = DNF.
 */

/** WCA average of the times: drop the best and worst 5% (at least one each); DNF counts as worst. Null if too many DNFs. */
export function trimmedAverage(times: (number | null)[]): number | null {
  const n = times.length;
  const trim = Math.max(1, Math.ceil(n * 0.05));
  if (n <= 2 * trim) return null;
  if (times.filter((t) => t === null).length > trim) return null;
  const kept = times.map((t) => t ?? Infinity).sort((a, b) => a - b).slice(trim, n - trim);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/** Average of the last n times; undefined while there are fewer than n. */
export function averageOfLast(times: (number | null)[], n: number): number | null | undefined {
  return times.length < n ? undefined : trimmedAverage(times.slice(-n));
}

/** The ao-n after each solve (index i = average of solves i-n+1..i): undefined before n solves, null when DNF. */
export function rollingAverage(times: (number | null)[], n: number): (number | null | undefined)[] {
  return times.map((_, i) => (i + 1 < n ? undefined : trimmedAverage(times.slice(i + 1 - n, i + 1))));
}

/** Best (lowest) value, ignoring DNFs / missing; null if none. */
export function best(values: (number | null | undefined)[]): number | null {
  const ok = values.filter((v): v is number => typeof v === 'number');
  return ok.length ? Math.min(...ok) : null;
}

/**
 * Nice y-axis for times in ms: the range covers the fastest solve up to the 95th percentile (so one
 * very slow solve doesn't flatten the rest; points above are drawn at the top edge), rounded to
 * whole-second ticks.
 */
export function timeAxis(times: number[], maxTicks = 6): { min: number; max: number; ticks: number[] } {
  if (!times.length) return { min: 0, max: 10_000, ticks: [0, 5000, 10_000] };
  const sorted = [...times].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const span = Math.max(hi - lo, 1000);
  const raw = span / (maxTicks - 1);
  const step = [1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000].find((s) => s >= raw) ?? 600_000;
  const min = Math.max(0, Math.floor((lo - span * 0.05) / step) * step);
  const max = Math.ceil((hi + span * 0.05) / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + 1e-6; t += step) ticks.push(t);
  return { min, max, ticks };
}
