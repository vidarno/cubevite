import { bestPlan, hintAlg, planMoves, type AlgFollow } from '../cube/drills';
import { isRotation } from '../cube/faceTurns';

/** What a whole-cube rotation means, in words (algs are written for the display frame). */
const ROTATION_HELP: Record<string, string> = {
  x: 'tilt the cube forward: front comes up to the top (like R)',
  "x'": 'tilt the cube back: top goes to the front (like L)',
  x2: 'flip the cube over front to top (x twice)',
  y: 'turn the cube to the left: right comes to the front (like U)',
  "y'": 'turn the cube to the right: left comes to the front (like U\')',
  y2: 'turn the cube around: back comes to the front',
  z: 'roll the cube right: top goes to the right (like F)',
  "z'": 'roll the cube left: top goes to the left (like F\')',
  z2: 'roll the cube upside down (z twice)',
};

export const rotationHelp = (move: string) => ROTATION_HELP[move.replace('2\'', '2')] ?? 'whole-cube rotation';

/**
 * The alg being drilled, followed live on the smart cube: done moves dim, the next move is
 * underlined, and a wrong turn shows how to undo it. Moves are in the display frame (cross down).
 * If the user is doing one of the alternatives, that one is shown instead of the main alg. Plans can
 * repeat an alg with another AUF (symmetric cases); each alg is listed once.
 *
 * Rotations are marked (the smart cube can't see them): they're explained underneath, and the undo
 * hint names faces as the cube is held after them, plus the undo for a skipped rotation.
 */
export function AlgFollowView({ follow, otherLabel }: { follow: AlgFollow; otherLabel?: string }) {
  const i = bestPlan(follow);
  const p = follow.progress[i];
  const moves = planMoves(follow.plans[i]);
  const rotations = [...new Set(moves.map((m) => m.move).filter(isRotation))];
  return (
    <div className="alg-follow" data-plan={i} data-done={p.done}>
      <div className="alg mono">
        {moves.map((m, k) => {
          let cls = 'mv';
          if (k < p.done) cls += ' done';
          else if (k === p.done) cls += p.fix.length ? ' blocked' : p.half ? ' half' : ' current';
          if (m.auf) cls += ' auf';
          const rot = isRotation(m.move);
          if (rot) cls += ' rot';
          return (
            <span key={k} className={cls} title={rot ? `${m.move}: ${rotationHelp(m.move)}` : undefined}>
              {m.auf ? `(${m.move})` : rot ? `⟳${m.move}` : m.move}
            </span>
          );
        })}
      </div>
      {rotations.length > 0 && (
        <div className="rot-help muted small">
          {rotations.map((r) => <div key={r}><b className="mono">⟳{r}</b> {rotationHelp(r)}</div>)}
          <div>The cube can't see rotations: do them, or switch on "No rotations".</div>
        </div>
      )}
      {p.fix.length > 0 && (
        <div className="fix">Undo: {p.fix.map((m, k) => <span key={k} className="mv fixmv">{m}</span>)}</div>
      )}
      {p.fix.length > 0 && p.fixUnrotated && (
        <div className="fix-alt muted small" data-testid="fix-unrotated">
          (if you didn't do the rotation: <span className="mono">{p.fixUnrotated.join(' ')}</span>)
        </div>
      )}
      {follow.plans.map((pl, k) => k !== i && pl.alg !== follow.plans[i].alg
        && follow.plans.findIndex((o) => o.alg === pl.alg) === k && (
        <div key={k} className="alg mono muted small">{otherLabel ?? (pl.alg === follow.plans[0].alg ? 'main' : 'alt')}: {hintAlg(pl)}</div>
      ))}
    </div>
  );
}
