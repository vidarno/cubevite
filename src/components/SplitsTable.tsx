import type { LLStep } from '../cube/cfop';
import { stepLabel } from '../cube/algId';
import { formatTime, type Solve } from '../state/data';

const FACE_COLOR: Record<string, string> = { U: 'White', D: 'Yellow', F: 'Green', B: 'Blue', R: 'Red', L: 'Orange' };

export function splitRows(solve: Solve) {
  const sp = solve.splits;
  if (!sp || sp.cross === null) return [];
  const rows: { label: string; dur: number; at: number; moves?: number; extra?: string; cls?: string }[] = [];
  /** 2-look sub-steps of one stage (OLL or PLL) as rows; false when that stage was 1-look or skipped. */
  const subRows = (stage: 'OLL' | 'PLL') => {
    const subs = (sp.llSteps ?? []).filter((s: LLStep) => s.kind.startsWith(stage === 'OLL' ? 'OLL ' : 'PLL ') || (stage === 'OLL' && s.kind === 'OCLL'));
    if (subs.length < 2) return false;
    for (const s of subs) {
      rows.push({ label: s.kind, dur: s.end - s.start, at: s.end, moves: s.endMove - s.startMove, extra: stepLabel(s), cls: stage.toLowerCase() });
    }
    return true;
  };
  /** Label of a 1-look step (identified alg), falling back to the stored case. */
  const oneLook = (kind: 'OLL' | 'PLL', fallback: string | null) => {
    const st = sp.llSteps?.find((s) => s.kind === kind);
    return st ? stepLabel(st) : fallback ?? undefined;
  };
  const mc = sp.moveCounts;
  rows.push({ label: `Cross (${FACE_COLOR[sp.crossFace!] ?? sp.crossFace})`, dur: sp.cross, at: sp.cross, moves: mc.cross ?? undefined });
  let prev = sp.cross;
  sp.pairs.forEach((t, i) => {
    rows.push({ label: `Pair ${i + 1}`, dur: t - prev, at: t });
    prev = t;
  });
  if (sp.oll !== null && !subRows('OLL')) {
    rows.push({ label: 'OLL', dur: sp.oll - prev, at: sp.oll, moves: mc.oll !== null && mc.f2l !== null ? mc.oll - mc.f2l : undefined, extra: oneLook('OLL', sp.ollCase) });
  }
  if (sp.oll !== null) prev = sp.oll;
  if (sp.pll !== null && !subRows('PLL')) {
    rows.push({ label: 'PLL', dur: sp.pll - prev, at: sp.pll, moves: mc.pll !== null && mc.oll !== null ? mc.pll - mc.oll : undefined, extra: oneLook('PLL', sp.pllCase) });
  }
  return rows;
}

export function SplitsTable({ solve, compact }: { solve: Solve; compact?: boolean }) {
  const rows = splitRows(solve);
  if (!rows.length) return null;
  const total = solve.time ?? 1;
  return (
    <div className={`splits ${compact ? 'compact' : ''}`}>
      <div className="split-bar">
        {rows.map((r) => (
          <div key={r.label} className={`seg seg-${r.cls ?? r.label.split(' ')[0].toLowerCase()}`} style={{ flexGrow: Math.max(r.dur, 1) / total }} title={`${r.label}: ${formatTime(r.dur)}`} />
        ))}
      </div>
      <table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{formatTime(r.dur)}</td>
              {!compact && <td className="num muted">{formatTime(r.at)}</td>}
              <td className="muted">{r.extra ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
