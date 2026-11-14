import { useMemo } from 'react';
import type { CrossReport } from '../cube/crossDrill';
import { faceMapFor, mapMove } from '../cube/display';
import { tokenize } from '../cube/facelets';
import { formatTime, settingsStore } from '../state/data';
import { usePersisted } from '../state/storage';

/** Cross drill result: your moves vs optimal and the optimal solutions, in the frame the cube is held. */
export function CrossResult({ report, planMs, execMs }: { report: CrossReport; planMs: number | null; execMs: number | null }) {
  const [settings] = usePersisted(settingsStore);
  const yellowTop = settings.yellowTop ?? true;
  const frame = useMemo(() => faceMapFor(yellowTop ? 'z2' : ''), [yellowTop]);
  const show = (alg: string) => tokenize(alg).map((m) => mapMove(m, frame)).join(' ');
  const executed = execMs !== null;
  const extra = report.yourMoves - report.optimal;
  return (
    <div className="cross-result" data-optimal={report.optimal} data-moves={executed ? report.yourMoves : undefined}>
      <div className="cross-stats">
        {planMs !== null && <div><span className="stat-l">Plan</span> {formatTime(planMs, 1)}</div>}
        {executed && <div><span className="stat-l">Solve</span> {formatTime(execMs)}</div>}
        {executed && (
          <div>
            <span className="stat-l">Moves</span> {report.yourMoves}{' '}
            <span className={extra > 0 ? 'warn' : 'ok'}>{extra > 0 ? `(+${extra})` : '(optimal)'}</span>
          </div>
        )}
        <div><span className="stat-l">Optimal</span> {report.optimal}</div>
      </div>
      {executed && report.yourAlg && <div className="small"><span className="muted">You:</span> <span className="alg mono">{show(report.yourAlg)}</span></div>}
      <div className="small muted">Optimal solution{report.solutions.length > 1 ? 's' : ''} ({yellowTop ? 'yellow on top' : 'white on top'}, green in front):</div>
      <ul className="cross-solutions">
        {report.solutions.map((s) => <li key={s} className="alg mono">{show(s) || '(already solved)'}</li>)}
      </ul>
    </div>
  );
}
