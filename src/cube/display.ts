import { applyAlg, FACES, parseMove, SOLVED, type Face } from './facelets';

/** Rotation (in cube frame) that brings each possible cross face to the bottom, keeping things natural. */
export const CROSS_DOWN_ROTATION: Record<Face, string> = { D: '', U: 'z2', F: "x'", B: 'x', R: 'z', L: "z'" };

/** For a whole-cube rotation, map each cube-frame face to the face it occupies afterwards. */
export function faceMapFor(rotation: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!rotation) { FACES.forEach((f) => (map[f] = f)); return map; }
  const s = applyAlg(SOLVED, rotation);
  FACES.forEach((pos, i) => { map[s[i * 9 + 4]] = pos; });
  return map;
}

export function mapMove(move: string, map: Record<string, string>): string {
  const { family } = parseMove(move);
  const upper = family.toUpperCase();
  const mapped = map[upper];
  if (!mapped) return move; // slices/rotations left untouched
  return (family === upper ? mapped : mapped.toLowerCase()) + move.slice(1);
}
