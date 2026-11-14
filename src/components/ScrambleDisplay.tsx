import { faceMapFor, mapMove } from '../cube/display';
import { tokenize } from '../cube/facelets';
import type { FollowProgress } from '../cube/follow';
import { settingsStore } from '../state/data';
import { usePersisted } from '../state/storage';

/**
 * Scramble text; with a smart cube, highlights progress and shows fixes for wrong turns.
 * Moves are tracked in the cube's own frame (white top, green front) but shown in the frame the
 * user holds the cube in (matching the 3D view), so "L" on screen is always the face on your left.
 */
export function ScrambleDisplay({ scramble, follow }: { scramble: string; follow: FollowProgress | null }) {
  const [settings] = usePersisted(settingsStore);
  const yellowTop = settings.yellowTop ?? true;
  if (!scramble) return <div className="scramble muted">Generating scramble…</div>;
  const frame = faceMapFor(yellowTop ? 'z2' : '');
  const show = (m: string) => mapMove(m, frame);
  const official = tokenize(scramble);
  const custom = follow && follow.moves.join(' ') !== official.join(' ');
  const moves = follow ? follow.moves : official;
  return (
    <div className="scramble-wrap">
      <div className="hold-hint muted small">
        Hold <b className={yellowTop ? 'yellow' : 'white'}>{yellowTop ? 'yellow' : 'white'}</b> on top,{' '}
        <b className="green">green</b> facing you
      </div>
      <div className="scramble">
        {moves.map((m, i) => {
          let cls = 'mv';
          if (follow) {
            if (i < follow.done) cls += ' done';
            else if (i === follow.done) cls += follow.fix.length ? ' blocked' : follow.half ? ' half' : ' current';
          }
          return <span key={i} className={cls}>{show(m)}</span>;
        })}
        {follow && !moves.length && <span className="muted">Cube is already in the scrambled state</span>}
      </div>
      {follow && follow.fix.length > 0 && (
        <div className="fix">Undo: {follow.fix.map((m, i) => <span key={i} className="mv fixmv">{show(m)}</span>)}</div>
      )}
      {custom && (
        <div className="muted small">
          Your cube wasn't solved, so these moves take it from its current state to the scramble{' '}
          <code>{official.map(show).join(' ')}</code>
        </div>
      )}
    </div>
  );
}
