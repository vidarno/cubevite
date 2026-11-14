/**
 * CFOP stage detection and last-layer case recognition.
 * All functions take centre-normalised facelet strings (fixed centres, as reported by smart cubes).
 */
import { applyAlg, applyMove, FACES, invertAlg, isSolved, normalizeCenters, SOLVED, type Face } from './facelets';
import { CORNER_NAMES, CORNER_STICKERS, EDGE_NAMES, EDGE_STICKERS } from './kpattern';
import { OLL, PLL, type AlgCase } from './algs';
import { llCornersPermuted, llEdgesOriented, llOriented, solvedUpToAuf } from './states';
import { classifyStep } from './twoLook';
import { identifyAlg, type AlgIdentification } from './algId';
import { CROSS_DOWN_ROTATION, faceMapFor, mapMove } from './display';

const OPPOSITE: Record<Face, Face> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
export const opposite = (f: Face) => OPPOSITE[f];

const faceOfSticker = (i: number) => FACES[Math.floor(i / 9)];
const pieceSolved = (state: string, stickers: number[]) => stickers.every((s) => state[s] === faceOfSticker(s));

export function isCrossSolved(state: string, face: Face): boolean {
  return EDGE_NAMES.every((n, i) => !n.includes(face) || pieceSolved(state, EDGE_STICKERS[i]));
}

/** The four F2L slots around a cross face, each = (corner index, edge index). */
function slotsFor(face: Face): { corner: number; edge: number; name: string }[] {
  const out: { corner: number; edge: number; name: string }[] = [];
  CORNER_NAMES.forEach((cn, ci) => {
    if (!cn.includes(face)) return;
    const sides = [...cn].filter((c) => c !== face);
    const ei = EDGE_NAMES.findIndex((en) => en.length === 2 && sides.every((s) => en.includes(s)));
    out.push({ corner: ci, edge: ei, name: sides.join('') });
  });
  return out;
}

export function solvedSlots(state: string, face: Face): string[] {
  return slotsFor(face)
    .filter((s) => pieceSolved(state, CORNER_STICKERS[s.corner]) && pieceSolved(state, EDGE_STICKERS[s.edge]))
    .map((s) => s.name);
}

export function isF2LSolved(state: string, face: Face): boolean {
  return isCrossSolved(state, face) && solvedSlots(state, face).length === 4;
}

export function isLLOriented(state: string, crossFace: Face): boolean {
  const ll = opposite(crossFace);
  const f = FACES.indexOf(ll);
  for (let i = 0; i < 9; i++) if (state[f * 9 + i] !== ll) return false;
  return true;
}

/** Faces whose cross is currently solved. */
export function solvedCrosses(state: string): Face[] {
  return FACES.filter((f) => isCrossSolved(state, f));
}

/** Rotation that brings the given face to D. */
const TO_DOWN: Record<Face, string> = { D: '', U: 'z2', F: "x'", B: 'x', R: 'z', L: "z'" };

/** Re-orient a state so the given cross face is on D (and relabel colours accordingly). */
export function orientCrossDown(state: string, crossFace: Face): string {
  return TO_DOWN[crossFace] ? normalizeCenters(applyAlg(state, TO_DOWN[crossFace])) : state;
}

const AUF = ['', 'U', 'U2', "U'"];

/** Recognise the OLL case of a state with F2L solved on D. Returns null if already oriented. */
export function recognizeOLL(stateCrossDown: string): { case: AlgCase; preAuf: string } | null {
  if (isLLOriented(stateCrossDown, 'D')) return null;
  for (const c of OLL) {
    for (const a of AUF) {
      const s = normalizeCenters(applyAlg(stateCrossDown, `${a} ${c.alg}`));
      if (isLLOriented(s, 'D')) return { case: c, preAuf: a };
    }
  }
  return null;
}

/** Recognise the PLL case of a state with F2L solved and LL oriented (cross on D). */
export function recognizePLL(stateCrossDown: string): { case: AlgCase; preAuf: string; postAuf: string } | null {
  for (const a of AUF) if (isSolved(applyAlg(stateCrossDown, a))) return null; // only AUF needed
  for (const c of PLL) {
    for (const a of AUF) {
      const s = applyAlg(stateCrossDown, `${a} ${c.alg}`);
      for (const b of AUF) {
        if (isSolved(b ? applyMove(s, b) : s)) return { case: c, preAuf: a, postAuf: b };
      }
    }
  }
  return null;
}

/** State that a case's algorithm solves (setup = inverse of the alg applied to solved). */
const caseCache = new Map<string, string>();
export function caseState(c: Pick<AlgCase, 'alg'>): string {
  let s = caseCache.get(c.alg);
  if (!s) caseCache.set(c.alg, (s = normalizeCenters(applyAlg(SOLVED, invertAlg(c.alg)))));
  return s;
}

// ---------------------------------------------------------------------------
// Solve analysis

export interface TimedMove {
  move: string;
  t: number; // ms since solve start
}

export interface CfopSplits {
  crossFace: Face | null;
  /** ms timestamps (since start) when each stage completed */
  cross: number | null;
  pairs: number[]; // completion time of 1st, 2nd, 3rd, 4th pair
  pairMoves: number[]; // move index (exclusive) at which each pair completed
  oll: number | null;
  pll: number | null;
  /** move index (exclusive) at which each stage completed */
  moveCounts: { cross: number | null; f2l: number | null; oll: number | null; pll: number | null };
  ollCase: string | null;
  pllCase: string | null;
  /**
   * Last-layer sub-steps in order (absent on solves analysed before this existed). 1-look: one
   * 'OLL' / 'PLL' step; 2-look: 'OLL edges' + 'OCLL' / 'PLL corners' + 'PLL edges'. Skips have no step.
   */
  llSteps?: LLStep[];
}

export type LLStepKind = 'OLL' | 'OLL edges' | 'OCLL' | 'PLL' | 'PLL corners' | 'PLL edges';

export interface LLStep {
  kind: LLStepKind;
  /** Case at the start of the step, e.g. "2L OLL Line", "OLL 26", "PLL T" (null if unrecognised). */
  caseId: string | null;
  /** ms since solve start: when the step's start state was reached / when it was completed. */
  start: number;
  end: number;
  /** Move indices: the step's moves are moves[startMove .. endMove-1]. */
  startMove: number;
  endMove: number;
  /** Which alg was executed (absent on solves analysed before this existed). */
  alg?: AlgIdentification;
}

/**
 * Split the last layer into 1-look / 2-look sub-steps from the cross-down states after each move
 * (`states[i]` = after i moves, `times[i]` = when it was reached). `f2l`, `oll`, `pll` = move
 * indices where F2L / OLL / the solve completed.
 * 2-look OLL = between F2L and OLL there is a state with F2L intact and the LL edges (but not all
 * corners) oriented, while the edges weren't oriented at F2L. 2-look PLL likewise with "corners
 * permuted, not solved up to AUF". The first such state ends step 1.
 * With `moves` (cross-down face turns, `moves[i]` takes `states[i]` to `states[i+1]`) each step also
 * gets its alg identified.
 */
export function segmentLastLayer(states: string[], times: number[], f2l: number, oll: number | null, pll: number | null, moves?: string[]): LLStep[] {
  const steps: LLStep[] = [];
  const step = (kind: LLStepKind, caseId: string | null, a: number, b: number) => {
    const s: LLStep = { kind, caseId, start: times[a], end: times[b], startMove: a, endMove: b };
    if (moves) s.alg = identifyAlg(kind, caseId, moves.slice(a, b));
    steps.push(s);
  };
  const f2lOk = (i: number) => isF2LSolved(states[i], 'D');
  const caseOf = (r: ReturnType<typeof classifyStep>) => (r && r !== 'skip' ? r.case.id : null);

  if (oll !== null && oll > f2l) {
    let mid = -1;
    if (!llEdgesOriented(states[f2l])) {
      for (let i = f2l + 1; i < oll; i++) {
        if (f2lOk(i) && llEdgesOriented(states[i]) && !llOriented(states[i])) { mid = i; break; }
      }
    }
    const ollCase = recognizeOLL(states[f2l])?.case.id ?? null;
    if (mid >= 0) {
      step('OLL edges', caseOf(classifyStep('ollEdges', states[f2l])), f2l, mid);
      step('OCLL', recognizeOLL(states[mid])?.case.id ?? null, mid, oll);
    } else {
      step('OLL', ollCase, f2l, oll);
    }
  }
  if (oll !== null && pll !== null && pll > oll && !solvedUpToAuf(states[oll])) {
    let mid = -1;
    if (!llCornersPermuted(states[oll])) {
      for (let i = oll + 1; i < pll; i++) {
        const s = states[i];
        if (f2lOk(i) && llOriented(s) && llCornersPermuted(s) && !solvedUpToAuf(s)) { mid = i; break; }
      }
    }
    const pllCase = recognizePLL(states[oll])?.case.id ?? null;
    if (mid >= 0) {
      step('PLL corners', caseOf(classifyStep('pllCorners', states[oll])), oll, mid);
      step('PLL edges', recognizePLL(states[mid])?.case.id ?? null, mid, pll);
    } else {
      step('PLL', pllCase, oll, pll);
    }
  }
  return steps;
}

/**
 * Short labels for the OLL and PLL of a solve: the 1-look case ("OLL 40"), the 2-look cases
 * ("Line + OLL 27"), or the skip label; falls back to ollCase / pllCase for older solves.
 */
export function llCaseTags(sp: Pick<CfopSplits, 'ollCase' | 'pllCase' | 'llSteps'>): string[] {
  const name = (id: string | null) => (id ? id.replace(/^2L (OLL|PLL) /, '') : '?');
  const stage = (two: LLStepKind[], fallback: string | null) => {
    const subs = (sp.llSteps ?? []).filter((s) => two.includes(s.kind));
    return subs.length === 2 ? `${name(subs[0].caseId)} + ${name(subs[1].caseId)}` : fallback;
  };
  return [stage(['OLL edges', 'OCLL'], sp.ollCase), stage(['PLL corners', 'PLL edges'], sp.pllCase)]
    .filter((x): x is string => !!x);
}

/** Analyse a recorded solve: initial (scrambled) state + timed moves. */
export function analyzeSolve(start: string, moves: TimedMove[]): CfopSplits {
  const res: CfopSplits = {
    crossFace: null, cross: null, pairs: [], pairMoves: [], oll: null, pll: null,
    moveCounts: { cross: null, f2l: null, oll: null, pll: null }, ollCase: null, pllCase: null,
  };
  let s = start;
  let bestPairs = 0;
  const states: string[] = [];
  for (let i = 0; i <= moves.length; i++) {
    if (i > 0) s = applyMove(s, moves[i - 1].move);
    states.push(s);
    const t = i > 0 ? moves[i - 1].t : 0;
    if (!res.crossFace) {
      const crosses = solvedCrosses(s);
      if (crosses.length) {
        // Prefer the cross that leads to the most solved slots (handles multiple crosses).
        crosses.sort((a, b) => solvedSlots(s, b).length - solvedSlots(s, a).length);
        res.crossFace = crosses[0];
        res.cross = t;
        res.moveCounts.cross = i;
      } else continue;
    }
    const face = res.crossFace!;
    if (res.oll === null) {
      const n = isCrossSolved(s, face) ? solvedSlots(s, face).length : 0;
      while (n > bestPairs) { res.pairs.push(t); res.pairMoves.push(i); bestPairs++; }
      if (n === 4 && res.moveCounts.f2l === null) {
        res.moveCounts.f2l = i;
        res.ollCase = recognizeOLL(orientCrossDown(s, face))?.case.id ?? 'OLL skip';
      }
    }
    if (bestPairs === 4 && res.oll === null && isF2LSolved(s, face) && isLLOriented(s, face)) {
      res.oll = t;
      res.moveCounts.oll = i;
      res.pllCase = recognizePLL(orientCrossDown(s, face))?.case.id ?? 'PLL skip';
    }
    if (res.oll !== null && isSolved(s)) {
      res.pll = t;
      res.moveCounts.pll = i;
      break;
    }
  }
  const f2l = res.moveCounts.f2l;
  if (res.crossFace && f2l !== null) {
    const face = res.crossFace;
    const down = states.map((st, i) => (i >= f2l ? orientCrossDown(st, face) : ''));
    const times = states.map((_, i) => (i > 0 ? moves[i - 1].t : 0));
    const map = faceMapFor(CROSS_DOWN_ROTATION[face]);
    const downMoves = moves.map((m) => mapMove(m.move, map));
    res.llSteps = segmentLastLayer(down, times, f2l, res.moveCounts.oll, res.moveCounts.pll, downMoves);
  }
  return res;
}
