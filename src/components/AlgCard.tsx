/** One algorithm case: diagram, alg (+ alternatives), stats and learn-status pills. */
import type { CaseDiagram } from '../cube/drills';
import { recentAvg } from '../cube/drills';
import { withoutRotations } from '../cube/faceTurns';
import { useCube } from '../state/cubeStore';
import { caseStatsStore, formatTime, learnStore, loopStatsStore, settingsStore, type LearnStatus } from '../state/data';
import { openLoop } from '../state/loop';
import { usePersisted } from '../state/storage';
import { LLDiagram } from './LLDiagram';

const STATUSES: LearnStatus[] = ['new', 'learning', 'learned'];

export function AlgCard({ id, title, alg, alts, diagram, arrows, suggested }: {
  id: string; title: string; alg: string; alts?: string[]; diagram: CaseDiagram; arrows: boolean;
  /** Fast enough in the trainer to be marked learned. */
  suggested?: boolean;
}) {
  const [learn, setLearn] = usePersisted(learnStore);
  const [stats] = usePersisted(caseStatsStore);
  const [loopStats] = usePersisted(loopStatsStore);
  const [settings] = usePersisted(settingsStore);
  const text = (a: string) => (settings.noRotations ? withoutRotations(a) : a);
  const smart = useCube().status === 'connected';
  const ls = loopStats[id];
  const st = stats[id];
  const status = learn[id] ?? 'new';
  const avg = recentAvg(st?.times ?? []);
  return (
    <div className={`alg-card status-${status}`} data-case={id}>
      <LLDiagram state={diagram.state} mode={diagram.mode} size={88} arrows={arrows} />
      <div className="alg-card-body">
        <div className="row spread">
          <b>{title}</b>
          {st?.times.length ? (
            <span className="muted small" title="Mean of the last 5 trainer times · best · attempts">
              {formatTime(avg)} avg · {formatTime(Math.min(...st.times))} best · {st.attempts}×
            </span>
          ) : null}
        </div>
        <div className="mono alg">{text(alg)}</div>
        {alts?.map((a) => <div key={a} className="mono small muted">{text(a)}</div>)}
        {ls?.reps ? (
          <div className="muted small" title="Alg loop: mean of the last 5 clean reps · best rep · reps">
            loop: {formatTime(recentAvg(ls.times))} avg · {formatTime(ls.best)} best · {ls.reps} reps
          </div>
        ) : null}
        <div className="status-pills">
          {STATUSES.map((s) => (
            <button key={s} className={`pill ${s === status ? 'on' : ''}`} onClick={() => setLearn((l) => ({ ...l, [id]: s }))}>{s}</button>
          ))}
          {alg && (
            <button className="pill loop-btn" disabled={!smart} title={smart ? 'Repeat this alg back-to-back, no setup' : 'Connect a smart cube (or the virtual cube) to loop'}
              onClick={() => openLoop({ id, title, algs: [alg, ...(alts ?? [])], diagram })}>loop</button>
          )}
          {suggested && <span className="pill suggest" title="Mean of the last 5 times is under the stage target">fast enough: learned?</span>}
        </div>
      </div>
    </div>
  );
}
