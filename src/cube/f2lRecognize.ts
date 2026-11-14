/**
 * F2L case recognition for any slot (cross on D, centre-normalised state).
 * The slot is brought to front-right with a y-rotation, the pair's corner and edge are located,
 * and their placement is looked up (up to a pre-AUF) among the 41 FR cases.
 */
import { applyAlg, invertAlg, normalizeCenters } from './facelets';
import { caseState } from './cfop';
import { F2L, type F2LCase } from './f2l';
import { faceletsToPatternData } from './kpattern';
import { toFaceTurns } from './faceTurns';

/** Slot names as `solvedSlots` reports them (cross on D). */
export type F2LSlot = 'RF' | 'FL' | 'LB' | 'BR';
export const F2L_SLOTS: F2LSlot[] = ['RF', 'FL', 'LB', 'BR'];

/** Rotation that brings each slot to front-right. */
export const SLOT_ROTATION: Record<F2LSlot, string> = { RF: '', BR: 'y', LB: 'y2', FL: "y'" };

const DRF = 4; // cubing.js corner index of the FR slot corner
const FR = 8; // cubing.js edge index of the FR slot edge
const U_CORNERS = [0, 1, 2, 3];
const U_EDGES = [0, 1, 2, 3];
const AUF = ['', 'U', 'U2', "U'"];

/** Accept "FR", "rf", "BL"... and return the canonical slot name. */
export function slotName(slot: string): F2LSlot {
  const s = [...slot.toUpperCase()].sort().join('');
  const hit = F2L_SLOTS.find((n) => [...n].sort().join('') === s);
  if (!hit) throw new Error(`Unknown F2L slot "${slot}"`);
  return hit;
}

function placement(stateAtFR: string) {
  const p = faceletsToPatternData(stateAtFR);
  const c = p.CORNERS.pieces.indexOf(DRF);
  const e = p.EDGES.pieces.indexOf(FR);
  return { c, co: p.CORNERS.orientation[c], e, eo: p.EDGES.orientation[e] };
}
const placeKey = (p: ReturnType<typeof placement>) => `${p.c}.${p.co}/${p.e}.${p.eo}`;

let table: Map<string, F2LCase> | null = null;
/** Exact pair placement of each case state -> case. */
function caseTable() {
  if (!table) table = new Map(F2L.map((c) => [placeKey(placement(caseState(c))), c]));
  return table;
}

/** The state turned (y-rotation, colours relabelled) so that `slot` sits at front-right. */
export function toFrontRight(stateCrossDown: string, slot: F2LSlot): string {
  const rot = SLOT_ROTATION[slot];
  return rot ? normalizeCenters(applyAlg(stateCrossDown, rot)) : stateCrossDown;
}

export type PairStatus = 'solved' | 'case' | 'stuck';

/**
 * 'solved': the pair is in place. 'case': corner and edge are in the top layer or their own
 * slot (one of the 41 cases). 'stuck': a piece sits in another slot (or the cross layer) and has
 * to be taken out first.
 */
export function pairStatus(stateCrossDown: string, slot: string): PairStatus {
  const p = placement(toFrontRight(stateCrossDown, slotName(slot)));
  if (p.c === DRF && p.co === 0 && p.e === FR && p.eo === 0) return 'solved';
  const cornerFree = p.c === DRF || U_CORNERS.includes(p.c);
  const edgeFree = p.e === FR || U_EDGES.includes(p.e);
  return cornerFree && edgeFree ? 'case' : 'stuck';
}

export interface F2LRecognition {
  slot: F2LSlot;
  case: F2LCase;
  /** Rotation that brings the slot to front-right (the case's frame). */
  rotation: string;
  /** U turn before the case alg (in the front-right frame). */
  preAuf: string;
  /** Pre-AUF + case alg as face turns in the given (cross-down) frame: solves this slot. */
  moves: string;
}

/** Recognise the F2L case of a slot. Null when the pair is solved or a piece is stuck elsewhere. */
export function recognizeF2L(stateCrossDown: string, slot: string): F2LRecognition | null {
  const name = slotName(slot);
  if (pairStatus(stateCrossDown, name) !== 'case') return null;
  const atFR = toFrontRight(stateCrossDown, name);
  const t = caseTable();
  for (const a of AUF) {
    const c = t.get(placeKey(placement(a ? applyAlg(atFR, a) : atFR)));
    if (!c) continue;
    const rot = SLOT_ROTATION[name];
    const alg = `${a} ${c.alg}`.trim();
    return { slot: name, case: c, rotation: rot, preAuf: a, moves: rot ? toFaceTurns(`${rot} ${alg} ${invertAlg(rot)}`) : toFaceTurns(alg) };
  }
  throw new Error('recognizeF2L: placement not in the case table'); // the DB covers every placement (tested)
}

/** Every slot that is currently one of the 41 cases. */
export function recognizeF2LSlots(stateCrossDown: string): F2LRecognition[] {
  return F2L_SLOTS.flatMap((s) => recognizeF2L(stateCrossDown, s) ?? []);
}
