import { useEffect, useMemo, useRef, useState } from 'react';
import { TwistyPlayer } from 'cubing/twisty';
import { CROSS_DOWN_ROTATION, faceMapFor, mapMove } from '../cube/display';
import { simplify } from '../cube/follow';
import { stepLabel } from '../cube/algId';
import { analysisOf, type SolveAnalysis } from '../cube/analysis';
import { pauseLabel, pauseTotals } from '../cube/pauses';
import { errorLabel, wasteByStage } from '../cube/errors';
import { effectiveTime, formatTime, type Solve } from '../state/data';
import { openTrainer } from '../state/nav';
import { SplitsTable } from './SplitsTable';
import { CrossSection, F2LSection, SolveTimeline } from './SolveAnalysis';

interface Props {
  solve: Solve;
  onClose: () => void;
  onChange: (s: Solve) => void;
  onDelete: (s: Solve) => void;
  /** Set up this solve's start state again (absent while a solve is running). */
  onRedo?: (s: Solve, withCross: boolean) => void;
}

/** Reconstruction of a smart-cube solve, grouped into CFOP stages, in the solver's frame (cross on D). */
function reconstruction(solve: Solve) {
  const sp = solve.splits;
  if (!solve.moves || !sp?.crossFace) return null;
  const rot = CROSS_DOWN_ROTATION[sp.crossFace];
  const map = faceMapFor(rot);
  const mapped = solve.moves.map((m) => mapMove(m.move, map));
  const ll = sp.llSteps;
  const bounds: { label: string; end: number | null }[] = [
    { label: 'Cross', end: sp.moveCounts.cross },
    ...sp.pairMoves.map((end, i) => ({ label: `Pair ${i + 1}`, end })),
    // Last-layer sub-steps with the identified alg; older solves only have the OLL / PLL bounds.
    ...(ll?.length
      ? ll.map((s) => ({ label: `${s.kind}: ${stepLabel(s)}`, end: s.endMove }))
      : [{ label: 'OLL', end: sp.moveCounts.oll }, { label: 'PLL', end: sp.moveCounts.pll }]),
  ];
  // A trailing AUF after the last LL step (or after an LL skip) still belongs to the solve.
  if (ll?.length && sp.moveCounts.pll !== null) bounds.push({ label: 'AUF', end: sp.moveCounts.pll });
  const groups: { label: string; moves: string[] }[] = [];
  let start = 0;
  for (const b of bounds) {
    if (b.end === null || b.end < start) continue;
    const moves = simplify(mapped.slice(start, b.end));
    if (moves.length) groups.push({ label: b.label, moves });
    start = b.end;
  }
  return { rot, groups, all: mapped };
}

function Errors({ analysis, onJump }: { analysis: SolveAnalysis; onJump: (n: number) => void }) {
  const { errors } = analysis;
  if (!errors.length) return <p className="muted small">No wasted moves.</p>;
  const sum = wasteByStage(errors).map((w) => `${w.stage} ${w.moves} moves / ${formatTime(w.ms)}`).join(' · ');
  return (
    <div className="pauses">
      <div className="small"><b>Errors &amp; waste</b> <span className="muted">({sum})</span></div>
      {errors.map((e) => (
        <div key={`${e.kind}-${e.start}`} className="small pause pause-error clickable" onClick={() => onJump(e.start)}>
          <span className="muted">{e.stage}:</span> {errorLabel(e)} <span className="muted">({formatTime(e.ms)})</span>
        </div>
      ))}
    </div>
  );
}

function Pauses({ analysis, onJump }: { analysis: SolveAnalysis; onJump: (n: number) => void }) {
  const { pauses } = analysis;
  if (!pauses.length) return <p className="muted small">No pauses.</p>;
  const tot = pauseTotals(pauses);
  const sum = Object.entries(tot).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${formatTime(v)}`).join(' · ');
  return (
    <div className="pauses">
      <div className="small"><b>Pauses</b> <span className="muted">({pauses.length}: {sum})</span></div>
      {pauses.map((p) => (
        <div key={p.at} className={`small pause pause-${p.kind} clickable`} onClick={() => onJump(p.at)}>
          <span className="mono">{formatTime(p.duration)}</span> <span className="muted">at {formatTime(p.start)}</span> {pauseLabel(p)}
          {p.kind === 'mid-alg' && p.drillId && p.caseId && (
            <> <button className="link" onClick={(e) => { e.stopPropagation(); openTrainer(p.drillId!, [p.caseId!]); }}>drill it</button></>
          )}
        </div>
      ))}
    </div>
  );
}

export function SolveDetail({ solve, onClose, onChange, onDelete, onRedo }: Props) {
  const rec = reconstruction(solve);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const analysis = useMemo(() => analysisOf(solve), [solve.id]);
  const host = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwistyPlayer | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  useEffect(() => {
    if (!rec || !host.current) return;
    // Every reported move (not the simplified reconstruction), so replay index = move index.
    const player = new TwistyPlayer({
      puzzle: '3x3x3',
      experimentalSetupAlg: `${solve.scramble} ${rec.rot}`,
      alg: rec.all.join(' '),
      background: 'none',
      controlPanel: 'bottom-row',
      tempoScale: 2,
      hintFacelets: 'floating',
    });
    player.style.width = '100%';
    player.style.height = '260px';
    host.current.appendChild(player);
    playerRef.current = player;
    const model = player.experimentalModel;
    const onTime = async (info: { timestamp: number; atEnd: boolean }) => {
      const indexer = await model.indexer.get();
      // Moves started by this time (timestampToIndex gives the previous move exactly at a boundary).
      let n: number = indexer.timestampToIndex(info.timestamp as never);
      while (n < rec.all.length && indexer.indexToMoveStartTimestamp(n as never) <= info.timestamp) n++;
      setCursor(info.atEnd ? rec.all.length : Math.max(0, n - 1));
    };
    model.detailedTimelineInfo.addFreshListener(onTime as never);
    return () => { model.detailedTimelineInfo.removeFreshListener(onTime as never); playerRef.current = null; player.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solve.id]);

  /** Show the replay at the state after `n` moves. */
  const jumpTo = async (n: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.pause();
    const indexer = await player.experimentalModel.indexer.get();
    player.timestamp = n >= (solve.moves?.length ?? 0) ? 'end' : indexer.indexToMoveStartTimestamp(n as never);
  };

  const setPenalty = (penalty: Solve['penalty']) => onChange({ ...solve, penalty });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <h3>{formatTime(effectiveTime(solve))}{solve.penalty === '+2' ? ' (+2)' : ''}{solve.redoOf && <span className="muted"> · redo</span>}</h3>
          <span className="muted">{new Date(solve.date).toLocaleString()}</span>
        </div>
        <p className="mono small">{solve.scramble}</p>
        {solve.moves && (
          <p className="muted small">
            {solve.moves.length} moves · {(solve.moves.length / ((solve.time ?? 1) / 1000)).toFixed(2)} TPS
          </p>
        )}
        <SplitsTable solve={solve} />
        {analysis && <CrossSection cross={analysis.cross} endMove={analysis.splits.moveCounts.cross ?? 0} onJump={jumpTo} />}
        {analysis && <F2LSection pairs={analysis.f2l} onJump={jumpTo} />}
        {analysis && <Pauses analysis={analysis} onJump={jumpTo} />}
        {analysis && <Errors analysis={analysis} onJump={jumpTo} />}
        {rec && (
          <>
            {analysis && <SolveTimeline solve={solve} analysis={analysis} cursor={cursor} onJump={jumpTo} />}
            <div ref={host} className="replay" />
            <div className="reconstruction">
              {rec.rot && <div className="mono small muted">{rec.rot} // inspection</div>}
              {rec.groups.map((g) => (
                <div key={g.label} className="mono small">
                  {g.moves.join(' ')} <span className="muted">// {g.label} ({g.moves.length})</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="row">
          <button className={solve.penalty === undefined ? 'primary' : 'ghost'} onClick={() => setPenalty(undefined)}>OK</button>
          <button className={solve.penalty === '+2' ? 'primary' : 'ghost'} onClick={() => setPenalty('+2')}>+2</button>
          <button className={solve.penalty === 'DNF' ? 'primary' : 'ghost'} onClick={() => setPenalty('DNF')}>DNF</button>
          <span className="spacer" />
          {onRedo && <button className="ghost" onClick={() => onRedo(solve, false)}>Redo scramble</button>}
          {onRedo && analysis && <button className="ghost" onClick={() => onRedo(solve, true)}>Redo with optimal cross</button>}
          <button className="danger" onClick={() => onDelete(solve)}>Delete</button>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
