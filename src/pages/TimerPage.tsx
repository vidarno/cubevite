import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAlg, isSolved, SOLVED } from '../cube/facelets';
import { Follower, type FollowProgress } from '../cube/follow';
import { analyzeSolve, llCaseTags, type TimedMove } from '../cube/cfop';
import { movesBetween, randomScramble } from '../cube/solver';
import { cubeStore, useCube } from '../state/cubeStore';
import { averageOf, countedSolves, effectiveTime, formatTime, settingsStore, solvesStore, srsStore, type Solve } from '../state/data';
import { reviewed } from '../cube/srs';
import { crossPlans, pushAlgFollow, startAlgFollow, type AlgFollow } from '../cube/drills';
import { isCrossSolved } from '../cube/cfop';
import { shortestWayBack, undoAlg } from '../cube/redo';
import { AlgFollowView } from '../components/AlgFollowView';
import { usePersisted } from '../state/storage';
import { LiveCube } from '../components/LiveCube';
import { ScrambleDisplay } from '../components/ScrambleDisplay';
import { SplitsTable } from '../components/SplitsTable';
import { SolveDetail } from '../components/SolveDetail';
import { AnalysisSummary } from '../components/SolveAnalysis';
import { analysisOf, crossHold } from '../cube/analysis';
import { DEFAULT_HINT_GAPS, LLHintTracker, tierDelays, type HintStyle, type HintView } from '../cube/llHint';
import { LLDiagram } from '../components/LLDiagram';

type Phase =
  | { kind: 'scrambling' }
  | { kind: 'ready'; readyAt: number }
  | { kind: 'solving'; startTs: number; startState: string; moves: TimedMove[]; penalty?: '+2' | 'DNF' }
  | { kind: 'armed' } // manual timer: space held
  | { kind: 'manual'; startTs: number };

/** Redoing an earlier solve's start state; `withCross` shows that solve's optimal cross, followed live. */
interface Redo { solve: Solve; target: string; withCross: boolean }

/** Where a solve started: the recorded state (smart) or the scramble applied to solved. */
const startOf = (s: Solve) => s.start ?? applyAlg(SOLVED, s.scramble);

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function TimerPage() {
  const cube = useCube();
  const smart = cube.status === 'connected';
  const [settings, setSettings] = usePersisted(settingsStore);
  const [solves, setSolves] = usePersisted(solvesStore);
  const [scramble, setScramble] = useState<string>('');
  const [follow, setFollow] = useState<FollowProgress | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'scrambling' });
  const [now, setNow] = useState(performance.now());
  const [detail, setDetail] = useState<Solve | null>(null);

  const followerRef = useRef<Follower | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const scrambleRef = useRef(scramble);
  scrambleRef.current = scramble;
  const [redo, setRedo] = useState<Redo | null>(null);
  const redoRef = useRef(redo);
  redoRef.current = redo;
  /** The optimal cross being followed during a "redo with optimal cross". */
  const [crossFollow, setCrossFollow] = useState<AlgFollow | null>(null);
  const crossFollowRef = useRef(crossFollow);
  crossFollowRef.current = crossFollow;
  /** Last-layer hints during the current smart solve (null when off / not solving). */
  const hintRef = useRef<LLHintTracker | null>(null);

  // --- scramble generation & follow sequence ------------------------------------------
  /** Phase 'ready' (and, for a redo with cross, start following the optimal cross from `target`). */
  const becomeReady = useCallback((target: string) => {
    const r = redoRef.current;
    const face = r?.withCross ? r.solve.splits?.crossFace : null;
    const plans = face ? crossPlans(target, 4, face) : [];
    setCrossFollow(face && plans.length ? startAlgFollow(plans, target, face) : null);
    setPhase({ kind: 'ready', readyAt: performance.now() });
  }, []);

  /** Follow-along from the cube's current state to `scr` (or, for a redo, to the redone solve's start). */
  const buildFollower = useCallback(async (scr: string) => {
    if (!scr || cubeStore.get().status !== 'connected') { followerRef.current = null; setFollow(null); return; }
    const r = redoRef.current;
    const target = r ? r.target : applyAlg(SOLVED, scr);
    for (let attempt = 0; attempt < 5; attempt++) {
      const from = cubeStore.get().state;
      // Shortest of: the scramble itself (from solved), undoing the redone solve's moves, the solver's path.
      const quick = shortestWayBack(from, target, [scr, r?.solve.moves && undoAlg(r.solve.moves.map((m) => m.move))]);
      const seq = quick ?? await movesBetween(from, target);
      if (cubeStore.get().state !== from || scrambleRef.current !== scr || redoRef.current !== r) continue; // cube moved meanwhile
      const f = new Follower(from, seq);
      followerRef.current = f;
      const p = f.progress();
      setFollow(p);
      if (p.complete) becomeReady(target);
      return;
    }
  }, [becomeReady]);

  const newScramble = useCallback(async () => {
    setRedo(null);
    redoRef.current = null;
    setCrossFollow(null);
    setPhase({ kind: 'scrambling' });
    setFollow(null);
    followerRef.current = null;
    const scr = await randomScramble();
    setScramble(scr);
    scrambleRef.current = scr;
    await buildFollower(scr);
  }, [buildFollower]);

  useEffect(() => { newScramble(); }, [newScramble]);

  /** Set up an earlier solve's start state again. */
  const startRedo = useCallback(async (solve: Solve, withCross: boolean) => {
    const r: Redo = { solve, target: startOf(solve), withCross };
    setRedo(r);
    redoRef.current = r;
    setCrossFollow(null);
    setPhase({ kind: 'scrambling' });
    setFollow(null);
    followerRef.current = null;
    setScramble(solve.scramble);
    scrambleRef.current = solve.scramble;
    await buildFollower(solve.scramble);
  }, [buildFollower]);

  // Rebuild the follow-along when the cube (re)connects or its state is replaced.
  useEffect(() => {
    if (phaseRef.current.kind === 'scrambling' || phaseRef.current.kind === 'ready') {
      setPhase({ kind: 'scrambling' });
      buildFollower(scrambleRef.current);
    }
  }, [smart, cube.resyncVersion, buildFollower]);

  // --- finishing a solve ---------------------------------------------------------------
  const saveSolve = useCallback((s: Solve) => {
    setSolves((prev) => [...prev, s]);
  }, [setSolves]);

  const finishSmart = useCallback((p: Extract<Phase, { kind: 'solving' }>) => {
    const time = p.moves[p.moves.length - 1].t;
    const splits = analyzeSolve(p.startState, p.moves);
    const r = redoRef.current;
    const hints = hintRef.current?.used() ?? [];
    hintRef.current = null;
    // Spaced repetition: a case you needed a hint for is due again (name only: kept in its box).
    if (hints.length && !r) {
      const now = Date.now();
      srsStore.set((d) => hints.reduce((acc, h) => reviewed(acc, h.caseId, h.tier === 1 ? 'hard' : 'again', now), d));
    }
    saveSolve({
      id: uid(), date: Date.now(), scramble: scrambleRef.current, time, smart: true,
      start: p.startState, moves: p.moves, splits, penalty: p.penalty,
      ...(r ? { redoOf: r.solve.redoOf ?? r.solve.id } : {}),
      ...(hints.length ? { hints } : {}),
    });
    newScramble();
  }, [newScramble, saveSolve]);

  /** Feed a move to the optimal-cross follower; it goes away once the cross is solved. */
  const advanceCross = useCallback((move: string, state: string) => {
    const cf = crossFollowRef.current;
    const face = redoRef.current?.solve.splits?.crossFace;
    if (!cf || !face) return;
    setCrossFollow(isCrossSolved(state, face) ? null : pushAlgFollow(cf, move, state));
  }, []);

  // --- smart cube moves ----------------------------------------------------------------
  useEffect(() => cubeStore.onMove((ev) => {
    const ph = phaseRef.current;
    if (ph.kind === 'scrambling') {
      const f = followerRef.current;
      if (!f) return;
      const p = f.push(ev.move, ev.state);
      setFollow(p);
      if (p.complete || ev.state === f.target) becomeReady(f.target);
    } else if (ph.kind === 'ready') {
      const inspected = (performance.now() - ph.readyAt) / 1000;
      const penalty = !settingsStore.get().inspection ? undefined : inspected > 17 ? 'DNF' : inspected > 15 ? '+2' : undefined;
      const next: Phase = { kind: 'solving', startTs: ev.localTimestamp, startState: ev.prev, moves: [{ move: ev.move, t: 0 }], penalty };
      const st = settingsStore.get();
      const style: HintStyle = st.llHints ?? '2look';
      hintRef.current = style === 'off' ? null : new LLHintTracker(style, st.noRotations ?? false, performance.now(), ev.prev, tierDelays(st.hintGaps));
      hintRef.current?.push(ev.move, ev.state, performance.now());
      setPhase(next);
      advanceCross(ev.move, ev.state);
    } else if (ph.kind === 'solving') {
      const moves = [...ph.moves, { move: ev.move, t: ev.localTimestamp - ph.startTs }];
      const next = { ...ph, moves };
      advanceCross(ev.move, ev.state);
      hintRef.current?.push(ev.move, ev.state, performance.now());
      if (isSolved(ev.state)) finishSmart(next);
      else setPhase(next);
    }
  }), [finishSmart, becomeReady, advanceCross]);

  // --- manual (spacebar) timer, used when no smart cube is connected --------------------
  useEffect(() => {
    let holdTimer: number | null = null;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
      e.preventDefault();
      const ph = phaseRef.current;
      if (ph.kind === 'solving') { // smart solve: space = next hint tier
        hintRef.current?.reveal();
        setNow(performance.now());
        return;
      }
      if (ph.kind === 'manual') {
        const time = performance.now() - ph.startTs;
        const r = redoRef.current;
        saveSolve({ id: uid(), date: Date.now(), scramble: scrambleRef.current, time, smart: false, ...(r ? { redoOf: r.solve.redoOf ?? r.solve.id } : {}) });
        newScramble();
        return;
      }
      if (smart) return;
      if (ph.kind === 'scrambling') holdTimer = window.setTimeout(() => setPhase({ kind: 'armed' }), 300);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (phaseRef.current.kind === 'armed') setPhase({ kind: 'manual', startTs: performance.now() });
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [smart, saveSolve, newScramble]);

  // --- clock ---------------------------------------------------------------------------
  useEffect(() => {
    if (phase.kind !== 'solving' && phase.kind !== 'manual' && phase.kind !== 'ready') return;
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      hintRef.current?.tick(t);
      setNow(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase.kind]);

  const counted = useMemo(() => countedSolves(solves), [solves]);
  const last = solves[solves.length - 1];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lastAnalysis = useMemo(() => (last?.smart ? analysisOf(last) : null), [last?.id]);
  let clock: string;
  let clockClass = '';
  if (phase.kind === 'solving' || phase.kind === 'manual') {
    clock = settings.hideTimerWhileSolving ? 'solve' : formatTime(now - phase.startTs, 1);
    clockClass = 'running';
  } else if (phase.kind === 'armed') {
    clock = '0.00'; clockClass = 'armed';
  } else if (phase.kind === 'ready') {
    const insp = 15 - Math.floor((now - phase.readyAt) / 1000);
    clock = settings.inspection ? (insp > 0 ? String(insp) : insp > -2 ? '+2' : 'DNF') : '0.00';
    clockClass = 'ready';
  } else {
    clock = last ? formatTime(effectiveTime(last)) : '0.00';
  }

  const status = (() => {
    if (!smart) return phase.kind === 'scrambling' ? 'Hold space, release to start. Press space to stop.' : '';
    switch (phase.kind) {
      case 'scrambling': return follow?.fix.length ? 'Oops - undo the highlighted moves'
        : redo ? 'Redo: back to the same start with the moves above' : 'Scramble the cube following the moves above';
      case 'ready': return 'Scrambled! The timer starts on your first turn.';
      case 'solving': return `${phase.moves.length} moves`;
      default: return '';
    }
  })();

  const hintView = phase.kind === 'solving' ? hintRef.current?.view() ?? null : null;
  const revealHint = () => { hintRef.current?.reveal(); setNow(performance.now()); };

  const recent = solves.slice(-12);
  const best = counted.reduce<number | null>((b, s) => { const t = effectiveTime(s); return t !== null && (b === null || t < b) ? t : b; }, null);

  return (
    <div className="timer-page">
      <section className="scramble-bar">
        <ScrambleDisplay scramble={scramble} follow={smart ? follow : null} />
        <div className="scramble-actions">
          <button className="ghost" onClick={() => newScramble()} disabled={phase.kind === 'solving'}>{redo ? 'Cancel redo' : 'New scramble'}</button>
        </div>
      </section>

      <div className="timer-main">
        <div className="timer-center">
          <div className={`clock ${clockClass}`}>{clock}</div>
          <div className="status">{status}</div>
          {hintView && <LLHintPanel view={hintView} arrows={settings.pllArrows ?? true} onReveal={revealHint} />}
          {phase.kind === 'scrambling' && last?.splits && <SplitsTable solve={last} compact />}
          {crossFollow && redo && (phase.kind === 'ready' || phase.kind === 'solving') && (
            <div className="alg-box cross-follow">
              <div className="muted small">
                {(({ colour, front }) => `Optimal ${colour} cross (${colour} on the bottom, ${front} in front):`)(crossHold(redo.solve.splits!.crossFace!))}
              </div>
              <AlgFollowView follow={crossFollow} otherLabel="or" />
            </div>
          )}
          {phase.kind === 'scrambling' && !redo && lastAnalysis && (
            <AnalysisSummary analysis={lastAnalysis} onOpen={() => setDetail(last)} onRedo={(withCross) => startRedo(last, withCross)} />
          )}
          <div className="stats-row">
            <Stat label="ao5" value={formatTime(averageOf(counted, 5))} />
            <Stat label="ao12" value={formatTime(averageOf(counted, 12))} />
            <Stat label="best" value={formatTime(best ?? undefined)} />
            <Stat label="solves" value={String(counted.length)} />
          </div>
        </div>
        <div className="timer-cube">
          {smart ? <LiveCube size={300} /> : <div className="no-cube">Connect your GAN cube (or the virtual cube) to see it live here.</div>}
          <label className="toggle">
            <input type="checkbox" checked={settings.yellowTop ?? true} onChange={(e) => setSettings({ ...settings, yellowTop: e.target.checked })} />
            Yellow on top
          </label>
          <label className="toggle">
            <input type="checkbox" checked={settings.inspection} onChange={(e) => setSettings({ ...settings, inspection: e.target.checked })} />
            15s inspection
          </label>
          <label className="toggle">
            <input type="checkbox" checked={settings.hideTimerWhileSolving} onChange={(e) => setSettings({ ...settings, hideTimerWhileSolving: e.target.checked })} />
            Hide time while solving
          </label>
          <label className="toggle">
            Last-layer hints
            <select value={settings.llHints ?? '2look'} onChange={(e) => setSettings({ ...settings, llHints: e.target.value as HintStyle })}>
              <option value="2look">2-look</option>
              <option value="full">Full OLL/PLL</option>
              <option value="off">Off</option>
            </select>
          </label>
          {(settings.llHints ?? '2look') !== 'off' && (
            <div className="hint-gaps small muted">
              {(['name', 'picture', 'alg'] as const).map((what, k) => {
                const gaps = settings.hintGaps ?? DEFAULT_HINT_GAPS;
                return (
                  <label key={what}>
                    {k ? `+ ${what}` : `${what} after`}
                    <input type="number" min={0} max={60} step={1} value={gaps[k]} aria-label={`seconds before the hint ${what}`}
                      onChange={(e) => {
                        const next = [...gaps] as [number, number, number];
                        next[k] = Math.max(0, Math.min(60, Number(e.target.value) || 0));
                        setSettings({ ...settings, hintGaps: next });
                      }} />
                    s
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <section className="history">
        <h3>Recent solves</h3>
        <ol className="history-list" reversed>
          {[...recent].reverse().map((s, i) => (
            <li key={s.id}>
              <button className="history-item" onClick={() => setDetail(s)}>
                <span className="n">{solves.length - i}.</span>
                <span className="t">{formatTime(effectiveTime(s))}{s.penalty === '+2' ? '+' : ''}</span>
                {s.redoOf && <span className="tag redo">redo</span>}
                {s.hints?.length ? <span className="tag hint" title={s.hints.map((h) => h.caseId.replace(/^2L (OLL|PLL) /, '')).join(', ')}>hint</span> : null}
                {s.splits && llCaseTags(s.splits).map((tag) => <span key={tag} className="tag">{tag}</span>)}
                {s.moves && <span className="muted">{s.moves.length} moves · {(s.moves.length / ((s.time ?? 1) / 1000)).toFixed(1)} tps</span>}
              </button>
            </li>
          ))}
        </ol>
        {!solves.length && <p className="muted">No solves yet.</p>}
      </section>

      {detail && (
        <SolveDetail
          solve={detail}
          onClose={() => setDetail(null)}
          onChange={(s) => { setSolves((prev) => prev.map((x) => (x.id === s.id ? s : x))); setDetail(s); }}
          onDelete={(s) => { setSolves((prev) => prev.filter((x) => x.id !== s.id)); setDetail(null); }}
          onRedo={phase.kind === 'solving' ? undefined : (s, withCross) => { setDetail(null); startRedo(s, withCross); }}
        />
      )}
    </div>
  );
}

const TIER_LABEL = ['Hint (space)', 'Show the case (space)', 'Show the alg (space)'];

/**
 * Tiered last-layer hint while solving: nothing until the solver pauses (or presses space / taps),
 * then the step and case name, the case picture, and finally the alg followed live.
 */
function LLHintPanel({ view, arrows, onReveal }: { view: HintView; arrows: boolean; onReveal: () => void }) {
  const { hint, tier, follow } = view;
  if (tier === 0) {
    return <button className="ghost small ll-hint-ask" onClick={onReveal}>{TIER_LABEL[0]}</button>;
  }
  return (
    <div className="alg-box ll-hint" data-tier={tier}>
      <div className="step-hint-body">
        {tier >= 2 && hint.diagram && (
          <figure className="step-hint-case">
            <LLDiagram state={hint.diagram.state} mode={hint.diagram.mode} size={110} arrows={arrows} />
            <figcaption className="muted small">{hint.preAuf ? `look for this, after ${hint.preAuf}` : 'look for this'}</figcaption>
          </figure>
        )}
        <div>
          <div><span className="muted">{hint.stepLabel}:</span> <b>{hint.name}</b></div>
          {tier === 3 && follow && <AlgFollowView follow={follow} otherLabel="alt" />}
          {tier < 3 && <button className="link small" onClick={onReveal}>{TIER_LABEL[tier]}</button>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><div className="stat-v">{value}</div><div className="stat-l">{label}</div></div>;
}

