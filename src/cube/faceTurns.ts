/**
 * Smart-cube move form of algorithms. A fixed-centre smart cube reports only outer face turns:
 * a slice arrives as two face turns, a wide move as the opposite face turn, and rotations are
 * invisible but re-label every later move. `toFaceTurns` converts any alg to that form, so what
 * was done on the cube can be compared with the alg database.
 */
import { FACES, parseMove, tokenize, type Face } from './facelets';
import { faceMapFor } from './display';

type Rot = 'x' | 'y' | 'z';

/** Each non-face move = face turns (same amount) + a whole-cube rotation (same amount). */
const DECOMPOSE: Record<string, { faces: [Face, 1 | 3][]; rot: Rot; dir: 1 | 3 }> = {
  r: { faces: [['L', 1]], rot: 'x', dir: 1 }, // r = L x
  l: { faces: [['R', 1]], rot: 'x', dir: 3 }, // l = R x'
  u: { faces: [['D', 1]], rot: 'y', dir: 1 }, // u = D y
  d: { faces: [['U', 1]], rot: 'y', dir: 3 }, // d = U y'
  f: { faces: [['B', 1]], rot: 'z', dir: 1 }, // f = B z
  b: { faces: [['F', 1]], rot: 'z', dir: 3 }, // b = F z'
  M: { faces: [['R', 1], ['L', 3]], rot: 'x', dir: 3 }, // M = R L' x'
  E: { faces: [['U', 1], ['D', 3]], rot: 'y', dir: 3 }, // E = U D' y'
  S: { faces: [['F', 3], ['B', 1]], rot: 'z', dir: 1 }, // S = F' B z
  x: { faces: [], rot: 'x', dir: 1 },
  y: { faces: [], rot: 'y', dir: 1 },
  z: { faces: [], rot: 'z', dir: 1 },
};

const AXIS: Record<Face, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
/** Output order inside a run of same-axis moves (they commute). */
const ORDER: Face[] = ['U', 'D', 'R', 'L', 'F', 'B'];
const suffix = (n: number) => (n === 1 ? '' : n === 2 ? '2' : "'");

/** Inverse of `faceMapFor(rot)`: for each position after the rotation, the face that moved there. */
const ROT_INV: Record<Rot, Record<Face, Face>> = (() => {
  const out = {} as Record<Rot, Record<Face, Face>>;
  for (const r of ['x', 'y', 'z'] as Rot[]) {
    const m = faceMapFor(r);
    out[r] = {} as Record<Face, Face>;
    for (const f of FACES) out[r][m[f] as Face] = f;
  }
  return out;
})();

/**
 * Face turns per alg token, as [face, quarter turns 1..3] (before merging): a face turn gives
 * one, a wide move one, a slice two, a rotation none (it only re-labels later tokens).
 */
export function faceTurnsByToken(alg: string): [Face, number][][] {
  return walk(alg).turns;
}

/** frame[f] = physical (centre-fixed) face that the alg's face letter f refers to. */
export type Frame = Record<Face, Face>;
const IDENTITY: Frame = { U: 'U', R: 'R', F: 'F', D: 'D', L: 'L', B: 'B' };

function rotateFrame(frame: Frame, rot: Rot, turns: number): Frame {
  for (let t = 0; t < turns; t++) {
    const inv = ROT_INV[rot];
    const prev = frame;
    frame = {} as Frame;
    for (const f of FACES) frame[f] = prev[inv[f]];
  }
  return frame;
}

/** Face turns per token, and the frame before each token (plus the one after the last). */
function walk(alg: string): { turns: [Face, number][][]; frames: Frame[] } {
  let frame = IDENTITY;
  const turns: [Face, number][][] = [];
  const frames: Frame[] = [frame];
  for (const tok of tokenize(alg)) {
    const { family, amount } = parseMove(tok);
    const dec = DECOMPOSE[family];
    if (!dec) turns.push([[frame[family as Face], amount]]);
    else {
      turns.push(dec.faces.map(([f, k]) => [frame[f], (k * amount) % 4] as [Face, number]));
      frame = rotateFrame(frame, dec.rot, (dec.dir * amount) % 4);
    }
    frames.push(frame);
  }
  return { turns, frames };
}

/**
 * How the cube is held before each token (and after the last): frame[letter] = the centre-fixed
 * face under that letter. Rotations change it, and so do wide moves and slices (they move the
 * centres a smart cube's faces are named after).
 */
export const framesByToken = (alg: string): Frame[] => walk(alg).frames;

/** Name a centre-fixed move as seen in `frame` (the letter whose face it turns). */
export function moveInFrame(move: string, frame: Frame): string {
  const { family, amount } = parseMove(move);
  const letter = FACES.find((f) => frame[f] === family);
  return letter ? letter + suffix(amount) : move;
}

export const isRotation = (tok: string) => /^[xyz]/.test(tok.trim());

/** Slice letter (+ whether it turns the opposite way) for the face it follows: M like L, E like D, S like F. */
const SLICE_OF: Record<Face, [string, boolean]> = {
  L: ['M', false], R: ['M', true], D: ['E', false], U: ['E', true], F: ['S', false], B: ['S', true],
};
const SLICE_REF: Record<string, Face> = { M: 'L', E: 'D', S: 'F' };

/**
 * The alg with its whole-cube rotations taken out: later moves are renamed to the faces they turn
 * when you don't rotate (x R2 D2 R U R' D2 R U' R x' -> R2 B2 R F R' B2 R F' R). Wide moves and
 * slices are kept (renamed too). Same result on the cube as the original, centres aside.
 */
export function withoutRotations(alg: string): string {
  let frame = IDENTITY;
  const out: string[] = [];
  for (const tok of tokenize(alg)) {
    const { family, amount } = parseMove(tok);
    const dec = DECOMPOSE[family];
    if (dec && !dec.faces.length) { frame = rotateFrame(frame, dec.rot, (dec.dir * amount) % 4); continue; }
    if (SLICE_REF[family]) {
      const [slice, flip] = SLICE_OF[frame[SLICE_REF[family]]];
      out.push(slice + suffix(flip ? 4 - amount : amount));
    } else if (family === family.toLowerCase()) {
      out.push(frame[family.toUpperCase() as Face].toLowerCase() + suffix(amount));
    } else {
      out.push(frame[family as Face] + suffix(amount));
    }
  }
  return out.join(' ');
}

/** Face turns as [face, quarter turns 1..3], before merging. */
const rawFaceTurns = (alg: string): [Face, number][] => faceTurnsByToken(alg).flat();

/**
 * Merge runs of same-axis turns (they commute) into canonical order, dropping cancellations.
 * Stack invariant: each maximal same-axis block of `out` is canonical (one entry per face, in
 * ORDER, no zero turns), so a new turn only ever has to be folded into the trailing block.
 */
export function mergeFaceTurns(turns: [Face, number][]): [Face, number][] {
  const out: [Face, number][] = [];
  for (const [face, n] of turns) {
    let k = out.length;
    while (k > 0 && AXIS[out[k - 1][0]] === AXIS[face]) k--;
    const sum = new Map<Face, number>();
    for (const [f, m] of out.splice(k)) sum.set(f, m);
    sum.set(face, ((sum.get(face) ?? 0) + n) % 4);
    for (const f of ORDER) { const m = sum.get(f); if (m) out.push([f, m]); }
  }
  return out;
}

/**
 * Convert an alg (wide moves, slices, rotations) to the face-turn sequence a fixed-centre smart
 * cube reports, in canonical form (same-axis runs merged, U before D, R before L, F before B).
 * Applying it gives the same state as the alg after `normalizeCenters`.
 */
export function toFaceTurns(alg: string): string {
  return mergeFaceTurns(rawFaceTurns(alg)).map(([f, n]) => f + suffix(n)).join(' ');
}

/** Canonical face-turn form of a face-turn-only sequence (e.g. moves reported by the cube). */
export const canonicalFaceTurns = (moves: string) => toFaceTurns(moves);
