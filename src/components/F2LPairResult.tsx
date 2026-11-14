import type { PairReport } from '../cube/f2lDrill';
import { formatTime } from '../state/data';

/** Slot names as a cuber says them (cross on the bottom): front-right first. */
const SLOT_LABEL: Record<string, string> = { RF: 'FR', FL: 'FL', LB: 'BL', BR: 'BR' };
/** A pause before a pair longer than this is flagged as a lookahead pause. */
const PAUSE_MS = 1000;

/** Full-F2L result: each pair's slot, case, pause before it, time and moves. */
export function F2LPairResult({ pairs }: { pairs: PairReport[] }) {
  return (
    <table className="f2l-pairs" data-testid="f2l-pairs">
      <thead>
        <tr><th>Pair</th><th>Slot</th><th>Case</th><th>Pause</th><th>Time</th><th>Moves</th></tr>
      </thead>
      <tbody>
        {pairs.map((p, i) => (
          <tr key={i} data-slot={p.slots.join(' ')}>
            <td>{i + 1}</td>
            <td>{p.slots.length ? p.slots.map((s) => SLOT_LABEL[s]).join(' + ') : '—'}</td>
            <td>{!p.slots.length ? 'free' : p.caseId ?? <span className="muted">stuck piece</span>}</td>
            <td className={p.pauseBefore > PAUSE_MS ? 'warn' : ''}>{formatTime(p.pauseBefore, 1)}</td>
            <td>{formatTime(p.time)}</td>
            <td>{p.moves}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
