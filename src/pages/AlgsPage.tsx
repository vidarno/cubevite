import { useMemo, useState } from 'react';
import { OLL, PLL, type AlgCase, type AlgSet } from '../cube/algs';
import { caseState } from '../cube/cfop';
import {
  currentStage, LEARNING_DRILL_ID, LEARNING_PATH, learningDrill, stageItems, stageProgress, type Stage,
} from '../cube/learningPath';
import { caseStatsStore, learnStore, settingsStore, type LearnStatus } from '../state/data';
import { openTrainer } from '../state/nav';
import { usePersisted } from '../state/storage';
import { AlgCard } from '../components/AlgCard';

type View = 'path' | AlgSet;
const STATUSES: LearnStatus[] = ['new', 'learning', 'learned'];

export function AlgsPage() {
  const [view, setView] = useState<View>('path');
  const [learn] = usePersisted(learnStore);
  const [settings, setSettings] = usePersisted(settingsStore);
  const arrows = settings.pllArrows ?? true;

  const counts = view === 'path' ? null
    : STATUSES.map((s) => (view === 'OLL' ? OLL : PLL).filter((c) => (learn[c.id] ?? 'new') === s).length);

  return (
    <div className="algs-page">
      <div className="row spread">
        <div className="seg-control">
          {([['path', 'Learning path'], ['OLL', 'OLL'], ['PLL', 'PLL']] as [View, string][]).map(([v, label]) => (
            <button key={v} className={v === view ? 'active' : ''} onClick={() => setView(v)}>{label}</button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={arrows} onChange={(e) => setSettings((s) => ({ ...s, pllArrows: e.target.checked }))} />
          Show arrows
        </label>
        <label className="toggle" title="Take x / y / z out of the algs and rename the later moves">
          <input type="checkbox" checked={settings.noRotations ?? false} onChange={(e) => setSettings((s) => ({ ...s, noRotations: e.target.checked }))} />
          No rotations
        </label>
        {counts && <span className="muted">{counts[2]} learned · {counts[1]} learning · {counts[0]} new</span>}
      </div>
      {view === 'path' ? <LearningPath arrows={arrows} /> : <CaseList set={view} arrows={arrows} />}
    </div>
  );
}

function CaseList({ set, arrows }: { set: AlgSet; arrows: boolean }) {
  const groups = useMemo(() => {
    const m = new Map<string, AlgCase[]>();
    for (const c of set === 'OLL' ? OLL : PLL) m.set(c.group, [...(m.get(c.group) ?? []), c]);
    return [...m];
  }, [set]);
  return groups.map(([group, list]) => (
    <section key={group}>
      <h3 className="group-title">{group}</h3>
      <div className="alg-cards">
        {list.map((c) => (
          <AlgCard key={c.id} id={c.id} title={c.id} alg={c.alg} alts={c.alts} diagram={{ state: caseState(c), mode: c.set }} arrows={arrows} />
        ))}
      </div>
    </section>
  ));
}

function LearningPath({ arrows }: { arrows: boolean }) {
  const [learn, setLearn] = usePersisted(learnStore);
  const [stats] = usePersisted(caseStatsStore);
  const current = currentStage(learn);
  const nLearning = learningDrill(learn).cases.length;

  const drillLearning = () => openTrainer(LEARNING_DRILL_ID);

  return (
    <>
      <div className="path-intro">
        <p className="muted">
          Learn in this order: 2-look OLL (10 algs), 2-look PLL (6), then full PLL and full OLL. Mark cases as
          <b> learning</b> to drill them; a case is suggested as <b>learned</b> once your last 5 trainer times average
          under the stage target.
        </p>
        <button className="primary" disabled={!nLearning} onClick={drillLearning}>
          Drill my learning cases ({nLearning})
        </button>
      </div>
      {LEARNING_PATH.map((stage, i) => (
        <StageSection key={stage.id} stage={stage} n={i + 1} current={stage === current} arrows={arrows}
          learn={learn} stats={stats} setLearn={setLearn} />
      ))}
    </>
  );
}

function StageSection({ stage, n, current, arrows, learn, stats, setLearn }: {
  stage: Stage; n: number; current: boolean; arrows: boolean;
  learn: Record<string, LearnStatus>; stats: Parameters<typeof stageProgress>[2];
  setLearn: (f: (l: Record<string, LearnStatus>) => Record<string, LearnStatus>) => void;
}) {
  const items = stageItems(stage);
  const p = stageProgress(stage, learn, stats);
  const setAll = (ids: string[], s: LearnStatus) => setLearn((l) => ({ ...l, ...Object.fromEntries(ids.map((id) => [id, s])) }));
  const newIds = items.filter((i) => (learn[i.c.id] ?? 'new') === 'new').map((i) => i.c.id);
  return (
    <details className={`path-stage ${current ? 'current' : ''} ${p.done ? 'done' : ''}`} open={current} data-stage={stage.id}>
      <summary>
        <span className="stage-n">{p.done ? '✓' : n}</span>
        <span className="stage-label">{stage.label}</span>
        {current && <span className="pill on">current</span>}
        <span className="stage-progress" aria-label={`${p.learned} of ${p.total} learned`}>
          <span className="bar"><span className="learned" style={{ width: `${(100 * p.learned) / p.total}%` }} />
            <span className="learning" style={{ width: `${(100 * p.learning) / p.total}%` }} /></span>
          <span className="muted small">{p.learned}/{p.total} learned{p.learning ? ` · ${p.learning} learning` : ''}</span>
        </span>
      </summary>
      <p className="muted small">{stage.description} Target: under {stage.thresholdMs / 1000} s.</p>
      <div className="row">
        {newIds.length > 0 && (
          <button className="ghost small" onClick={() => setAll(newIds, 'learning')}>Start learning the {newIds.length} new</button>
        )}
        {p.suggested.length > 0 && (
          <button className="ghost small suggest" onClick={() => setAll(p.suggested, 'learned')}>
            Mark {p.suggested.length} fast case{p.suggested.length === 1 ? '' : 's'} learned
          </button>
        )}
      </div>
      <div className="alg-cards">
        {items.map(({ c }) => (
          <AlgCard key={c.id} id={c.id} title={c.id.startsWith('2L ') ? c.label : c.id} alg={c.alg ?? ''} alts={c.alts}
            diagram={c.diagram!} arrows={arrows} suggested={p.suggested.includes(c.id)} />
        ))}
      </div>
    </details>
  );
}
