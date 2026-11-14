/**
 * F2L case database: the 41 cases for the front-right slot, cross on D (as the OLL/PLL DB:
 * cube held with the cross down, slot at front-right). Validated by tests: each alg solves its
 * case leaving the cross and the other three slots alone, the 41 cases are distinct up to AUF and
 * cover every position of the FR corner + edge.
 *
 * Numbering is CubeVite's own (by group), not a particular chart's. Cases are generated from the
 * main alg (inverse applied to solved), so picture and alg always agree; alternatives solve the
 * exact same state (same pre-AUF).
 */
import type { AlgCase } from './algs';

export type F2LGroup =
  | 'Basic inserts'
  | 'White facing up'
  | 'White facing side'
  | 'Corner in slot'
  | 'Edge in slot'
  | 'Both in slot';

export interface F2LCase extends Omit<AlgCase, 'set' | 'group'> {
  set: 'F2L';
  group: F2LGroup;
}

let n = 0;
const f2l = (group: F2LGroup, alg: string, alts?: string[]): F2LCase => {
  n++;
  return { id: `F2L ${n}`, set: 'F2L', name: `F2L ${n}`, group, alg, ...(alts ? { alts } : {}) };
};

export const F2L: F2LCase[] = [
  // Corner and edge in the top layer, pair ready to insert.
  f2l('Basic inserts', "U R U' R'"),
  f2l('Basic inserts', "U' F' U F"),
  f2l('Basic inserts', "R U R'"),
  f2l('Basic inserts', "F' U' F"),
  // Corner in the top layer with the white sticker facing up, edge in the top layer.
  f2l('White facing up', "R U R' U2 R U R' U' R U R'", ["U R U' R' U' R U' R' U R U' R'"]),
  f2l('White facing up', "F' U2 F U F' U' F"),
  f2l('White facing up', "U R U2 R' U R U' R'"),
  f2l('White facing up', "U2 F' U' F U' F' U F"),
  f2l('White facing up', "R U2 R' U' R U R'"),
  f2l('White facing up', "F U R U' R' F' R U' R'", ["F' U' F U2 F' U' F U F' U' F"]),
  f2l('White facing up', "U2 R U R' U R U' R'"),
  f2l('White facing up', "U' F' U2 F U' F' U F"),
  // Corner in the top layer with the white sticker facing sideways, edge in the top layer.
  f2l('White facing side', "U' F' U2 F U' R U R'"),
  f2l('White facing side', "U R U2 R' U F' U' F"),
  f2l('White facing side', "U F' U2 F U2 F' U F"),
  f2l('White facing side', "U' R U2 R' U2 R U' R'"),
  f2l('White facing side', "U' R U' R' U R U R'"),
  f2l('White facing side', "U F' U F U' F' U' F"),
  f2l('White facing side', "R U' R' U2 F' U' F"),
  f2l('White facing side', "F' U F U2 R U R'"),
  f2l('White facing side', "U' R U R' U R U R'"),
  f2l('White facing side', "U F' U' F U' F' U' F"),
  f2l('White facing side', "U F' U' F U2 F' U F"),
  f2l('White facing side', "U' R U R' U2 R U' R'"),
  // Corner in the slot, edge in the top layer.
  f2l('Corner in slot', "U' F' U F U R U' R'", ["U' R' F R F' R U R'"]),
  f2l('Corner in slot', "U R U' R' U' F' U F"),
  f2l('Corner in slot', "R U' R' U R U' R'"),
  f2l('Corner in slot', "F' U' F U F' U' F"),
  f2l('Corner in slot', "R U R' U' R U R'"),
  f2l('Corner in slot', "F' U F U' F' U F"),
  // Edge in the slot, corner in the top layer.
  f2l('Edge in slot', "R U R' U' R U R' U' R U R'", ["U R U' R' U R U' R' U R U' R'"]),
  f2l('Edge in slot', "U R U R' U2 R U R'"),
  f2l('Edge in slot', "U' R U' R' U2 R U' R'"),
  f2l('Edge in slot', "U' R U2 R' F' U' F"),
  f2l('Edge in slot', "F' U' F U R U' R'"),
  f2l('Edge in slot', "R U R' F R' F' R"),
  // Corner and edge both in the slot, wrongly placed.
  f2l('Both in slot', "R U' R' U F' U2 F U2 F' U F", ["R2 U2 F R2 F' U2 R' U R'"]),
  f2l('Both in slot', "R U' R' U' R U R' U2 R U' R'", ["R U R' U' R U2 R' U' R U R'"]),
  f2l('Both in slot', "R U' R' U R U2 R' U R U' R'", ["R U2 R U R' U R U2 R2"]),
  f2l('Both in slot', "R F U R U' R' F' U' R'"),
  f2l('Both in slot', "R U F R U R' U' F' R'"),
];

export const F2L_BY_ID = new Map(F2L.map((c) => [c.id, c]));
