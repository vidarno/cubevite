import { useMemo } from 'react';
import { solveInsights, weakestCaseIds } from '../cube/insights';
import { WEAKEST_DRILL_ID } from '../cube/learningPath';
import { countedSolves, formatTime, solvesStore, weakestStore } from '../state/data';
import { openTrainer } from '../state/nav';
import { usePersisted } from '../state/storage';

const WEAKEST_N = 5;
const LIMIT = 100;

export function InsightsPage() {
  const [solves] = usePersisted(solvesStore);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ins = useMemo(() => solveInsights(countedSolves(solves), LIMIT), [solves.length, solves[solves.length - 1]?.id]);
  const weakest = weakestCaseIds(ins, WEAKEST_N);

  const trainWeakest = () => {
    weakestStore.set(weakest);
    openTrainer(WEAKEST_DRILL_ID);
  };

  if (!ins.n) {
    return (
      <div className="insights-page">
        <section className="panel">
          <h2>Insights</h2>
          <p className="muted">No smart-cube solves yet. Solve with your GAN cube (or the virtual cube) on the Timer page and
            the analysis of each solve is collected here: stage averages, per-case recognition and execution, frequent errors.</p>
        </section>
      </div>
    );
  }

  const pause = ins.pausePerSolve;
  return (
    <div className="insights-page">
      <section className="panel">
        <div className="row spread">
          <h2>Insights</h2>
          <button className="primary" disabled={!weakest.length} onClick={trainWeakest}>
            Train my weakest ({weakest.length})
          </button>
        </div>
        <p className="muted small">
          From your last {ins.n} smart solve{ins.n === 1 ? '' : 's'}{solves.length > LIMIT ? ` (of ${solves.length})` : ''}.
          {weakest.length > 0 && <> Weakest: {weakest.map((id) => ins.cases.find((c) => c.caseId === id)!.name).join(', ')}.</>}
        </p>
      </section>

      <section className="panel">
        <h3>Stage averages</h3>
        <table className="insights-table stages">
          <thead><tr><th>Stage</th><th className="num">last 12</th><th className="num">all</th></tr></thead>
          <tbody>
            {ins.stages.map((s) => (
              <tr key={s.stage}><td>{s.stage}</td><td className="num">{formatTime(s.last12)}</td><td className="num">{formatTime(s.all)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          Trimmed means (best and worst dropped from 5 solves on). LL recognition = time from the start of each last-layer step
          to the first move of its alg (pre-AUF included). Per solve: pauses {formatTime(pause.recognition)} recognition,
          {' '}{formatTime(pause.lookahead)} lookahead, {formatTime(pause['mid-alg'])} mid-algorithm; {ins.wastePerSolve.moves.toFixed(1)} moves
          {' '}({formatTime(ins.wastePerSolve.ms)}) wasted.
        </p>
      </section>

      <section className="panel">
        <h3>Last-layer cases</h3>
        {ins.cases.length ? (
          <table className="insights-table cases">
            <thead>
              <tr><th>Case</th><th>Step</th><th className="num">seen</th><th className="num">recog.</th><th className="num">exec.</th><th className="num">total</th><th className="num">mid-alg pauses</th><th /></tr>
            </thead>
            <tbody>
              {ins.cases.map((c) => (
                <tr key={c.caseId} className={weakest.includes(c.caseId) ? 'weak' : ''}>
                  <td>{c.name}</td>
                  <td className="muted">{c.kinds.join(', ')}</td>
                  <td className="num">{c.count}</td>
                  <td className="num">{formatTime(c.recognition)}</td>
                  <td className="num">{formatTime(c.execution)}</td>
                  <td className="num"><b>{formatTime(c.total)}</b></td>
                  <td className="num">{c.midAlgRate ? `${Math.round(c.midAlgRate * 100)}%` : ''}</td>
                  <td><button className="link" onClick={() => openTrainer(c.drillId, [c.caseId])}>drill</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted small">No last-layer cases recognised yet (all skips?).</p>}
        <p className="muted small">Sorted weakest first: total time compared with other cases of the same step, plus mid-algorithm pauses.</p>
      </section>

      <section className="panel">
        <h3>Most frequent errors</h3>
        {ins.errors.length ? (
          <table className="insights-table errors">
            <thead><tr><th>Error</th><th>Stage</th><th className="num">count</th><th className="num">solves</th><th className="num">moves</th><th className="num">time lost</th></tr></thead>
            <tbody>
              {ins.errors.map((e) => (
                <tr key={`${e.kind}|${e.stage}`}>
                  <td>{e.kind}</td><td className="muted">{e.stage}</td><td className="num">{e.count}</td>
                  <td className="num">{e.solves}/{ins.n}</td><td className="num">{e.moves}</td><td className="num">{formatTime(e.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted small">No errors or wasted moves.</p>}
      </section>
    </div>
  );
}
