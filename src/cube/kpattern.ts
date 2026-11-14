/**
 * Conversion from facelet strings to cubing.js KPattern data (used by the 3D TwistyPlayer
 * and the cubing.js solver). Verified against cubing.js's own move application in tests.
 */
import { stickerIndex, FACES, type Face } from './facelets';

const FACE_VEC: Record<Face, [number, number, number]> = {
  U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1],
};

// cubing.js 3x3x3 orbit orders.
export const CORNER_NAMES = ['UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'];
export const EDGE_NAMES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'];
export const CENTER_NAMES: Face[] = ['U', 'L', 'F', 'R', 'B', 'D'];

function stickersOf(name: string): number[] {
  const faces = [...name] as Face[];
  const pos = [0, 0, 0] as [number, number, number];
  for (const f of faces) for (let a = 0; a < 3; a++) pos[a] += FACE_VEC[f][a];
  return faces.map((f) => stickerIndex(pos, FACE_VEC[f]));
}

export const CORNER_STICKERS = CORNER_NAMES.map(stickersOf);
export const EDGE_STICKERS = EDGE_NAMES.map(stickersOf);

const sortKey = (s: string) => [...s].sort().join('');
const CORNER_BY_COLORS = new Map(CORNER_NAMES.map((n, i) => [sortKey(n), i]));
const EDGE_BY_COLORS = new Map(EDGE_NAMES.map((n, i) => [sortKey(n), i]));

export interface PatternData {
  EDGES: { pieces: number[]; orientation: number[] };
  CORNERS: { pieces: number[]; orientation: number[] };
  CENTERS: { pieces: number[]; orientation: number[]; orientationMod?: number[] };
}

/** Convert a centre-normalised facelet string into cubing.js 3x3x3 pattern data. */
export function faceletsToPatternData(state: string): PatternData {
  for (let f = 0; f < 6; f++) {
    if (state[f * 9 + 4] !== FACES[f]) throw new Error('faceletsToPatternData expects fixed centres');
  }
  const corners = { pieces: [] as number[], orientation: [] as number[] };
  CORNER_STICKERS.forEach((st) => {
    const colors = st.map((s) => state[s]).join('');
    const piece = CORNER_BY_COLORS.get(sortKey(colors));
    if (piece === undefined) throw new Error(`Invalid corner colours ${colors}`);
    const k = st.findIndex((s) => state[s] === 'U' || state[s] === 'D');
    corners.pieces.push(piece);
    corners.orientation.push((3 - k) % 3);
  });
  const edges = { pieces: [] as number[], orientation: [] as number[] };
  EDGE_STICKERS.forEach((st, i) => {
    const colors = st.map((s) => state[s]).join('');
    const piece = EDGE_BY_COLORS.get(sortKey(colors));
    if (piece === undefined) throw new Error(`Invalid edge colours ${colors} at ${EDGE_NAMES[i]}`);
    edges.pieces.push(piece);
    edges.orientation.push(state[st[0]] === EDGE_NAMES[piece][0] ? 0 : 1);
  });
  return {
    EDGES: edges,
    CORNERS: corners,
    CENTERS: { pieces: [0, 1, 2, 3, 4, 5], orientation: [0, 0, 0, 0, 0, 0], orientationMod: [1, 1, 1, 1, 1, 1] },
  };
}

/** Inverse of `faceletsToPatternData` (centres fixed): piece-level data back to a facelet string. */
export function patternDataToFacelets(data: Pick<PatternData, 'CORNERS' | 'EDGES'>): string {
  const out = FACES.map((f) => f.repeat(9)).join('').split('');
  CORNER_STICKERS.forEach((st, i) => {
    const name = CORNER_NAMES[data.CORNERS.pieces[i]];
    const k = (3 - data.CORNERS.orientation[i]) % 3; // index of the U/D sticker
    for (let j = 0; j < 3; j++) out[st[(k + j) % 3]] = name[j];
  });
  EDGE_STICKERS.forEach((st, i) => {
    const name = EDGE_NAMES[data.EDGES.pieces[i]];
    const o = data.EDGES.orientation[i];
    out[st[0]] = name[o];
    out[st[1]] = name[1 - o];
  });
  return out.join('');
}
