/**
 * Cross drill logic: random states with a chosen optimal cross length, and the result report
 * (your moves vs optimal, with the optimal solutions). Cube frame throughout; the UI maps moves
 * into the display frame.
 */
import type { Face } from './facelets';
import { crossCoordsAtDistance, crossDistance, crossEdges, decodeCross, solveCross } from './crossSolver';
import { canonicalFaceTurns } from './faceTurns';
import { patternDataToFacelets } from './kpattern';
import { permParity, type Rng } from './states';

const shuffle = <T>(a: T[], rng: Rng): T[] => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * A uniformly random state (all pieces) whose cross on `face` needs exactly `moves` turns.
 * Picks a cross position at that distance, then fills in every other piece at random.
 */
export function randomStateWithCrossLength(face: Face, moves: number, rng: Rng = Math.random): string {
  const coords = crossCoordsAtDistance(face, moves);
  if (!coords.length) throw new Error(`No cross is ${moves} moves away`);
  const cross = decodeCross(coords[Math.floor(rng() * coords.length)]);
  const crossPieces = crossEdges(face);
  const edges = { pieces: new Array<number>(12).fill(-1), orientation: new Array<number>(12).fill(0) };
  crossPieces.forEach((piece, k) => {
    edges.pieces[cross[k] >> 1] = piece;
    edges.orientation[cross[k] >> 1] = cross[k] & 1;
  });
  const freeSlots = edges.pieces.flatMap((p, slot) => (p < 0 ? [slot] : []));
  const others = shuffle([...Array(12).keys()].filter((p) => !crossPieces.includes(p)), rng);
  freeSlots.forEach((slot, i) => (edges.pieces[slot] = others[i]));
  const corners = { pieces: shuffle([...Array(8).keys()], rng), orientation: new Array<number>(8).fill(0) };
  if (permParity(corners.pieces) !== permParity(edges.pieces)) {
    [corners.pieces[0], corners.pieces[1]] = [corners.pieces[1], corners.pieces[0]];
  }
  let twist = 0;
  for (let i = 0; i < 7; i++) { corners.orientation[i] = Math.floor(rng() * 3); twist += corners.orientation[i]; }
  corners.orientation[7] = (3 - (twist % 3)) % 3;
  let flip = crossPieces.reduce((s, _, k) => s + (cross[k] & 1), 0);
  freeSlots.forEach((slot, i) => {
    const o = i === freeSlots.length - 1 ? flip % 2 : Math.floor(rng() * 2);
    edges.orientation[slot] = o;
    flip += o;
  });
  return patternDataToFacelets({ CORNERS: corners, EDGES: edges });
}

/** A uniformly random state whose cross isn't already solved (real length distribution). */
export function randomUnsolvedCrossState(face: Face, rng: Rng = Math.random): string {
  // P(length = d) is proportional to the number of cross positions at d.
  const counts = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => crossCoordsAtDistance(face, d).length);
  let r = rng() * counts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < counts.length; i++) { r -= counts[i]; if (r < 0) return randomStateWithCrossLength(face, i + 1, rng); }
  return randomStateWithCrossLength(face, 8, rng);
}

export interface CrossReport {
  /** Your moves in face-turn metric (merged: R R = R2 = 1 move, R R' = 0). */
  yourMoves: number;
  /** Your moves as one canonical face-turn string. */
  yourAlg: string;
  optimal: number;
  /** Optimal solutions (cube frame). */
  solutions: string[];
}

export function crossReport(start: string, moves: string[], face: Face, maxSolutions = 4): CrossReport {
  const yourAlg = canonicalFaceTurns(moves.join(' '));
  return {
    yourAlg,
    yourMoves: yourAlg ? yourAlg.split(' ').length : 0,
    optimal: crossDistance(start, face),
    solutions: solveCross(start, face, maxSolutions),
  };
}
