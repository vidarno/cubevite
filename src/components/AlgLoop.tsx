/**
 * Alg loop panel: repeat one alg back-to-back on the smart cube, no setup in between. Each rep is
 * followed live and timed from its first to its last turn; clean reps feed `loopStatsStore`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { algOrder, endsRotated, faceTurnCount, loopMove, loopPlans, reanchor, startLoop, summarize, type LoopState } from '../cube/algLoop';
import { withoutRotations } from '../cube/faceTurns';
import { cubeStore, useCube } from '../state/cubeStore';
import { formatTime, loopStatsStore, settingsStore } from '../state/data';
import { loopStore, type LoopTarget } from '../state/loop';
import { usePersisted } from '../state/storage';
import { AlgFollowView } from './AlgFollowView';
import { LiveCube } from './LiveCube';
import { LLDiagram } from './LLDiagram';

function recordRep(id: string, ms: number | null) {
  loopStatsStore.set((all) => {
    const prev = all[id] ?? { times: [], reps: 0, best: null };
    return {
      ...all,
      [id]: {
        reps: prev.reps + 1,
        times: ms === null ? prev.times : [...prev.times, ms].slice(-50),
        best: ms === null ? prev.best : Math.min(ms, prev.best ?? Infinity),
      },
    };
  });
}

const tps = (moves: number, ms: number) => (ms > 0 ? (moves / (ms / 1000)).toFixed(1) : '–');

export function AlgLoop({ target }: { target: LoopTarget }) {
  const cube = useCube();
  const smart = cube.status === 'connected';
  const [settings] = usePersisted(settingsStore);
  const noRotations = settings.noRotations ?? false;
  const algs = useMemo(() => (noRotations ? target.algs.map(withoutRotations) : target.algs), [target, noRotations]);
  const plans = useMemo(() => loopPlans(algs), [algs]);
  const [loop, setLoopState] = useState<LoopState>(() => startLoop(plans, cubeStore.get().state));
  const ref = useRef(loop);
  const setLoop = (next: LoopState) => { ref.current = next; setLoopState(next); };
  const [stats] = usePersisted(loopStatsStore);
  const [now, setNow] = useState(() => performance.now());
  const close = () => loopStore.set(null);

  useEffect(() => cubeStore.onMove((ev) => {
    const prev = ref.current;
    const next = loopMove(prev, ev.move, ev.state, ev.localTimestamp);
    if (next.reps.length > prev.reps.length) {
      const rep = next.reps[next.reps.length - 1];
      recordRep(target.id, rep.clean ? rep.ms : null);
    }
    setLoop(next);
  }), [target.id]);

  // A replaced state (reconnect / mark solved) starts the loop over from there.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setLoop(startLoop(plans, cubeStore.get().state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cube.resyncVersion, smart, plans]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const running = loop.repStart !== null;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => { setNow(performance.now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const order = useMemo(() => algOrder(algs[0]), [algs]);
  const rotated = useMemo(() => algs.some(endsRotated), [algs]);
  const sum = summarize(loop.reps);
  const last = loop.reps[loop.reps.length - 1];
  const allTime = stats[target.id];

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal wide alg-loop" data-reps={loop.reps.length} data-clean={sum.clean} onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <h2>Loop · {target.title}</h2>
          <button className="ghost" onClick={close}>Close (Esc)</button>
        </div>
        {!smart ? (
          <p className="muted">Looping an alg needs a smart cube (or the virtual cube) connected: it counts and times each rep.</p>
        ) : (
          <>
            <p className="muted small">
              Do the alg again and again, no setup in between. Each rep is timed from its first to its last turn;
              turns before you start a rep (an AUF, a fix) don't count.
              {rotated && ' This alg ends rotated: regrip to green front, yellow top before the next rep.'}
            </p>
            <div className="loop-body">
              {target.diagram && <LLDiagram state={target.diagram.state} mode={target.diagram.mode} size={120} arrows={settings.pllArrows ?? true} />}
              <LiveCube size={180} />
              <div className="loop-clock-wrap">
                <div className={`clock ${running ? 'running' : last && !last.clean ? 'unclean' : ''}`} data-testid="loop-clock">
                  {running ? formatTime(now - loop.repStart!, 1) : last ? formatTime(last.ms) : 'Go!'}
                </div>
                {last && !running && (
                  <div className="muted small">
                    {last.clean ? `${tps(faceTurnCount(plans[last.plan].alg), last.ms)} TPS` : `${last.moves} turns: extra turns, not timed`}
                  </div>
                )}
              </div>
            </div>
            <div className="alg-box"><AlgFollowView follow={loop.follow} /></div>
            {loop.backAfter !== null && (
              <p className="loop-back" data-testid="loop-back">Back to where you started after {loop.backAfter} reps.</p>
            )}
            {loop.backAfter === null && Number.isFinite(order) && order <= 12 && (
              <p className="muted small">This alg brings the cube back to its start every {order} reps.</p>
            )}
            <div className="loop-stats">
              <div><span className="stat-l">Reps</span> {sum.reps}{sum.clean < sum.reps ? ` (${sum.clean} clean)` : ''}</div>
              <div><span className="stat-l">Mean</span> {formatTime(sum.mean)}</div>
              <div><span className="stat-l">Best</span> {formatTime(sum.best)}</div>
              {allTime?.best != null && <div><span className="stat-l">All-time best</span> {formatTime(allTime.best)}</div>}
            </div>
            {loop.reps.length > 0 && (
              <ol className="loop-reps">
                {loop.reps.slice(-16).map((r, i) => (
                  <li key={loop.reps.length - 16 + i} className={r.clean ? (r.ms === sum.best ? 'best' : '') : 'unclean'} title={r.clean ? '' : `${r.moves} turns`}>
                    {r.clean ? formatTime(r.ms) : '×'}
                  </li>
                ))}
              </ol>
            )}
            <div className="row">
              <button className="ghost" disabled={!running} onClick={() => setLoop(reanchor(ref.current, cubeStore.get().state))}>Restart rep</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
