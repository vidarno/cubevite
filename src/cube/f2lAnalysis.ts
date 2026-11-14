/**
 * F2L part of solve analysis: for each pair of a smart solve, the slot solved, its case at the
 * start of the pair, your moves vs the database alg (and whether you used it), and whether a
 * clearly shorter pair was available (pair order). Moves are in the cross-down frame.
 */
import { applyMove, invertAlg, tokenize, type Face } from './facelets';
import { orientCrossDown, solvedSlots, type CfopSplits, type TimedMove } from './cfop';
import { CROSS_DOWN_ROTATION, faceMapFor, mapMove } from './display';
import { canonicalFaceTurns, toFaceTurns } from './faceTurns';
import { F2L_SLOTS, pairStatus, recognizeF2L, slotName, type F2LSlot } from './f2lRecognize';

/** The option is flagged as better when its alg is at least this many moves shorter. */
export const ORDER_MARGIN = 3;

export interface F2LPairAnalysis {
  /** 1-based pair number. */
  pair: number;
  /** Slot(s) completed by this pair's moves (two = multislot / free pair; empty = came with the previous one). */
  slots: F2LSlot[];
  /** Moves moves[startMove .. endMove-1]. */
  startMove: number;
  endMove: number;
  /** Case of the (first) slot at the start of the pair; null when a piece was stuck in another slot. */
  caseId: string | null;
  /** The database alg in readable form for that slot: "y (U) R U' R'". */
  dbAlg: string | null;
  /** Its length in face turns (pre-AUF included). */
  dbMoves: number | null;
  /** Your moves for the pair, merged face turns. */
  yourAlg: string;
  yourMoves: number;
  /** You executed the database alg (main or alternative), ignoring AUFs. */
  usedAlg: 'main' | 'alt' | null;
  /** A free pair whose alg is at least ORDER_MARGIN moves shorter than what you did. */
  better: { slot: F2LSlot; caseId: string; moves: number } | null;
}

const stripU = (alg: string) => {
  const t = tokenize(alg);
  while (t.length && t[0][0] === 'U') t.shift();
  while (t.length && t[t.length - 1][0] === 'U') t.pop();
  return t.join(' ');
};

/** `alg` from slot frame (after `rot`) to face turns in the cross-down frame. */
const inFrame = (rot: string, alg: string) => (rot ? toFaceTurns(`${rot} ${alg} ${invertAlg(rot)}`) : toFaceTurns(alg));

export function analyzeF2L(start: string, moves: TimedMove[], sp: CfopSplits): F2LPairAnalysis[] {
  const face = sp.crossFace as Face | null;
  const crossEnd = sp.moveCounts.cross;
  if (!face || crossEnd === null) return [];
  const map = faceMapFor(CROSS_DOWN_ROTATION[face]);
  const down = moves.map((m) => mapMove(m.move, map));
  // Cross-down state after n moves, for the pair boundaries.
  const stateAt = new Map<number, string>();
  const wanted = new Set([crossEnd, ...sp.pairMoves]);
  let s = start;
  for (let i = 0; i <= Math.max(...wanted); i++) {
    if (i > 0) s = applyMove(s, moves[i - 1].move);
    if (wanted.has(i)) stateAt.set(i, orientCrossDown(s, face));
  }
  return sp.pairMoves.map((end, k) => {
    const begin = k ? sp.pairMoves[k - 1] : crossEnd;
    const from = stateAt.get(begin)!;
    const to = stateAt.get(end)!;
    const before = solvedSlots(from, 'D');
    const slots = solvedSlots(to, 'D').filter((x) => !before.includes(x)).map(slotName);
    const yourAlg = canonicalFaceTurns(down.slice(begin, end).join(' '));
    const yourMoves = tokenize(yourAlg).length;
    const r = slots[0] && pairStatus(from, slots[0]) === 'case' ? recognizeF2L(from, slots[0]) : null;
    let usedAlg: F2LPairAnalysis['usedAlg'] = null;
    if (r) {
      const mine = stripU(yourAlg);
      if (mine === stripU(inFrame(r.rotation, r.case.alg))) usedAlg = 'main';
      else if (r.case.alts?.some((a) => mine === stripU(inFrame(r.rotation, a)))) usedAlg = 'alt';
    }
    const dbMoves = r ? tokenize(r.moves).length : null;
    // Pair order: the shortest free pair at the start, if clearly shorter than what you did.
    const options = F2L_SLOTS.filter((x) => !before.includes(x)).flatMap((x) => recognizeF2L(from, x) ?? []);
    const best = options.reduce<(typeof options)[number] | null>(
      (b, o) => (!b || tokenize(o.moves).length < tokenize(b.moves).length ? o : b), null);
    const bestLen = best ? tokenize(best.moves).length : Infinity;
    const better = best && slots.length && !slots.includes(best.slot) && bestLen + ORDER_MARGIN <= (dbMoves ?? yourMoves)
      ? { slot: best.slot, caseId: best.case.id, moves: bestLen } : null;
    return {
      pair: k + 1, slots, startMove: begin, endMove: end,
      caseId: r?.case.id ?? null,
      dbAlg: r ? [r.rotation, r.preAuf && `(${r.preAuf})`, r.case.alg].filter(Boolean).join(' ') : null,
      dbMoves, yourAlg, yourMoves, usedAlg, better,
    };
  });
}
