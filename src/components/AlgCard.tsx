/** One algorithm case: diagram, algs (preferred first; pick another or add your own), stats and learn-status pills. */
import type { CaseDiagram } from '../cube/drills';
import { recentAvg } from '../cube/drills';
import { withoutRotations } from '../cube/faceTurns';
import { useCube } from '../state/cubeStore';
import { useState } from 'react';
import { caseKind, validateCaseAlg } from '../cube/algValidate';
import { caseAlgList, customAlgs, withCustom, withoutCustom, withPreferred } from '../cube/preferred';
import { algPrefsStore, caseStatsStore, formatTime, learnStore, loopStatsStore, recogStatsStore, settingsStore, srsStore, type LearnStatus } from '../state/data';
import { dueIn } from '../cube/srs';
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
  const [srs] = usePersisted(srsStore);
  const [recog] = usePersisted(recogStatsStore);
  const rs = recog[id];
  const card = srs[id];
  const [openedAt] = useState(() => Date.now());
  const due = card ? dueIn(card, Math.max(openedAt, card.last)) : '';
  const [settings] = usePersisted(settingsStore);
  const text = (a: string) => (settings.noRotations ? withoutRotations(a) : a);
  const smart = useCube().status === 'connected';
  const ls = loopStats[id];
  const st = stats[id];
  const status = learn[id] ?? 'new';
  const avg = recentAvg(st?.times ?? []);
  const [prefs, setPrefs] = usePersisted(algPrefsStore);
  const list = caseAlgList({ id, alg, alts }, prefs);
  const own = customAlgs(id, prefs);
  const canOwn = caseKind(id) !== null;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const r = validateCaseAlg({ id, alg }, draft);
    if (!r.ok) { setError(r.error); return; }
    setPrefs((p) => ([alg, ...(alts ?? [])].includes(r.alg) ? withPreferred(p, id, r.alg, alg) : withCustom(p, id, r.alg)));
    setAdding(false);
  };
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
        {list.map((a, k) => (
          <div key={a} className={`alg-line ${k === 0 ? 'first' : ''}`} data-alg={a}>
            <span className={k === 0 ? 'mono alg' : 'mono small muted'}>{text(a)}</span>
            {(k === 0 ? list.length > 1 || own.includes(a) : true) && (
              <span className="alg-tags small muted">
                {k === 0 && list.length > 1 && <span title="Shown, followed and looped first">{a === alg ? 'main' : 'your pick'}</span>}
                {own.includes(a) && <span>own</span>}
                {k > 0 && <button className="link-btn" title="Show, follow and loop this alg first"
                  onClick={() => setPrefs((p) => withPreferred(p, id, a, alg))}>use</button>}
                {own.includes(a) && <button className="link-btn" title="Remove this alg" aria-label="Remove own alg"
                  onClick={() => setPrefs((p) => withoutCustom(p, id, a))}>×</button>}
              </span>
            )}
          </div>
        ))}
        {adding && (
          <form className="own-alg" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <input type="text" className="mono" autoFocus value={draft} placeholder="Your alg, e.g. R U R' U'" aria-label="Own alg"
              onChange={(e) => { setDraft(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setError(null); } }} />
            <button type="submit" className="small">Save</button>
            <button type="button" className="ghost small" onClick={() => { setAdding(false); setError(null); }}>Cancel</button>
            {error && <div className="error small" role="alert">{error}</div>}
          </form>
        )}
        {rs?.attempts ? (
          <div className="muted small" title="Recognition-only trainer: mean of the last 5 recognised · recognised / attempts">
            recognition: {formatTime(recentAvg(rs.times))} avg · {rs.attempts - rs.misses}/{rs.attempts}
          </div>
        ) : null}
        {card && (
          <div className="muted small" data-testid="srs" title="Spaced repetition: when the trainer brings this case up again">
            review {due === 'now' ? 'due now' : `in ${due}`} · box {card.box}{card.lapses ? ` · missed ${card.lapses}×` : ''}
          </div>
        )}
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
              onClick={() => openLoop({ id, title, algs: list, diagram })}>loop</button>
          )}
          {alg && !adding && canOwn && (
            <button className="pill" title="Add your own alg for this case (checked against the case)" aria-label="Add own alg" onClick={() => { setDraft(''); setAdding(true); }}>+ alg</button>
          )}
          {suggested && <span className="pill suggest" title="Mean of the last 5 times is under the stage target">fast enough: learned?</span>}
        </div>
      </div>
    </div>
  );
}
