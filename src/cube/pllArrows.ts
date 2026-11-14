/**
 * Movement arrows for PLL diagrams: where each last-layer piece has to go.
 * Worked out from the (cross-down) state itself, choosing the final AUF that moves the fewest
 * pieces, so arrows match the usual charts even when an alg ends with a U turn.
 */
import { applyMove, SOLVED } from './facelets';
import { CORNER_STICKERS, EDGE_STICKERS, faceletsToPatternData } from './kpattern';

export type PieceKind = 'corner' | 'edge';

export interface PllArrow {
  kind: PieceKind;
  /** U-face facelet indices (0..8, row-major from the back-left) of the piece's sticker now and at its destination. */
  from: number;
  to: number;
  /** Two pieces swapping: draw one double-headed arrow (only the from<to half is listed). */
  swap: boolean;
}

const AUF = ['', 'U', 'U2', "U'"];
const U_SLOTS = [0, 1, 2, 3];
/** U-face facelet of each U-layer slot (the U sticker is the first one of every U piece). */
const CORNER_U = U_SLOTS.map((i) => CORNER_STICKERS[i][0]);
const EDGE_U = U_SLOTS.map((i) => EDGE_STICKERS[i][0]);

/** For one orbit: dest[i] = slot the piece now in slot i must move to, if the cube ends as `target`. */
function destinations(pieces: number[], targetPieces: number[]): number[] {
  return U_SLOTS.map((i) => targetPieces.indexOf(pieces[i]));
}

/**
 * Where each U-layer piece goes, as slot permutations, for the best final AUF.
 * Returns null if the U layer isn't a pure permutation of solved-up-to-AUF pieces.
 */
export function pllPermutation(stateCrossDown: string): { corners: number[]; edges: number[]; auf: string } | null {
  const d = faceletsToPatternData(stateCrossDown);
  if (![...d.CORNERS.pieces.slice(0, 4), ...d.EDGES.pieces.slice(0, 4)].every((p) => p < 4)) return null;
  let best: { corners: number[]; edges: number[]; auf: string; moved: number } | null = null;
  for (const auf of AUF) {
    // The cube ends as `solved, then AUF` (an alg with a trailing U leaves that U undone).
    const t = faceletsToPatternData(auf ? applyMove(SOLVED, invert(auf)) : SOLVED);
    const corners = destinations(d.CORNERS.pieces, t.CORNERS.pieces);
    const edges = destinations(d.EDGES.pieces, t.EDGES.pieces);
    // Fewest moved pieces; on ties, shortest longest cycle (G perms: 3+3, not 2+4).
    const moved = [...corners, ...edges].filter((dst, i) => dst !== i % 4).length * 10
      + Math.max(longestCycle(corners), longestCycle(edges));
    if (!best || moved < best.moved) best = { corners, edges, auf, moved };
  }
  const { corners, edges, auf } = best!;
  return { corners, edges, auf };
}

function longestCycle(dest: number[]): number {
  let max = 1;
  for (let i = 0; i < dest.length; i++) {
    let n = 1;
    for (let j = dest[i]; j !== i && n <= dest.length; j = dest[j]) n++;
    max = Math.max(max, n);
  }
  return max;
}

const invert = (m: string) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : m + "'");

export function pllArrows(stateCrossDown: string): PllArrow[] {
  const p = pllPermutation(stateCrossDown);
  if (!p) return [];
  const out: PllArrow[] = [];
  const add = (kind: PieceKind, dest: number[], uIdx: number[]) => {
    dest.forEach((to, from) => {
      if (to === from) return;
      const swap = dest[to] === from;
      if (swap && to < from) return; // listed once
      out.push({ kind, from: uIdx[from], to: uIdx[to], swap });
    });
  };
  add('corner', p.corners, CORNER_U);
  add('edge', p.edges, EDGE_U);
  return out;
}
