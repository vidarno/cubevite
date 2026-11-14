/**
 * Optimal cross solver.
 *
 * The cross on a face is the four edges containing that face's colour. Their state is a
 * coordinate (ordered slot of each of the 4 pieces, 12·11·10·9, times 16 flips = 190080
 * reachable states). A BFS from the solved cross over the 18 face turns gives the exact
 * distance of every state (half-turn metric; every cross is ≤ 8 moves). Tables are built
 * lazily per face (~30 ms each) and kept for the session.
 *
 * Works on centre-normalised facelet strings (fixed centres, as smart cubes report) and
 * returns face-turn solutions in the same frame.
 */
import { applyMove, FACES, type Face } from './facelets';
import { EDGE_NAMES, EDGE_STICKERS } from './kpattern';

/** The 18 face turns, in FACES order (U R F D L B), each as quarter, half, inverse. */
export const FACE_TURNS: string[] = FACES.flatMap((f) => [f, f + '2', f + "'"]);
const MOVE_FACE = FACE_TURNS.map((_, m) => Math.floor(m / 3));
const OPPOSITE_INDEX = [3, 4, 5, 0, 1, 2]; // U<->D, R<->L, F<->B in FACES order

/** For each move: (slot * 2 + orientation) -> (slot' * 2 + orientation'). */
const EDGE_MOVE: Int8Array[] = (() => {
  // A string with a unique character per sticker shows where each sticker goes.
  const marked = Array.from({ length: 54 }, (_, i) => String.fromCharCode(0x100 + i)).join('');
  const where = new Map<number, number>(); // sticker index -> slot * 2 + index in slot
  EDGE_STICKERS.forEach((st, slot) => st.forEach((s, j) => where.set(s, slot * 2 + j)));
  return FACE_TURNS.map((m) => {
    const after = applyMove(marked, m);
    const dest = new Int8Array(24);
    for (let i = 0; i < 54; i++) {
      const from = after.charCodeAt(i) - 0x100; // the sticker that came to position i
      const a = where.get(from);
      if (a !== undefined) dest[a] = where.get(i)!;
    }
    return dest;
  });
})();

const SIZE = 12 ** 4 * 16;

/** Edge pieces (= home slots, cubing.js order) of the cross on a face. */
export const crossEdges = (face: Face): number[] => EDGE_NAMES.flatMap((n, i) => (n.includes(face) ? [i] : []));

// A cross state is 4 values, one per cross piece: slot * 2 + orientation (0..23).
type Pieces = number[];

function encode(p: Pieces): number {
  return ((((p[0] >> 1) * 12 + (p[1] >> 1)) * 12 + (p[2] >> 1)) * 12 + (p[3] >> 1)) * 16
    + ((p[0] & 1) << 3) + ((p[1] & 1) << 2) + ((p[2] & 1) << 1) + (p[3] & 1);
}

/** A cross coordinate as 4 values (slot * 2 + orientation), one per piece of `crossEdges(face)`. */
export function decodeCross(c: number): Pieces {
  const o = c & 15;
  let s = c >> 4;
  const slots = [0, 0, 0, 0];
  for (let k = 3; k >= 0; k--) { slots[k] = s % 12; s = Math.floor(s / 12); }
  return slots.map((sl, k) => sl * 2 + ((o >> (3 - k)) & 1));
}

const applyCoord = (c: number, m: number) => encode(decodeCross(c).map((p) => EDGE_MOVE[m][p]));

const tables = new Map<Face, Int8Array>();

/** Distance table for a face (-1 = unreachable coordinate, e.g. two pieces in one slot). */
function table(face: Face): Int8Array {
  let t = tables.get(face);
  if (t) return t;
  t = new Int8Array(SIZE).fill(-1);
  const solved = encode(crossEdges(face).map((slot) => slot * 2));
  t[solved] = 0;
  let frontier = [solved];
  for (let d = 0; frontier.length; d++) {
    const next: number[] = [];
    for (const c of frontier) {
      const p = decodeCross(c);
      for (let m = 0; m < 18; m++) {
        const mv = EDGE_MOVE[m];
        const n = encode([mv[p[0]], mv[p[1]], mv[p[2]], mv[p[3]]]);
        if (t[n] === -1) { t[n] = d + 1; next.push(n); }
      }
    }
    frontier = next;
  }
  tables.set(face, t);
  return t;
}

/** Number of states at each distance for a face's cross (index = moves). */
export function crossDistribution(face: Face = 'D'): number[] {
  const t = table(face);
  const out: number[] = [];
  for (let i = 0; i < SIZE; i++) if (t[i] >= 0) out[t[i]] = (out[t[i]] ?? 0) + 1;
  return out;
}

const atDistance = new Map<string, number[]>();

/** Every cross coordinate (see `decodeCross`) whose cross needs exactly `d` moves. */
export function crossCoordsAtDistance(face: Face, d: number): number[] {
  const k = face + d;
  let list = atDistance.get(k);
  if (!list) {
    const t = table(face);
    list = [];
    for (let i = 0; i < SIZE; i++) if (t[i] === d) list.push(i);
    atDistance.set(k, list);
  }
  return list;
}

/** The cross coordinate of a facelet state: where each of the face's cross edges sits. */
function crossCoord(state: string, face: Face): number {
  const pieces = crossEdges(face).map((home) => {
    const [c0, c1] = [...EDGE_NAMES[home]];
    for (let slot = 0; slot < 12; slot++) {
      const [a, b] = EDGE_STICKERS[slot];
      if (state[a] === c0 && state[b] === c1) return slot * 2;
      if (state[b] === c0 && state[a] === c1) return slot * 2 + 1;
    }
    throw new Error(`crossCoord: edge ${EDGE_NAMES[home]} not found`);
  });
  return encode(pieces);
}

/** Optimal number of face turns to solve the cross on `face`. */
export function crossDistance(state: string, face: Face = 'D'): number {
  return table(face)[crossCoord(state, face)];
}

/** Optimal cross length for every face. */
export function crossDistances(state: string): Record<Face, number> {
  return Object.fromEntries(FACES.map((f) => [f, crossDistance(state, f)])) as Record<Face, number>;
}

/**
 * Up to `max` distinct optimal cross solutions (face-turn strings, empty string if solved).
 * Sequences that only differ by the order of two commuting opposite-face turns are listed once
 * (the one with U before D, R before L, F before B).
 */
export function solveCross(state: string, face: Face = 'D', max = 1): string[] {
  const t = table(face);
  const out: string[] = [];
  const path: number[] = [];
  const dfs = (c: number, d: number, last: number) => {
    if (out.length >= max) return;
    if (d === 0) { out.push(path.map((m) => FACE_TURNS[m]).join(' ')); return; }
    for (let m = 0; m < 18; m++) {
      const f = MOVE_FACE[m];
      if (last >= 0 && (f === last || (f === OPPOSITE_INDEX[last] && f < last))) continue;
      const n = applyCoord(c, m);
      if (t[n] !== d - 1) continue;
      path.push(m);
      dfs(n, d - 1, f);
      path.pop();
      if (out.length >= max) return;
    }
  };
  const c = crossCoord(state, face);
  dfs(c, t[c], -1);
  return out;
}

/** Build a face's table ahead of time (e.g. while the user inspects). */
export const warmCrossTable = (face: Face = 'D') => void table(face);
