/**
 * Runs a drill: setup follow (from whatever state the cube is in) -> ready -> solving (timed,
 * one split per drill step) -> result, then auto-advances. Without a smart cube it's a flashcard
 * mode (recognise, space reveals the alg, space again for the next case).
 * Steps with `classify` (2-look) get their case recognised when the step starts; the hint panel
 * shows it on request or after HINT_DELAY_MS, and the result lists each step's case.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { crossReport, type CrossReport } from '../cube/crossDrill';
import { f2lPairReport, type PairReport } from '../cube/f2lDrill';
import {
  advanceSteps, aufVariants, bestPlan, casePlans, crossLevel, crossPlans, toCrossDown, TRAINING_CROSS, undoMoves, hintAlg, hintPlans, pickCase, plansFor, pushAlgFollow, startAlgFollow, type AlgFollow, type Drill,
  type DrillCase, type StepHint,
} from '../cube/drills';
import { withoutRotations } from '../cube/faceTurns';
import { Follower, type FollowProgress } from '../cube/follow';
import { movesBetween } from '../cube/solver';
import { cubeStore, useCube } from '../state/cubeStore';
import { caseStatsStore, crossLogStore, formatTime, settingsStore, type CrossMode } from '../state/data';
import { openLoop, loopStore, useLoop } from '../state/loop';
import { usePersisted } from '../state/storage';
import { AlgFollowView } from './AlgFollowView';
import { CrossResult } from './CrossResult';
import { F2LPairResult } from './F2LPairResult';
import { LLDiagram } from './LLDiagram';
import { LiveCube } from './LiveCube';
import { ScrambleDisplay } from './ScrambleDisplay';

type Hints = (StepHint | null)[];
/**
 * A redo of the same start state (not recorded in case stats); `withSolution` follows the optimal cross live;
 * `restart` = started over mid-solve ("Restart case").
 */
interface Redo { withSolution: boolean; restart?: boolean }
type Run =
  | { phase: 'setup'; c: DrillCase | null; target: string; redo?: Redo }
  | { phase: 'ready'; c: DrillCase | null; target: string; redo?: Redo; readyAt: number; hints: Hints; follow: AlgFollow | null }
  | { phase: 'solving'; c: DrillCase | null; target: string; redo?: Redo; readyAt: number; startTs: number; moves: number; log: string[]; step: number; splits: number[]; hints: Hints; follow: AlgFollow | null;
      /** Elapsed ms of each move, and the cube-frame state at the start of each step (for the F2L pair report). */
      times: number[]; stepStates: string[] }
  | { phase: 'result'; c: DrillCase | null; target: string; redo?: Redo; log: string[]; time: number; moves: number; splits: number[]; hints: Hints; cross?: CrossOutcome; pairs?: PairReport[] };

/** Cross drill result; execMs is null in plan-only mode (revealed without solving). */
interface CrossOutcome { report: CrossReport; planMs: number; execMs: number | null }

const statsKey = (drill: Drill, c: DrillCase | null) => c?.id ?? drill.id;
const HINT_DELAY_MS = 5000;
const DEFAULT_CROSS_INSPECT = 15;

function logCross(o: CrossOutcome, mode: CrossMode, redo: boolean) {
  crossLogStore.set((l) => [...l, {
    date: Date.now(), optimal: o.report.optimal, moves: o.execMs === null ? null : o.report.yourMoves,
    planMs: o.planMs, execMs: o.execMs, mode, ...(redo ? { redo } : {}),
  }].slice(-500));
}

function recordTime(key: string, ms: number) {
  caseStatsStore.set((s) => {
    const prev = s[key] ?? { times: [], attempts: 0 };
    return { ...s, [key]: { times: [...prev.times, ms].slice(-50), attempts: prev.attempts + 1 } };
  });
}

export function DrillRunner({ drill, pool, onStop }: { drill: Drill; pool: DrillCase[]; onStop: () => void }) {
  const cube = useCube();
  const smart = cube.status === 'connected';
  const [showCase, setShowCase] = useState(true);
  const [settings, setSettings] = usePersisted(settingsStore);
  /** Smart-cube drills show the alg without a click (flashcards always keep the reveal). */
  const alwaysShowAlg = smart && (settings.drillShowAlg ?? true);
  const noRotations = settings.noRotations ?? false;
  const algText = (alg: string) => (noRotations ? withoutRotations(alg) : alg);
  const [revealed, setRevealed] = useState(false);
  /** Step index whose hint was requested. */
  const [hintStep, setHintStep] = useState<number | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [follow, setFollow] = useState<FollowProgress | null>(null);
  const followerRef = useRef<Follower | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  /** The last finished attempt and every move made since (so a redo can undo the way back). */
  const lastResult = useRef<{ c: DrillCase | null; target: string; log: string[]; since: string[] } | null>(null);
  /** The last finished attempt's case (state mirror of `lastResult` for rendering). */
  const [last, setLast] = useState<{ c: DrillCase | null } | null>(null);
  const [now, setNow] = useState(() => performance.now());
  /** An alg loop opened from the result: the drill pauses (ignores moves, no auto-advance) until it closes. */
  const looping = useLoop() !== null;

  const readyRun = useCallback((c: DrillCase | null, target: string, redo?: Redo): Run => {
    const hint = drill.steps[0].classify?.(target) ?? null;
    // Follow the alg being shown from the case state: progress highlight + undo hints.
    const isDone = (st: string) => drill.steps[drill.steps.length - 1].isDone(st, c);
    const plans = drill.kind === 'cross' ? (redo?.withSolution ? crossPlans(target) : [])
      : c ? aufVariants(casePlans(drill, c, target), target, isDone)
      : hint ? aufVariants(hintPlans(hint), target, (st) => drill.steps[0].isDone(st, c)) : [];
    const shown = plansFor(plans, settingsStore.get().noRotations ?? false);
    return { phase: 'ready', c, target, redo, readyAt: performance.now(), hints: [hint], follow: shown.length ? startAlgFollow(shown, target) : null };
  }, [drill]);

  // --- start a case -------------------------------------------------------------------------
  /** Set up a new start state for `c`, or (redo) the given one again, preferring to undo `log` if that's shorter. */
  const startCase = useCallback(async (c: DrillCase | null, again?: { target: string; log: string[]; redo: Redo }) => {
    setRevealed(false);
    setHintStep(null);
    const target = again?.target ?? drill.pickTarget(c);
    const redo = again?.redo;
    const r: Run = { phase: 'setup', c, target, redo };
    setRun(r);
    runRef.current = r;
    setFollow(null);
    followerRef.current = null;
    if (cubeStore.get().status !== 'connected') return;
    for (let attempt = 0; attempt < 5; attempt++) {
      const from = cubeStore.get().state;
      let seq = from === target ? '' : await movesBetween(from, target);
      const back = again && undoMoves(from, target, again.log);
      if (back !== null && back !== undefined && back.split(' ').length <= seq.split(' ').length) seq = back;
      if (cubeStore.get().state !== from) continue;
      if (runRef.current !== r) return; // superseded
      const f = new Follower(from, seq);
      followerRef.current = f;
      const p = f.progress();
      setFollow(p);
      if (p.complete) setRun(readyRun(c, target, redo));
      return;
    }
  }, [drill, readyRun]);

  const next = useCallback(() => {
    if (!drill.cases.length) { startCase(null); return; }
    if (!pool.length) return;
    startCase(pickCase(pool, caseStatsStore.get(), runRef.current?.c?.id));
  }, [drill, pool, startCase]);

  // Start on mount.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    next();
  }, [next]);

  // Re-plan the setup if the cube state is replaced (reconnect / mark solved) or a loop moved it.
  useEffect(() => {
    const r = runRef.current;
    if (looping) return;
    if (r && (r.phase === 'setup' || r.phase === 'ready')) startCase(r.c, r.redo && { target: r.target, log: [], redo: r.redo });
  }, [cube.resyncVersion, smart, startCase, looping]);

  // --- smart cube moves ------------------------------------------------------------------------
  useEffect(() => cubeStore.onMove((ev) => {
    const r = runRef.current;
    if (!r) return;
    if (r.phase === 'result' || r.phase === 'setup') lastResult.current?.since.push(ev.move);
    if (loopStore.get()) return;
    if (r.phase === 'setup') {
      const f = followerRef.current;
      if (!f) return;
      const p = f.push(ev.move, ev.state);
      setFollow(p);
      if (p.complete || ev.state === r.target) setRun(readyRun(r.c, r.target, r.redo));
    } else if (r.phase === 'ready' || r.phase === 'solving') {
      const solving = r.phase === 'solving' ? r
        : { ...r, phase: 'solving' as const, startTs: ev.localTimestamp, moves: 0, log: [], step: 0, splits: [], times: [], stepStates: [r.target] };
      const elapsed = ev.localTimestamp - solving.startTs;
      const step = advanceSteps(drill, ev.state, solving.step, r.c);
      const splits = [...solving.splits, ...Array(step - solving.step).fill(elapsed)];
      const moves = solving.moves + 1;
      const log = [...solving.log, ev.move];
      const times = [...solving.times, elapsed];
      const stepStates = [...solving.stepStates, ...Array(Math.min(step, drill.steps.length - 1) - Math.min(solving.step, drill.steps.length - 1)).fill(ev.state)];
      // Steps finished together (a skip) keep no hint; the new current step is recognised now.
      const hints = [...solving.hints];
      for (let i = solving.step + 1; i <= step && i < drill.steps.length; i++) hints[i] = null;
      let follow = solving.follow && pushAlgFollow(solving.follow, ev.move, ev.state);
      if (step > solving.step && step < drill.steps.length) {
        const h = drill.steps[step].classify?.(ev.state) ?? null;
        hints[step] = h;
        const plans = h ? aufVariants(hintPlans(h), ev.state, (st) => drill.steps[step].isDone(st, r.c)) : [];
        const shown = plansFor(plans, settingsStore.get().noRotations ?? false);
        follow = shown.length ? startAlgFollow(shown, ev.state) : null;
      }
      if (step === drill.steps.length) {
        let cross: CrossOutcome | undefined;
        if (drill.kind === 'cross') {
          cross = { report: crossReport(solving.target, log, TRAINING_CROSS), planMs: solving.startTs - solving.readyAt, execMs: elapsed };
          logCross(cross, settingsStore.get().crossMode ?? 'solve', !!r.redo);
        }
        const pairs = drill.kind === 'f2l'
          ? f2lPairReport(stepStates.map((st) => toCrossDown(st)), toCrossDown(ev.state), splits, times) : undefined;
        setRun({ phase: 'result', c: r.c, target: r.target, redo: r.redo, log, time: elapsed, moves, splits, hints, cross, pairs });
        lastResult.current = { c: r.c, target: r.target, log, since: [] };
        setLast({ c: r.c });
        // Redos are practice on a known state: they don't count towards case stats.
        if (!r.redo) recordTime(statsKey(drill, r.c), elapsed);
        // Multi-step drills also feed per-case stats for each recognised step (e.g. "OLL 26" from 2-look OLL).
        if (drill.steps.length > 1 && !r.redo) {
          hints.forEach((h, i) => { if (h && h.caseId !== 'AUF') recordTime(h.caseId, splits[i] - (i ? splits[i - 1] : 0)); });
        }
      } else {
        setRun({ ...solving, moves, log, step, splits, hints, follow, times, stepStates });
      }
    }
  }), [drill, readyRun]);

  // Auto-advance after a result (the cross drill waits: its result has solutions to read).
  useEffect(() => {
    if (run?.phase !== 'result' || drill.kind === 'cross' || looping) return;
    const t = window.setTimeout(() => next(), 1500);
    return () => clearTimeout(t);
  }, [run, next, drill.kind, looping]);

  const ticking = run?.phase === 'solving' || (run?.phase === 'ready' && drill.kind === 'cross');
  useEffect(() => {
    if (!ticking) return;
    let raf = 0;
    const tick = () => { setNow(performance.now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ticking]);

  // Cross drill, plan only: reveal the optimal solutions without solving.
  const crossMode: CrossMode = settings.crossMode ?? 'solve';
  const revealCross = useCallback(() => {
    const r = runRef.current;
    if (r?.phase !== 'ready') return;
    const cross: CrossOutcome = { report: crossReport(r.target, [], TRAINING_CROSS), planMs: performance.now() - r.readyAt, execMs: null };
    logCross(cross, 'plan', !!r.redo);
    setRun({ phase: 'result', c: r.c, target: r.target, redo: r.redo, log: [], time: 0, moves: 0, splits: [], hints: r.hints, cross });
    lastResult.current = { c: r.c, target: r.target, log: [], since: [] };
    setLast({ c: r.c });
  }, []);

  // Cross drill keys with a smart cube: space reveals (plan only) / goes to the next scramble.
  useEffect(() => {
    if (!smart || drill.kind !== 'cross') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const r = runRef.current;
      if (r?.phase === 'ready' && crossMode === 'plan') { e.preventDefault(); revealCross(); }
      else if (r?.phase === 'result') { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [smart, drill.kind, crossMode, revealCross, next]);

  // Flashcard mode keys (no smart cube): space reveals / next.
  useEffect(() => {
    if (smart) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !runRef.current) return;
      e.preventDefault();
      if (!revealed) setRevealed(true); else next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [smart, revealed, next]);

  if (!run) return null;
  if (!smart && !drill.cases.length) {
    return (
      <div className="trainer-run" data-phase="flashcard">
        <h2>{drill.label}</h2>
        <p className="muted">This drill sets up random states, so it needs a smart cube (or the virtual cube) connected.</p>
        <div className="row"><button className="ghost" onClick={onStop}>Stop</button></div>
      </div>
    );
  }
  const c = run.c;
  // Current step's recognised case (multi-step / case-less drills).
  const curStep = run.phase === 'ready' ? 0 : run.phase === 'solving' ? run.step : null;
  const curHint = curStep !== null && run.phase !== 'setup' ? run.hints[curStep] : null;
  const stepElapsed = run.phase === 'solving' ? now - run.startTs - (run.step ? run.splits[run.step - 1] : 0) : 0;
  const hintShown = curHint && (alwaysShowAlg || hintStep === curStep || (run.phase === 'solving' && stepElapsed > HINT_DELAY_MS));
  const algLen = c?.alg ? c.alg.split(' ').length : 0;
  const stuck = run.phase === 'solving' && !!c?.alg && run.moves > algLen * 2 + 4;
  const showAlg = (alwaysShowAlg && run.phase !== 'setup') || revealed || run.phase === 'result' || stuck;
  const algFollow = run.phase === 'ready' || run.phase === 'solving' ? run.follow : null;
  /** Alg hidden: the undo for a wrong turn (relative to the closest DB alg), if undo tips are on. */
  const algHidden = c ? !showAlg : !hintShown;
  const tipProgress = smart && algHidden && (settings.drillUndoTips ?? true) && algFollow && drill.kind !== 'cross'
    ? algFollow.progress[bestPlan(algFollow)] : null;
  const undoTip = tipProgress?.fix ?? [];
  const undoTipView = undoTip.length > 0 && (
    <>
      <div className="fix undo-tip">Undo: {undoTip.map((m, k) => <span key={k} className="mv fixmv">{m}</span>)}</div>
      {tipProgress?.fixUnrotated && (
        <div className="fix-alt muted small">(if you didn't do the rotation: <span className="mono">{tipProgress.fixUnrotated.join(' ')}</span>)</div>
      )}
    </>
  );
  const restart = () => {
    const r = runRef.current;
    if (r?.phase === 'solving') startCase(r.c, { target: r.target, log: r.log, redo: { withSolution: !!r.redo?.withSolution, restart: true } });
  };
  const isCross = drill.kind === 'cross';
  const inspectLimit = (settings.crossInspect ?? DEFAULT_CROSS_INSPECT) * 1000;
  const inspecting = isCross && run.phase === 'ready' ? now - run.readyAt : 0;
  const hideCube = isCross && crossMode === 'noLook'
    && (run.phase === 'solving' || (run.phase === 'ready' && inspectLimit > 0 && inspecting > inspectLimit));
  const redoRun = (withSolution: boolean) => {
    const last = lastResult.current;
    if (last) startCase(last.c, { target: last.target, log: [...last.log, ...last.since], redo: { withSolution } });
  };
  const canRedo = smart && last !== null && (run.phase === 'result' || (run.phase === 'setup' && !run.redo));
  const redoLabel = run.phase === 'result' ? 'Redo' : 'Redo previous';
  /** The case just done (result, or the next case's setup), if it has an alg to loop. */
  const loopCase = smart && (run.phase === 'result' || run.phase === 'setup') && last?.c?.alg ? last.c : null;
  const title = isCross ? `Cross${crossLevel(c) ? ` · ${c!.label}` : ''}`
    : c && (run.phase === 'result' || showAlg || !showCase) ? c.id : drill.label;

  return (
    <div className="trainer-run" data-phase={run.phase} data-case={c?.id}>
      <div className="row spread">
        <h2>{title}{run.redo && <span className="muted"> · {run.redo.restart ? 'restart' : 'redo'}</span>}</h2>
        <div className="row">
          {isCross && (
            <>
              <label className="toggle">
                Mode{' '}
                <select value={crossMode} onChange={(e) => setSettings((st) => ({ ...st, crossMode: e.target.value as CrossMode }))}>
                  <option value="solve">Solve</option>
                  <option value="noLook">No-look solve</option>
                  <option value="plan">Plan only</option>
                </select>
              </label>
              <label className="toggle">
                Inspection{' '}
                <select value={settings.crossInspect ?? DEFAULT_CROSS_INSPECT} onChange={(e) => setSettings((st) => ({ ...st, crossInspect: Number(e.target.value) }))}>
                  <option value={0}>no limit</option>
                  <option value={8}>8 s</option>
                  <option value={15}>15 s</option>
                </select>
              </label>
            </>
          )}
          {smart && (c?.alg || drill.steps.some((st) => st.classify)) && (
            <label className="toggle">
              <input type="checkbox" checked={settings.drillShowAlg ?? true} onChange={(e) => setSettings((st) => ({ ...st, drillShowAlg: e.target.checked }))} />
              Show algorithm
            </label>
          )}
          {smart && !alwaysShowAlg && !isCross && (c?.alg || drill.steps.some((st) => st.classify)) && (
            <label className="toggle" title="With the alg hidden, still show how to undo a wrong turn">
              <input type="checkbox" checked={settings.drillUndoTips ?? true} onChange={(e) => setSettings((st) => ({ ...st, drillUndoTips: e.target.checked }))} />
              Undo tips
            </label>
          )}
          {!isCross && (c?.alg || drill.steps.some((st) => st.classify)) && (
            <label className="toggle" title="Take x / y / z out of the algs and rename the later moves (applies from the next case)">
              <input type="checkbox" checked={noRotations} onChange={(e) => setSettings((st) => ({ ...st, noRotations: e.target.checked }))} />
              No rotations
            </label>
          )}
          {c?.diagram && (
            <label className="toggle">
              <input type="checkbox" checked={showCase} onChange={(e) => setShowCase(e.target.checked)} />
              Show case picture
            </label>
          )}
        </div>
      </div>

      {smart && run.phase === 'setup' && (
        <>
          <p className="muted">
            {run.redo ? 'Back to the same start:' : isCross ? 'Scramble the cube:' : 'Set up the case:'}
          </p>
          <ScrambleDisplay scramble={follow ? follow.moves.join(' ') : ''} follow={follow} />
        </>
      )}

      <div className="trainer-body">
        {c?.diagram && (showCase || run.phase === 'result' || !smart) && (
          <LLDiagram state={c.diagram.state} mode={c.diagram.mode} size={180} arrows={settings.pllArrows ?? true} />
        )}
        {smart && !hideCube && <LiveCube size={240} />}
        {smart && hideCube && <div className="live-cube hidden-cube" style={{ width: 240, height: 240 }}>No looking!</div>}
      </div>

      {smart && run.phase !== 'setup' && (
        <div className={`clock ${run.phase === 'solving' ? 'running' : run.phase === 'ready' ? 'ready' : ''}`}>
          {run.phase === 'solving' ? formatTime(now - run.startTs, 1)
            : run.phase === 'result' ? (run.cross?.execMs === null ? 'Plan' : formatTime(run.time))
            : isCross ? inspectionLabel(inspecting, inspectLimit) : 'Go!'}
        </div>
      )}
      {drill.steps.length > 1 && (run.phase === 'solving' || (run.phase === 'result' && !run.pairs)) && (
        <ol className="drill-splits">
          {drill.steps.map((s, i) => {
            const done = i < run.splits.length;
            const h = run.hints[i];
            return (
              <li key={s.id} className={done ? 'done' : ''} data-step={s.id}>
                {s.label}{done && s.classify && <span className="muted"> ({h?.name ?? 'skip'})</span>}:{' '}
                {done ? formatTime(run.splits[i] - (i ? run.splits[i - 1] : 0)) : '…'}
              </li>
            );
          })}
        </ol>
      )}
      {run.phase === 'result' && drill.steps.some((s) => s.classify) && (
        <ul className="step-results">
          {drill.steps.map((s, i) => {
            const h = run.hints[i];
            return (
              <li key={s.id}>
                {h?.diagram && <LLDiagram state={h.diagram.state} mode={h.diagram.mode} size={64} arrows={settings.pllArrows ?? true} />}
                <div>
                  <div><strong>{s.label}</strong>: {h?.name ?? 'skip'}</div>
                  {h?.alg && <div className="alg mono small">{hintAlg({ ...h, alg: algText(h.alg) })}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {isCross && run.phase === 'ready' && (
        <p className="muted">
          {crossMode === 'plan' ? 'Plan the cross, then press space (or the button) to see the optimal solutions.'
            : crossMode === 'noLook' ? 'Plan the whole cross: the 3D view hides once you start turning. Solve it without looking.'
            : 'Plan the cross; the timer starts on your first turn.'}
        </p>
      )}
      {isCross && algFollow && (
        <div className="alg-box cross-follow">
          <div className="muted small">Optimal solution (cross on the bottom):</div>
          <AlgFollowView follow={algFollow} otherLabel="or" />
        </div>
      )}
      {run.phase === 'result' && run.cross && <CrossResult report={run.cross.report} planMs={run.cross.planMs} execMs={run.cross.execMs} />}
      {run.phase === 'result' && run.pairs && <F2LPairResult pairs={run.pairs} />}
      {run.phase === 'result' && !run.cross && <p className="muted">{run.moves} moves</p>}

      {c?.alg && (showAlg || !alwaysShowAlg) && (
        <div className="alg-box">
          {showAlg ? (
            algFollow ? <AlgFollowView follow={algFollow} /> : (
              <>
                <div className="alg mono">{algText(c.alg)}</div>
                {c.alts?.map((a) => <div key={a} className="alg mono muted small">alt: {algText(a)}</div>)}
              </>
            )
          ) : (
            <>
              <button className="ghost" onClick={() => setRevealed(true)}>Show algorithm {smart ? '' : '(space)'}</button>
              {undoTipView}
            </>
          )}
        </div>
      )}

      {!c && curHint !== null && (
        <div className="alg-box step-hint">
          {hintShown && curHint ? (
            <div className="step-hint-body">
              {curHint.diagram && (
                <figure className="step-hint-case">
                  <LLDiagram state={curHint.diagram.state} mode={curHint.diagram.mode} size={120} arrows={settings.pllArrows ?? true} />
                  <figcaption className="muted small">
                    {curHint.preAuf ? `look for this, after ${curHint.preAuf}` : 'look for this'}
                  </figcaption>
                </figure>
              )}
              <div>
                <div className="muted small">{drill.steps[curStep!].label}: {curHint.name}</div>
                {algFollow ? <AlgFollowView follow={algFollow} /> : (
                  <>
                    {curHint.alg ? <div className="alg mono">{hintAlg({ ...curHint, alg: algText(curHint.alg) })}</div> : <div className="alg mono">{curHint.postAuf}</div>}
                    {curHint.alts?.map((a) => <div key={a.alg} className="alg mono muted small">alt: {hintAlg({ ...a, alg: algText(a.alg) })}</div>)}
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <button className="ghost" onClick={() => setHintStep(curStep)}>Hint</button>
              {undoTipView}
            </>
          )}
        </div>
      )}

      <div className="row">
        {run.phase === 'solving' && <button className="ghost" onClick={restart} title="Undo back to this case's start and try again (not counted in stats)">Restart case</button>}
        {isCross && run.phase === 'ready' && crossMode === 'plan' && <button className="primary" onClick={revealCross}>Show optimal (space)</button>}
        {loopCase && (
          <button className="ghost" onClick={() => openLoop({ id: loopCase.id, title: loopCase.id, algs: [loopCase.alg!, ...(loopCase.alts ?? [])], diagram: loopCase.diagram })}>
            {run.phase === 'result' ? 'Loop this alg' : 'Loop previous alg'}
          </button>
        )}
        {canRedo && <button className="ghost" onClick={() => redoRun(false)}>{redoLabel}</button>}
        {canRedo && isCross && <button className="ghost" onClick={() => redoRun(true)}>{redoLabel} with solution</button>}
        {isCross && run.phase === 'result'
          ? <button className="primary" onClick={next}>Next (space)</button>
          : <button className="ghost" onClick={next}>Skip / next</button>}
        <button className="ghost" onClick={onStop}>Stop</button>
      </div>
    </div>
  );
}

/** Inspection clock: seconds left (or "+n" over the limit), or planning time without a limit. */
function inspectionLabel(ms: number, limit: number): string {
  if (!limit) return formatTime(ms, 1);
  const left = Math.ceil((limit - ms) / 1000);
  return left > 0 ? String(left) : `+${Math.floor((ms - limit) / 1000)}`;
}
