/**
 * CFOP last-layer algorithm database. Every algorithm is validated by tests
 * (preserves F2L, cases are distinct and cover the full set).
 * Case diagrams are generated from the algorithm itself, so picture and alg always agree.
 */

export type AlgSet = 'OLL' | 'PLL';

export interface AlgCase {
  id: string; // e.g. "OLL 21", "PLL T"
  set: AlgSet;
  name: string;
  group: string;
  alg: string;
  alts?: string[];
  /** Part of the beginner-friendly 2-look subset */
  twoLook?: boolean;
}

const pll = (name: string, group: string, alg: string, extra: Partial<AlgCase> = {}): AlgCase =>
  ({ id: `PLL ${name}`, set: 'PLL', name: `${name}-perm`, group, alg, ...extra });

export const PLL: AlgCase[] = [
  pll('Aa', 'Corners only', "x R' U R' D2 R U' R' D2 R2 x'"),
  pll('Ab', 'Corners only', "x R2 D2 R U R' D2 R U' R x'"),
  pll('E', 'Corners only', "x' R U' R' D R U R' D' R U R' D R U' R' D' x"),
  pll('H', 'Edges only', 'M2 U M2 U2 M2 U M2', { twoLook: true }),
  pll('Ua', 'Edges only', "M2 U M U2 M' U M2", { twoLook: true, alts: ["R U' R U R U R U' R' U' R2"] }),
  pll('Ub', 'Edges only', "M2 U' M U2 M' U' M2", { twoLook: true, alts: ["R2 U R U R' U' R' U' R' U R'"] }),
  pll('Z', 'Edges only', "M' U M2 U M2 U M' U2 M2", { twoLook: true }),
  pll('T', 'Adjacent swap', "R U R' U' R' F R2 U' R' U' R U R' F'", { twoLook: true }),
  pll('F', 'Adjacent swap', "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"),
  pll('Ja', 'Adjacent swap', "R' U L' U2 R U' R' U2 R L"),
  pll('Jb', 'Adjacent swap', "R U R' F' R U R' U' R' F R2 U' R'"),
  pll('Ra', 'Adjacent swap', "R U' R' U' R U R D R' U' R D' R' U2 R'"),
  pll('Rb', 'Adjacent swap', "R2 F R U R U' R' F' R U2 R' U2 R"),
  pll('Ga', 'G perms', "R2 U R' U R' U' R U' R2 U' D R' U R D'"),
  pll('Gb', 'G perms', "R' U' R U D' R2 U R' U R U' R U' R2 D"),
  pll('Gc', 'G perms', "R2 U' R U' R U R' U R2 U D' R U' R' D"),
  pll('Gd', 'G perms', "R U R' U' D R2 U' R U' R' U R' U R2 D'"),
  pll('Na', 'Diagonal swap', "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"),
  pll('Nb', 'Diagonal swap', "R' U R U' R' F' U' F R U R' F R' F' R U' R"),
  pll('V', 'Diagonal swap', "R' U R' U' y R' F' R2 U' R' U R' F R F"),
  pll('Y', 'Diagonal swap', "F R U' R' U' R U R' F' R U R' U' R' F R F'", { twoLook: true }),
];

const oll = (n: number, group: string, alg: string, extra: Partial<AlgCase> = {}): AlgCase =>
  ({ id: `OLL ${n}`, set: 'OLL', name: `OLL ${n}`, group, alg, ...extra });

export const OLL: AlgCase[] = [
  oll(1, 'Dot', "R U2 R2 F R F' U2 R' F R F'"),
  oll(2, 'Dot', "F R U R' U' F' f R U R' U' f'"),
  oll(3, 'Dot', "f R U R' U' f' U' F R U R' U' F'"),
  oll(4, 'Dot', "f R U R' U' f' U F R U R' U' F'"),
  oll(5, 'Square', "r' U2 R U R' U r"),
  oll(6, 'Square', "r U2 R' U' R U' r'"),
  oll(7, 'Lightning', "r U R' U R U2 r'"),
  oll(8, 'Lightning', "l' U' L U' L' U2 l"),
  oll(9, 'Fish', "R U R' U' R' F R2 U R' U' F'"),
  oll(10, 'Fish', "R U R' U R' F R F' R U2 R'"),
  oll(11, 'Lightning', "r U R' U R' F R F' R U2 r'"),
  oll(12, 'Lightning', "M' R' U' R U' R' U2 R U' R r'"),
  oll(13, 'Knight move', "F U R U' R2 F' R U R U' R'"),
  oll(14, 'Knight move', "R' F R U R' F' R F U' F'"),
  oll(15, 'Knight move', "r' U' r R' U' R U r' U r"),
  oll(16, 'Knight move', "r U r' R U R' U' r U' r'"),
  oll(17, 'Dot', "F R' F' R2 r' U R U' R' U' M'"),
  oll(18, 'Dot', "r U R' U R U2 r2 U' R U' R' U2 r"),
  oll(19, 'Dot', "r' R U R U R' U' M' R' F R F'"),
  oll(20, 'Dot', "r U R' U' M2 U R U' R' U' M'"),
  oll(21, 'OCLL (cross)', "R U2 R' U' R U R' U' R U' R'", { twoLook: true }),
  oll(22, 'OCLL (cross)', "R U2 R2 U' R2 U' R2 U2 R", { twoLook: true }),
  oll(23, 'OCLL (cross)', "R2 D' R U2 R' D R U2 R", { twoLook: true }),
  oll(24, 'OCLL (cross)', "r U R' U' r' F R F'", { twoLook: true }),
  oll(25, 'OCLL (cross)', "F' r U R' U' r' F R", { twoLook: true }),
  oll(26, 'OCLL (cross)', "R U2 R' U' R U' R'", { twoLook: true }),
  oll(27, 'OCLL (cross)', "R U R' U R U2 R'", { twoLook: true }),
  oll(28, 'Corners oriented', "r U R' U' r' R U R U' R'"),
  oll(29, 'Awkward', "R U R' U' R U' R' F' U' F R U R'"),
  oll(30, 'Awkward', "F R' F R2 U' R' U' R U R' F2"),
  oll(31, 'P shape', "R' U' F U R U' R' F' R"),
  oll(32, 'P shape', "L U F' U' L' U L F L'"),
  oll(33, 'T shape', "R U R' U' R' F R F'"),
  oll(34, 'C shape', "R U R2 U' R' F R U R U' F'"),
  oll(35, 'Fish', "R U2 R2 F R F' R U2 R'"),
  oll(36, 'W shape', "L' U' L U' L' U L U L F' L' F"),
  oll(37, 'Fish', "F R' F' R U R U' R'"),
  oll(38, 'W shape', "R U R' U R U' R' U' R' F R F'"),
  oll(39, 'Lightning', "L F' L' U' L U F U' L'"),
  oll(40, 'Lightning', "R' F R U R' U' F' U R"),
  oll(41, 'Awkward', "R U R' U R U2 R' F R U R' U' F'"),
  oll(42, 'Awkward', "R' U' R U' R' U2 R F R U R' U' F'"),
  oll(43, 'P shape', "F' U' L' U L F"),
  oll(44, 'P shape', "F U R U' R' F'", { twoLook: true }),
  oll(45, 'T shape', "F R U R' U' F'", { twoLook: true }),
  oll(46, 'C shape', "R' U' R' F R F' U R"),
  oll(47, 'Small L', "R' U' R' F R F' R' F R F' U R"),
  oll(48, 'Small L', "F R U R' U' R U R' U' F'"),
  oll(49, 'Small L', "r U' r2 U r2 U r2 U' r"),
  oll(50, 'Small L', "r' U r2 U' r2 U' r2 U r'"),
  oll(51, 'I shape', "F U R U' R' U R U' R' F'"),
  oll(52, 'I shape', "R U R' U R U' B U' B' R'"),
  oll(53, 'Small L', "l' U2 L U L' U' L U L' U l"),
  oll(54, 'Small L', "r U2 R' U' R U R' U' R U' r'"),
  oll(55, 'I shape', "R' F R U R U' R2 F' R2 U' R' U R U R'"),
  oll(56, 'I shape', "r' U' r U' R' U R U' R' U R r' U r"),
  oll(57, 'Corners oriented', "R U R' U' M' U R U' r'"),
];

export const ALL_CASES: AlgCase[] = [...OLL, ...PLL];
export const CASE_BY_ID = new Map(ALL_CASES.map((c) => [c.id, c]));
