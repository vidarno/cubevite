/**
 * Facelet-level 3x3 cube model.
 *
 * State is a 54-character string in Kociemba order (same as GAN cubes report):
 *   U1..U9 R1..R9 F1..F9 D1..D9 L1..L9 B1..B9
 * Each character is the face letter whose centre colour the sticker matches
 * (U R F D L B). Solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB".
 *
 * Moves are derived geometrically (rotating sticker positions in 3D), so every
 * supported move - faces, wide moves, slices and rotations - is correct by construction.
 */

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
export const SOLVED = FACES.map((f) => f.repeat(9)).join('');

type Vec = [number, number, number];

interface Sticker {
  pos: Vec; // cubie position, each coord in {-1,0,1}; x=R, y=U, z=F
  normal: Vec;
}

/** Position and normal of each of the 54 facelets. */
const STICKERS: Sticker[] = (() => {
  const out: Sticker[] = [];
  for (const face of FACES) {
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3);
      const c = i % 3;
      let pos: Vec;
      let normal: Vec;
      switch (face) {
        case 'U': pos = [c - 1, 1, r - 1]; normal = [0, 1, 0]; break;
        case 'R': pos = [1, 1 - r, 1 - c]; normal = [1, 0, 0]; break;
        case 'F': pos = [c - 1, 1 - r, 1]; normal = [0, 0, 1]; break;
        case 'D': pos = [c - 1, -1, 1 - r]; normal = [0, -1, 0]; break;
        case 'L': pos = [-1, 1 - r, c - 1]; normal = [-1, 0, 0]; break;
        case 'B': pos = [1 - c, 1 - r, -1]; normal = [0, 0, -1]; break;
      }
      out.push({ pos, normal });
    }
  }
  return out;
})();

const key = (s: Sticker) => `${s.pos.join(',')}|${s.normal.join(',')}`;
const INDEX_OF = new Map(STICKERS.map((s, i) => [key(s), i]));

export function stickerIndex(pos: Vec, normal: Vec): number {
  const i = INDEX_OF.get(`${pos.join(',')}|${normal.join(',')}`);
  if (i === undefined) throw new Error('no sticker at ' + pos + ' ' + normal);
  return i;
}

/** Rotate v by -90deg (clockwise when looking from +axis) about axis 0=x,1=y,2=z. */
function rotCW(v: Vec, axis: number): Vec {
  const [x, y, z] = v;
  switch (axis) {
    case 0: return [x, z, -y];
    case 1: return [-z, y, x];
    default: return [y, -x, z];
  }
}

/** A permutation p where newState[p[i]] = oldState[i]. */
type Perm = number[];

function layerPerm(axis: number, sign: 1 | -1, layers: number[]): Perm {
  // Clockwise as seen from the face at +axis*sign. Seen from -axis, CW about -axis = CCW about +axis.
  const perm: Perm = [];
  STICKERS.forEach((s, i) => {
    if (!layers.includes(s.pos[axis])) { perm[i] = i; return; }
    let p = s.pos, n = s.normal;
    const turns = sign === 1 ? 1 : 3;
    for (let t = 0; t < turns; t++) { p = rotCW(p, axis); n = rotCW(n, axis); }
    perm[i] = stickerIndex(p, n);
  });
  return perm;
}

/** Base (single clockwise quarter-turn) permutations for every supported move family. */
const BASE: Record<string, Perm> = {
  U: layerPerm(1, 1, [1]),
  D: layerPerm(1, -1, [-1]),
  R: layerPerm(0, 1, [1]),
  L: layerPerm(0, -1, [-1]),
  F: layerPerm(2, 1, [1]),
  B: layerPerm(2, -1, [-1]),
  u: layerPerm(1, 1, [1, 0]),
  d: layerPerm(1, -1, [-1, 0]),
  r: layerPerm(0, 1, [1, 0]),
  l: layerPerm(0, -1, [-1, 0]),
  f: layerPerm(2, 1, [1, 0]),
  b: layerPerm(2, -1, [-1, 0]),
  M: layerPerm(0, -1, [0]),
  E: layerPerm(1, -1, [0]),
  S: layerPerm(2, 1, [0]),
  x: layerPerm(0, 1, [-1, 0, 1]),
  y: layerPerm(1, 1, [-1, 0, 1]),
  z: layerPerm(2, 1, [-1, 0, 1]),
};

export interface ParsedMove {
  family: string; // key into BASE
  amount: 1 | 2 | 3; // number of clockwise quarter turns
}

const MOVE_RE = /^([URFDLBurfdlbMESxyz])(w?)(\d*)('?)$/;

export function parseMove(token: string): ParsedMove {
  const m = MOVE_RE.exec(token.trim());
  if (!m) throw new Error(`Unrecognised move "${token}"`);
  let family = m[1];
  if (m[2]) family = family.toLowerCase(); // Rw -> r
  let n = m[3] ? parseInt(m[3], 10) : 1;
  if (m[4]) n = -n;
  const amount = (((n % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  if (amount === 0) throw new Error(`Move "${token}" is a no-op`);
  return { family, amount };
}

/** Split an algorithm string into move tokens, ignoring brackets/parentheses. */
export function tokenize(alg: string): string[] {
  return alg
    .replace(/[()[\]]/g, ' ')
    .replace(/’/g, "'")
    .split(/\s+/)
    .filter(Boolean);
}

export function applyMove(state: string, move: string | ParsedMove): string {
  const pm = typeof move === 'string' ? parseMove(move) : move;
  const perm = BASE[pm.family];
  let cur = state;
  for (let t = 0; t < pm.amount; t++) {
    const next = new Array<string>(54);
    for (let i = 0; i < 54; i++) next[perm[i]] = cur[i];
    cur = next.join('');
  }
  return cur;
}

export function applyAlg(state: string, alg: string): string {
  return tokenize(alg).reduce((s, t) => applyMove(s, t), state);
}

export function invertMove(token: string): string {
  const { family, amount } = parseMove(token);
  const name = family;
  const inv = 4 - amount;
  return name + (inv === 2 ? '2' : inv === 3 ? "'" : '');
}

export function invertAlg(alg: string): string {
  return tokenize(alg).reverse().map(invertMove).join(' ');
}

/** Re-express a state so that each sticker is labelled by the face it currently sits on centre-wise. */
export function normalizeCenters(state: string): string {
  // After rotations/slices, centres move. Relabel colours so centres read U R F D L B again.
  const map = new Map<string, string>();
  FACES.forEach((f, i) => map.set(state[i * 9 + 4], f));
  return [...state].map((c) => map.get(c) ?? c).join('');
}

export function isSolved(state: string): boolean {
  for (let f = 0; f < 6; f++) {
    const c = state[f * 9 + 4];
    for (let i = 0; i < 9; i++) if (state[f * 9 + i] !== c) return false;
  }
  return true;
}

export { STICKERS };
