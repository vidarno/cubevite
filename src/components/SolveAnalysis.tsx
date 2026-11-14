import type { MouseEvent } from 'react';
import { moveNearest, type CrossAnalysis, type SolveAnalysis } from '../cube/analysis';
import type { F2LPairAnalysis } from '../cube/f2lAnalysis';
import { openTrainer } from '../state/nav';
import { pauseTotals } from '../cube/pauses';
import { formatTime, type Solve } from '../state/data';

const pct = (t: number, total: number) => `${(100 * Math.max(0, Math.min(t, total))) / total}%`;
const s1 = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Short card under the timer after a smart solve: algs used, pauses, errors, biggest loss. */
export function AnalysisSummary({ analysis, onOpen, onRedo }: {
  analysis: SolveAnalysis; onOpen: () => void; onRedo?: (withCross: boolean) => void;
}) {
  const a = analysis;
  const tot = pauseTotals(a.pauses);
  const pauseParts = Object.entries(tot).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${s1(v)}`).join(', ');
  return (
    <div className="analysis-card small">
      <div data-testid="cross-line">
        <span className="muted">Cross</span> {a.cross.colour} · {a.cross.moves} moves{' '}
        {a.cross.moves > a.cross.optimal
          ? <span className="muted">(optimal {a.cross.optimal}: <span className="mono">{a.cross.solutions[0]}</span>)</span>
          : <span className="ok">(optimal)</span>}
      </div>
      {a.f2l.length > 0 && (
        <div data-testid="f2l-line">
          <span className="muted">F2L</span> {a.f2l.filter((p) => p.slots.length).map((p) => (p.caseId ? p.caseId.replace('F2L ', '#') : 'stuck')).join(' · ')}
          {(() => {
            const known = a.f2l.filter((p) => p.dbMoves !== null);
            const yours = known.reduce((n, p) => n + p.yourMoves, 0), db = known.reduce((n, p) => n + p.dbMoves!, 0);
            return known.length ? <span className="muted"> · {yours} moves (algs {db})</span> : null;
          })()}
        </div>
      )}
      {a.algs.length > 0 && (
        <div><span className="muted">Algs</span> {a.algs.map((x) => x.label).join(' → ')}</div>
      )}
      <div>
        <span className="muted">Pauses</span>{' '}
        {a.pauses.length ? <>{a.pauses.length} · {s1(a.pauseMs)} <span className="muted">({pauseParts})</span></> : 'none'}
      </div>
      <div>
        <span className="muted">Errors</span>{' '}
        {a.errors.length ? <>{a.errors.length} · {a.wastedMoves} moves wasted <span className="muted">({s1(a.wastedMs)})</span></> : 'none'}
      </div>
      {a.biggestLoss && (
        <div className="loss"><span className="muted">Biggest loss</span> <b>{s1(a.biggestLoss.ms)}</b> {a.biggestLoss.label}</div>
      )}
      <div className="row card-actions">
        <button className="link" onClick={onOpen}>Full analysis</button>
        {onRedo && <button className="link" onClick={() => onRedo(false)}>Redo</button>}
        {onRedo && <button className="link" onClick={() => onRedo(true)}>Redo with optimal cross</button>}
      </div>
    </div>
  );
}

/** Solve detail: your cross vs the optimal ones for this scramble (cross held on the bottom). */
export function CrossSection({ cross, onJump, endMove }: { cross: CrossAnalysis; onJump: (n: number) => void; endMove: number }) {
  const extra = cross.moves - cross.optimal;
  return (
    <div className="cross-section" data-optimal={cross.optimal} data-moves={cross.moves}>
      <div className="small"><b>Cross</b> <span className="muted">({cross.colour} on the bottom, {cross.front} in front)</span></div>
      <div className="small">
        <button className="link" onClick={() => onJump(endMove)}>Yours: {cross.moves} moves</button>{' '}
        <span className={extra > 0 ? 'warn' : 'ok'}>{extra > 0 ? `+${extra} over optimal` : 'optimal'}</span>
        {cross.yourAlg && <span className="mono"> {cross.yourAlg}</span>}
      </div>
      <div className="small muted">Optimal ({cross.optimal}):</div>
      <ul className="cross-solutions small">
        {cross.solutions.map((sol) => <li key={sol} className="mono">{sol || '(solved at the start)'}</li>)}
      </ul>
    </div>
  );
}

/** Slot names as a cuber says them (cross on the bottom). */
const SLOT_LABEL: Record<string, string> = { RF: 'FR', FL: 'FL', LB: 'BL', BR: 'BR' };

/** Solve detail: each F2L pair's slot and case, your moves vs the database alg, pair-order hints. */
export function F2LSection({ pairs, onJump }: { pairs: F2LPairAnalysis[]; onJump: (n: number) => void }) {
  const shown = pairs.filter((p) => p.slots.length);
  if (!shown.length) return null;
  return (
    <div className="f2l-section" data-testid="f2l-section">
      <div className="small"><b>F2L</b> <span className="muted">(cross on the bottom; algs from the F2L trainer)</span></div>
      <table className="f2l-pairs small">
        <thead><tr><th>Pair</th><th>Slot</th><th>Case</th><th>Yours</th><th>Alg</th></tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.pair} data-case={p.caseId ?? ''} data-used={p.usedAlg ?? ''}>
              <td><button className="link" onClick={() => onJump(p.startMove)}>{p.pair}</button></td>
              <td>{p.slots.map((x) => SLOT_LABEL[x]).join(' + ')}</td>
              <td>
                {p.caseId
                  ? <button className="link" title="Drill this case" onClick={() => openTrainer('F2L', [p.caseId!])}>{p.caseId}</button>
                  : <span className="muted">stuck piece</span>}
              </td>
              <td>
                <span className={p.dbMoves !== null && p.yourMoves > p.dbMoves + 2 ? 'warn' : ''}>{p.yourMoves}</span>
                {p.usedAlg && <span className="ok"> ✓ {p.usedAlg === 'alt' ? 'alt alg' : 'alg'}</span>}
                <span className="mono muted"> {p.yourAlg}</span>
              </td>
              <td>
                {p.dbAlg ? <><span>{p.dbMoves}</span> <span className="mono muted">{p.dbAlg}</span></> : '—'}
                {p.better && (
                  <div className="warn">shorter first: {p.better.caseId} in {SLOT_LABEL[p.better.slot]} ({p.better.moves} moves)</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Pick a tick step (s) giving at most ~10 ticks. */
function tickStep(totalMs: number) {
  const s = totalMs / 1000;
  return [1, 2, 5, 10, 15, 30, 60].find((x) => s / x <= 10) ?? 120;
}

/**
 * Moves on a time axis, coloured by stage, with pauses (hatched) and errors (bars below).
 * `cursor` = number of moves the replay is at; `onJump(n)` = show the state after n moves.
 */
export function SolveTimeline({ solve, analysis, cursor, onJump }: {
  solve: Solve; analysis: SolveAnalysis; cursor: number | null; onJump: (n: number) => void;
}) {
  const moves = solve.moves!;
  const total = Math.max(moves[moves.length - 1].t, 1);
  const tAt = (n: number) => (n > 0 ? moves[n - 1].t : 0);
  const step = tickStep(total);
  const ticks = Array.from({ length: Math.floor(total / 1000 / step) + 1 }, (_, i) => i * step);

  const clickTrack = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * total;
    onJump(t < moves[0].t / 2 ? 0 : moveNearest(moves, t) + 1);
  };
  const jump = (n: number) => (e: MouseEvent) => { e.stopPropagation(); onJump(n); };

  return (
    <div className="timeline">
      <div className="tl-bands">
        {analysis.bands.map((b) => (
          <div
            key={b.startMove}
            className={`tl-band tl-${b.coarse.toLowerCase()}`}
            style={{ left: pct(b.start, total), width: pct(b.end - b.start, total) }}
            title={`${b.stage}: ${formatTime(b.end - b.start)}, ${b.endMove - b.startMove} moves`}
            onClick={jump(b.startMove)}
          >
            {(b.end - b.start) / total > 0.07 ? b.stage : ''}
          </div>
        ))}
      </div>
      <div className="tl-track" onClick={clickTrack}>
        {analysis.pauses.map((p) => (
          <div
            key={`p${p.at}`}
            className={`tl-pause tl-pause-${p.kind}`}
            style={{ left: pct(p.start, total), width: pct(p.duration, total) }}
            title={`${formatTime(p.duration)} pause`}
            onClick={jump(p.at)}
          />
        ))}
        {moves.map((m, i) => (
          <div
            key={i}
            className={`tl-move tl-${analysis.bands.find((b) => i < b.endMove)!.coarse.toLowerCase()}`}
            style={{ left: pct(m.t, total) }}
            title={`${m.move} at ${formatTime(m.t)}`}
          />
        ))}
        {cursor !== null && <div className="tl-cursor" style={{ left: pct(tAt(cursor), total) }} />}
      </div>
      <div className="tl-errors">
        {analysis.errors.map((e) => (
          <div
            key={`e${e.kind}${e.start}`}
            className="tl-error"
            style={{ left: pct(tAt(e.start), total), width: `max(4px, ${pct(tAt(e.end) - tAt(e.start), total)})` }}
            title={`${e.stage}: ${e.kind}, ${e.moves} moves`}
            onClick={jump(e.start)}
          />
        ))}
      </div>
      <div className="tl-axis">
        {ticks.map((s) => (
          <span key={s} style={{ left: pct(s * 1000, total) }}>{s}s</span>
        ))}
      </div>
    </div>
  );
}
