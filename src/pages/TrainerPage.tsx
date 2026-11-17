import { useMemo, useState } from 'react';
import { DRILLS, recentAvg, type DrillCase } from '../cube/drills';
import { drillById, learningDrill, weakestDrill } from '../cube/learningPath';
import { useCube } from '../state/cubeStore';
import { caseStatsStore, crossLogStore, formatTime, learnStore, trainerExcluded, settingsStore, srsStore, trainerDrillStore, trainerSelection, weakestStore } from '../state/data';
import { dueIn, dueIds } from '../cube/srs';
import { usePersisted } from '../state/storage';
import type { CrossAttempt } from '../state/data';
import { LLDiagram } from '../components/LLDiagram';
import { DrillRunner } from '../components/DrillRunner';

export function TrainerPage() {
  const cube = useCube();
  const smart = cube.status === 'connected';
  const [drillId, setDrillId] = usePersisted(trainerDrillStore);
  const [selection, setSelection] = usePersisted(trainerSelection);
  const [excluded, setExcluded] = usePersisted(trainerExcluded);
  const [stats] = usePersisted(caseStatsStore);
  const [learn] = usePersisted(learnStore);
  // The learning drill depends on the learn status; rebuild it only when its case list changes.
  const learningIds = Object.keys(learn).filter((id) => learn[id] === 'learning').sort().join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const learning = useMemo(() => learningDrill(learn), [learningIds]);
  const [weakestIds] = usePersisted(weakestStore);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weakest = useMemo(() => weakestDrill(weakestIds), [weakestIds.join('|')]);
  const drills = useMemo(() => [learning, ...(weakest.cases.length ? [weakest] : []), ...DRILLS], [learning, weakest]);
  const drill = drillId === learning.id ? learning : drillId === weakest.id ? weakest : drillById(drillId, learn) ?? DRILLS[0];
  const [settings, setSettings] = usePersisted(settingsStore);
  const arrows = settings.pllArrows ?? true;
  const [running, setRunning] = useState(false);
  const [crossLog] = usePersisted(crossLogStore);

  // No stored selection yet (new drill): all cases.
  const chosen = useMemo(
    () => (drill.dynamicCases
      ? drill.cases.map((c) => c.id).filter((id) => !(excluded[drill.id] ?? []).includes(id))
      : selection[drill.id] ?? drill.defaultCases ?? drill.cases.map((c) => c.id)),
    [selection, excluded, drill],
  );
  const groups = useMemo(() => [...new Set(drills.map((d) => d.group))], [drills]);
  const pool = useMemo(() => drill.cases.filter((c) => chosen.includes(c.id)), [drill, chosen]);
  const hasCases = drill.cases.length > 0;
  const [srs] = usePersisted(srsStore);
  const srsOn = settings.srs ?? true;
  /** Spaced repetition applies to case drills (not cross levels). */
  const reviews = hasCases && drill.kind !== 'cross';
  // Re-read the clock when the deck changes or a run ends (due times move on in between, which is fine).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [srs, running]);
  const nDue = reviews ? dueIds(pool.map((c) => c.id), srs, now).length : 0;

  const toggle = (id: string) => drill.dynamicCases
    ? setExcluded((e) => {
      const cur = e[drill.id] ?? [];
      return { ...e, [drill.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    })
    : setSelection((s) => {
      const cur = s[drill.id] ?? drill.defaultCases ?? drill.cases.map((c) => c.id);
      return { ...s, [drill.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  const selectWhere = (pred: (c: DrillCase) => boolean) => drill.dynamicCases
    ? setExcluded((e) => ({ ...e, [drill.id]: drill.cases.filter((c) => !pred(c)).map((c) => c.id) }))
    : setSelection((s) => ({ ...s, [drill.id]: drill.cases.filter(pred).map((c) => c.id) }));

  return (
    <div className="trainer-page">
      <aside className="case-picker">
        {groups.map((g) => (
          <div key={g} className="drill-group">
            <div className="muted small">{g}</div>
            <div className="seg-control">
              {drills.filter((d) => d.group === g).map((d) => (
                <button key={d.id} className={d.id === drill.id ? 'active' : ''} onClick={() => { setDrillId(d.id); setRunning(false); }}>{d.label}</button>
              ))}
            </div>
          </div>
        ))}
        {hasCases && (
          <>
            <div className="quick-select">
              <button className="ghost small" onClick={() => selectWhere(() => true)}>All</button>
              {drill.kind !== 'cross' && !drill.dynamicCases && (
                <button className="ghost small" onClick={() => selectWhere((c) => learn[c.id] === 'learning')}>Learning</button>
              )}
              <button className="ghost small" onClick={() => selectWhere(() => false)}>None</button>
              {reviews && (
                <label className="toggle small" title="Spaced repetition: cases you're due to review come first (missed ones right away, known ones after hours or days)">
                  <input type="checkbox" checked={srsOn} onChange={(e) => setSettings((s) => ({ ...s, srs: e.target.checked }))} />
                  Due first
                </label>
              )}
              {drill.cases.some((c) => c.diagram?.mode === 'PLL' || c.diagram?.mode === 'CP') && (
                <label className="toggle small">
                  <input type="checkbox" checked={arrows} onChange={(e) => setSettings((s) => ({ ...s, pllArrows: e.target.checked }))} />
                  Arrows
                </label>
              )}
            </div>
            <div className="case-grid">
              {drill.cases.map((cs) => {
                const a = recentAvg(stats[cs.id]?.times ?? []);
                const card = srs[cs.id];
                const due = reviews && srsOn && card && card.due <= now;
                return (
                  <button key={cs.id} className={`case-tile ${chosen.includes(cs.id) ? 'selected' : ''} ${due ? 'due' : ''}`} onClick={() => toggle(cs.id)}
                    title={reviews && card ? `Review ${dueIn(card, now) === 'now' ? 'due now' : `in ${dueIn(card, now)}`} (box ${card.box})` : undefined}>
                    {cs.diagram && <LLDiagram state={cs.diagram.state} mode={cs.diagram.mode} size={56} arrows={arrows} />}
                    <span className="case-name">{cs.label}</span>
                    {a !== null && <span className="case-time">{formatTime(a)}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </aside>

      <section className="trainer-main">
        {running ? (
          <DrillRunner key={drill.id} drill={drill} pool={pool} onStop={() => setRunning(false)} />
        ) : (
          <div className="trainer-intro">
            <h2>{drill.label} trainer</h2>
            <p className="muted">{drill.description}</p>
            {drill.dynamicCases && !hasCases && (
              <p className="muted">No cases marked "learning" yet: mark some on the Algorithms page (Learning path).</p>
            )}
            {drill.kind === 'cross' && <CrossSummary log={crossLog} />}
            <p className="muted">
              {hasCases ? (drill.kind === 'cross' ? 'Pick the levels on the left, then start. '
                : drill.dynamicCases ? 'Click a case on the left to leave it out (cases added later start selected). '
                : 'Pick the cases to drill on the left, then start. ') : ''}
              {drill.kind === 'cross' ? (smart
                ? 'The app gives you a scramble (from whatever state your cube is in). Inspect, then solve the white cross: the timer starts on your first turn and stops when the cross is solved. Mode and inspection limit are in the drill header.'
                : 'The cross drill needs a smart cube (or the virtual cube) to set up and check the scramble.')
              : smart
                ? 'The app gives you a setup sequence (disguised, from whatever state your cube is in). Once set up, the timer starts on your first turn and stops as soon as the case is solved.'
                : 'No smart cube connected: flashcard mode. Recognise the case, press space to reveal the algorithm, space again for the next one.'}
            </p>
            {reviews && srsOn && pool.length > 0 && (
              <p className="muted" data-testid="srs-due">
                {nDue ? `${nDue} of ${pool.length} selected case${pool.length === 1 ? '' : 's'} due for review (new and missed ones included); they come first.`
                  : 'Nothing due for review: cases come up weighted by your times.'}
              </p>
            )}
            <button className="primary big" disabled={(hasCases || drill.dynamicCases) && !pool.length} onClick={() => setRunning(true)}>
              {hasCases ? `Start (${pool.length} ${drill.kind === 'cross' ? 'level' : 'case'}${pool.length === 1 ? '' : 's'})` : 'Start'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/** Last 12 cross attempts: moves over optimal and plan / solve times. */
function CrossSummary({ log }: { log: CrossAttempt[] }) {
  const last = log.filter((a) => !a.redo).slice(-12);
  if (!last.length) return null;
  const solved = last.filter((a) => a.moves !== null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const extra = mean(solved.map((a) => a.moves! - a.optimal));
  const optimalShare = solved.length ? solved.filter((a) => a.moves === a.optimal).length / solved.length : null;
  return (
    <div className="cross-summary" data-testid="cross-summary">
      <div><span className="stat-l">Last {last.length}</span></div>
      {extra !== null && <div><span className="stat-l">Over optimal</span> +{extra.toFixed(1)} moves</div>}
      {optimalShare !== null && <div><span className="stat-l">Optimal</span> {Math.round(optimalShare * 100)}%</div>}
      <div><span className="stat-l">Plan</span> {formatTime(mean(last.map((a) => a.planMs)), 1)}</div>
      {solved.length > 0 && <div><span className="stat-l">Solve</span> {formatTime(mean(solved.map((a) => a.execMs!)))}</div>}
    </div>
  );
}
