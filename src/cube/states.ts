/**
 * Step predicates for the last layer and random-state generators for drills.
 *
 * Predicates take cross-down states (cross on D, last layer on U; see `orientCrossDown`).
 * Generators work at piece level (uniform over the free pieces, with correct permutation
 * parity and orientation sums) and return centre-normalised facelet strings.
 */
import { applyMove, FACES, isSolved, type Face } from './facelets';
import { CORNER_NAMES, EDGE_NAMES, faceletsToPatternData, patternDataToFacelets } from './kpattern';

const OPPOSITE: Record<Face, Face> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
const opposite = (f: Face) => OPPOSITE[f]; // local copy: importing cfop would make an import cycle (cfop -> twoLook -> states)

const AUF = ['', 'U', 'U2', "U'"];
const U_STICKERS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const U_EDGE_STICKERS = [1, 3, 5, 7];

/** All four U-layer edges show U on top. */
export function llEdgesOriented(s: string): boolean {
  return U_EDGE_STICKERS.every((i) => s[i] === 'U');
}

/** The whole U face is U. */
export function llOriented(s: string): boolean {
  return U_STICKERS.every((i) => s[i] === 'U');
}

/** The four U-layer pieces of one orbit (slots 0..3, which U cycles) are a U-power of solved. */
const isUCycle = (pieces: number[]) => {
  const k = (pieces[0] + 4) % 4;
  return pieces.slice(0, 4).every((p, i) => p < 4 && (p - i + 4) % 4 === k);
};

/** U-layer corners are in the right places relative to each other (headlights on all sides, up to AUF). Orientation is ignored. */
export function llCornersPermuted(s: string): boolean {
  return isUCycle(faceletsToPatternData(s).CORNERS.pieces);
}

/** The AUF that solves the cube, or null. */
export function aufToSolve(s: string): string | null {
  for (const a of AUF) if (isSolved(a ? applyMove(s, a) : s)) return a;
  return null;
}

export const solvedUpToAuf = (s: string) => aufToSolve(s) !== null;

// ---------------------------------------------------------------------------
// Random states

export type Rng = () => number;

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Parity of a permutation (0 even, 1 odd). */
export function permParity(p: number[]): number {
  const seen = new Array(p.length).fill(false);
  let parity = 0;
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = p[j]) { seen[j] = true; len++; }
    parity ^= (len - 1) & 1;
  }
  return parity;
}

/**
 * A uniformly random state where the pieces in `freeCorners` / `freeEdges` (slot indices,
 * cubing.js orbit order) are scrambled among themselves and every other piece is solved.
 */
export function randomStateWithFree(freeCorners: number[], freeEdges: number[], rng: Rng = Math.random): string {
  const corners = { pieces: [0, 1, 2, 3, 4, 5, 6, 7], orientation: new Array(8).fill(0) };
  const edges = { pieces: [...Array(12).keys()], orientation: new Array(12).fill(0) };
  const cp = shuffle([...freeCorners], rng);
  freeCorners.forEach((slot, i) => (corners.pieces[slot] = cp[i]));
  const ep = shuffle([...freeEdges], rng);
  freeEdges.forEach((slot, i) => (edges.pieces[slot] = ep[i]));

  if (permParity(corners.pieces) !== permParity(edges.pieces)) {
    const swapIn = (arr: number[], slots: number[]) => {
      [arr[slots[0]], arr[slots[1]]] = [arr[slots[1]], arr[slots[0]]];
    };
    if (freeEdges.length >= 2) swapIn(edges.pieces, freeEdges);
    else if (freeCorners.length >= 2) swapIn(corners.pieces, freeCorners);
    else throw new Error('randomStateWithFree: cannot fix parity');
  }
  // Orientations: random for all free pieces but the last, which fixes the sum.
  const orient = (arr: number[], slots: number[], mod: number) => {
    let sum = 0;
    slots.forEach((slot, i) => {
      if (i === slots.length - 1) arr[slot] = (mod - (sum % mod)) % mod;
      else { arr[slot] = Math.floor(rng() * mod); sum += arr[slot]; }
    });
  };
  orient(corners.orientation, freeCorners, 3);
  orient(edges.orientation, freeEdges, 2);
  return patternDataToFacelets({ CORNERS: corners, EDGES: edges });
}

const slotsWith = (names: string[], face: Face) => names.flatMap((n, i) => (n.includes(face) ? [i] : []));
const sameLetters = (a: string, b: string) => [...a].sort().join('') === [...b].sort().join('');

/** A uniformly random last-layer state (everything but the layer opposite the cross is solved). */
export function randomLLState(crossFace: Face = 'D', rng: Rng = Math.random): string {
  const ll = opposite(crossFace);
  return randomStateWithFree(slotsWith(CORNER_NAMES, ll), slotsWith(EDGE_NAMES, ll), rng);
}

/** A uniformly random state with the cross on `crossFace` solved. */
export function randomStateWithCrossSolved(crossFace: Face = 'D', rng: Rng = Math.random): string {
  const crossEdges = slotsWith(EDGE_NAMES, crossFace);
  const freeEdges = EDGE_NAMES.map((_, i) => i).filter((i) => !crossEdges.includes(i));
  return randomStateWithFree([0, 1, 2, 3, 4, 5, 6, 7], freeEdges, rng);
}

/**
 * A uniformly random state with cross + three F2L pairs solved; the pair for `slot`
 * (two side faces, e.g. "FR") and the last layer are scrambled.
 */
export function randomStateWithF2LSolvedExcept(slot: string, crossFace: Face = 'D', rng: Rng = Math.random): string {
  const sides = [...slot] as Face[];
  if (sides.length !== 2 || !sides.every((f) => FACES.includes(f) && f !== crossFace && f !== opposite(crossFace)) || sides[0] === opposite(sides[1]) || sides[0] === sides[1]) {
    throw new Error(`Invalid F2L slot "${slot}" for cross ${crossFace}`);
  }
  const ll = opposite(crossFace);
  const corner = CORNER_NAMES.findIndex((n) => sameLetters(n, crossFace + slot));
  const edge = EDGE_NAMES.findIndex((n) => sameLetters(n, slot));
  return randomStateWithFree([...slotsWith(CORNER_NAMES, ll), corner], [...slotsWith(EDGE_NAMES, ll), edge], rng);
}
