/**
 * Progress chart: every counted solve as a dot plus the running ao5 / ao12 / ao100 lines, over the
 * last N solves. One time axis (seconds); the slowest 5% may sit above the top edge (drawn as a caret
 * there). Hover / tap shows the solve's time and averages at that point.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { best, rollingAverage, timeAxis } from '../cube/stats';
import { effectiveTime, formatTime, type Solve } from '../state/data';

const SERIES = [
  { n: 5, label: 'ao5', color: 'var(--series-1)' },
  { n: 12, label: 'ao12', color: 'var(--series-2)' },
  { n: 100, label: 'ao100', color: 'var(--series-3)' },
] as const;
const RANGES = [50, 100, 500, 0] as const; // 0 = all
const H = 260;
const PAD = { top: 12, right: 52, bottom: 26, left: 44 };

export function ProgressChart({ solves }: { solves: Solve[] }) {
  const [range, setRange] = useState<number>(100);
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Averages over the whole history, then cut to the range (so the first ao100 in view is a real one).
  const all = useMemo(() => {
    const times = solves.map(effectiveTime);
    return { times, avgs: SERIES.map((s) => rollingAverage(times, s.n)) };
  }, [solves]);
  /** The range in effect: "last N" only while there are more than N solves. */
  const active = range && solves.length > range ? range : 0;
  const from = active ? solves.length - active : 0;
  const times = all.times.slice(from);
  const avgs = all.avgs.map((a) => a.slice(from));
  const shown = SERIES.map((s, k) => ({ ...s, values: avgs[k] })).filter((s) => s.values.some((v) => typeof v === 'number'));
  const ok = times.filter((t): t is number => t !== null);
  const axis = timeAxis(ok);

  const n = times.length;
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (ms: number) => PAD.top + plotH * (1 - (Math.min(ms, axis.max) - axis.min) / (axis.max - axis.min));
  const path = (vals: (number | null | undefined)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (typeof v !== 'number') { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const xTicks = useMemo(() => {
    if (n < 2) return [0];
    const step = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => n / s <= 6) ?? 2000;
    const out: number[] = [];
    for (let k = Math.ceil((from + 1) / step) * step; k <= from + n; k += step) out.push(k - from - 1);
    return out;
  }, [n, from]);

  // Direct labels at each line's last point, pushed apart vertically so they never overlap.
  const endLabels = shown.flatMap((s) => {
    const v = s.values[s.values.length - 1];
    return typeof v === 'number' ? [{ label: s.label, x: x(s.values.length - 1) + 6, y: y(v) }] : [];
  }).sort((a, b) => a.y - b.y);
  for (let k = 1; k < endLabels.length; k++) endLabels[k].y = Math.max(endLabels[k].y, endLabels[k - 1].y + 12);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    setHover(n > 1 ? Math.max(0, Math.min(n - 1, Math.round(((px - PAD.left) / plotW) * (n - 1)))) : 0);
  };
  const dnfs = times.length - ok.length;
  const h = hover !== null && hover < n ? hover : null;
  const hs = h !== null ? solves[from + h] : null;

  return (
    <div className="progress-chart" data-n={n}>
      <div className="row spread">
        <div className="seg-control small" role="group" aria-label="Range">
          {RANGES.filter((r) => r === 0 || r < solves.length).map((r) => (
            <button key={r} className={active === r ? 'active' : ''} onClick={() => setRange(r)}>{r ? `last ${r}` : 'all'}</button>
          ))}
        </div>
        <div className="chart-legend small" aria-label="Legend">
          <span><i className="key dot" /> solve</span>
          {shown.map((s) => <span key={s.label}><i className="key line" style={{ background: s.color }} /> {s.label} <b>{formatTime(best(s.values))}</b> best</span>)}
        </div>
      </div>
      <div className="chart-box" ref={boxRef}>
        <svg width={width} height={H} role="img" aria-label={`Solve times, last ${n} solves, with running averages`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {axis.ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">{t / 1000} s</text>
            </g>
          ))}
          {xTicks.map((i) => <text key={i} className="tick" x={x(i)} y={H - 8} textAnchor="middle">{from + i + 1}</text>)}
          {times.map((t, i) => t === null ? null : t > axis.max
            ? <path key={i} className="solve-dot over" d={`M${x(i) - 4},${PAD.top + 5}L${x(i)},${PAD.top - 1}L${x(i) + 4},${PAD.top + 5}Z`} />
            : <circle key={i} className="solve-dot" cx={x(i)} cy={y(t)} r={n > 300 ? 1.5 : 2.5} />)}
          {shown.map((s) => <path key={s.label} className="avg-line" d={path(s.values)} stroke={s.color} />)}
          {endLabels.map((l) => <text key={l.label} className="line-label" x={l.x} y={l.y + 4}>{l.label}</text>)}
          {h !== null && <line className="crosshair" x1={x(h)} x2={x(h)} y1={PAD.top} y2={H - PAD.bottom} />}
          {h !== null && shown.map((s) => {
            const v = s.values[h];
            return typeof v === 'number' ? <circle key={s.label} className="hover-dot" cx={x(h)} cy={y(v)} r={4} fill={s.color} /> : null;
          })}
        </svg>
        {h !== null && hs && (
          <div className="chart-tip" style={{ left: Math.min(x(h) + 10, width - 170), top: PAD.top }} data-testid="chart-tip">
            <div className="muted small">Solve {from + h + 1} · {new Date(hs.date).toLocaleDateString()}</div>
            <div><b>{formatTime(times[h])}</b>{hs.penalty === '+2' ? ' (+2)' : ''}</div>
            {shown.map((s) => typeof s.values[h] !== 'undefined' && (
              <div key={s.label} className="small"><i className="key line" style={{ background: s.color }} /> {s.label} {formatTime(s.values[h])}</div>
            ))}
          </div>
        )}
      </div>
      {dnfs > 0 && <p className="muted small">{dnfs} DNF{dnfs === 1 ? '' : 's'} not drawn (they still count in the averages).</p>}
    </div>
  );
}
