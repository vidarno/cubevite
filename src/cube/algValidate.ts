/**
 * Checking a user-entered alg for a case: it must parse, and solve the case's state (with any
 * AUF before and after) the way the case's step needs: OLL orients the last layer, PLL solves the
 * cube, F2L solves the slot, 2-look step 1 orients the edges / permutes the corners. The first two
 * layers must be left intact. All in the cross-down frame (cross on D), like the case databases.
 */
import { caseState, isF2LSolved, isLLOriented } from './cfop';
import { applyAlg, isSolved, normalizeCenters, parseMove, tokenize } from './facelets';
import { llCornersPermuted, llEdgesOriented, llOriented } from './states';

const AUF = ['', 'U', 'U2', "U'"];
const MAX_MOVES = 60;

export type CaseKind = 'OLL' | 'PLL' | 'F2L' | 'OLL edges' | 'PLL corners';

export function caseKind(id: string): CaseKind | null {
  if (id.startsWith('2L OLL ')) return 'OLL edges';
  if (id.startsWith('2L PLL ')) return 'PLL corners';
  if (id.startsWith('OLL ')) return 'OLL';
  if (id.startsWith('PLL ')) return 'PLL';
  if (id.startsWith('F2L ')) return 'F2L';
  return null;
}

const f2l = (s: string) => isF2LSolved(s, 'D');
const DONE: Record<CaseKind, (s: string) => boolean> = {
  OLL: (s) => f2l(s) && isLLOriented(s, 'D'),
  PLL: isSolved,
  F2L: f2l,
  'OLL edges': (s) => f2l(s) && llEdgesOriented(s),
  'PLL corners': (s) => f2l(s) && llOriented(s) && llCornersPermuted(s),
};

export type AlgCheck =
  | { ok: true; alg: string; preAuf: string; postAuf: string }
  | { ok: false; error: string };

/** Validate `input` as an alg for case `c` (the DB case: its main alg defines the state). Returns the tidied alg. */
export function validateCaseAlg(c: { id: string; alg: string }, input: string): AlgCheck {
  const kind = caseKind(c.id);
  if (!kind) return { ok: false, error: `Own algs aren't supported for ${c.id}.` };
  const tokens = tokenize(input);
  if (!tokens.length) return { ok: false, error: 'Enter an alg, e.g. R U R\' U\'.' };
  if (tokens.length > MAX_MOVES) return { ok: false, error: `Too long (${tokens.length} moves, max ${MAX_MOVES}).` };
  for (const t of tokens) {
    try { parseMove(t); } catch {
      return { ok: false, error: `"${t}" isn't a move (use U R F D L B, wide r / Rw, M E S, x y z, with ' or 2).` };
    }
  }
  const alg = tokens.join(' ');
  const start = caseState(c);
  const done = DONE[kind];
  for (const preAuf of AUF) {
    for (const postAuf of AUF) {
      if (done(normalizeCenters(applyAlg(start, `${preAuf} ${alg} ${postAuf}`)))) return { ok: true, alg, preAuf, postAuf };
    }
  }
  const what: Record<CaseKind, string> = {
    OLL: 'orient the last layer', PLL: 'solve the cube', F2L: 'solve the pair',
    'OLL edges': 'orient the last-layer edges', 'PLL corners': 'permute the corners',
  };
  return { ok: false, error: `This alg doesn't ${what[kind]} for this case (from any AUF) while keeping the first two layers.` };
}
