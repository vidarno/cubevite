import { describe, expect, it } from 'vitest';
import { ALL_CASES } from './algs';
import { applyAlg, normalizeCenters, SOLVED, tokenize } from './facelets';
import { canonicalFaceTurns, framesByToken, moveInFrame, toFaceTurns, withoutRotations } from './faceTurns';
import { OLL_EDGES_CASES, PLL_CORNERS_CASES } from './twoLook';

const SCRAMBLED = applyAlg(SOLVED, "D2 B' L2 U F2 R D' L B2 U' R2 F D2 L' B U2 R' F' D");
/** The 24 whole-cube orientations. */
const ROTATIONS = ['', 'y', 'y2', "y'"].flatMap((y) => ['', 'x', 'x2', "x'", 'z', "z'"].map((r) => `${r} ${y}`.trim()));
/** Undo the alg's net rotation (bring centres home): the state as the fixed-centre cube sees it. */
const physical = (s: string) => {
  const r = ROTATIONS.find((rot) => normalizeCenters(applyAlg(s, rot)) === applyAlg(s, rot));
  return applyAlg(s, r!);
};
const same = (alg: string, from = SOLVED) => expect(applyAlg(from, toFaceTurns(alg)), alg).toBe(physical(applyAlg(from, alg)));

describe('toFaceTurns', () => {
  it('only emits outer face turns', () => {
    expect(toFaceTurns("M2 U M U2 M' U M2 r U R' f x y z2 E S")).toMatch(/^([URFDLB][2']? ?)+$/);
  });

  it('basic conversions', () => {
    expect(toFaceTurns('r')).toBe('L');
    expect(toFaceTurns("r U r'")).toBe("L F L'");
    expect(toFaceTurns('M')).toBe("R L'");
    expect(toFaceTurns('M2')).toBe('R2 L2');
    expect(toFaceTurns("x R U")).toBe('R F');
    expect(toFaceTurns("y R U R'")).toBe("B U B'"); // after y the old back face is at R
    expect(toFaceTurns("R R")).toBe('R2');
    expect(toFaceTurns("R U U' R'")).toBe('');
    expect(toFaceTurns("L R L")).toBe('R L2');
    expect(toFaceTurns("U D R R' U'")).toBe('D');
  });

  it('every DB alg (main + alternatives) gives the same state, from solved and from a scramble', () => {
    const algs = [...ALL_CASES, ...OLL_EDGES_CASES, ...PLL_CORNERS_CASES].flatMap((c) => [c.alg, ...(c.alts ?? [])]);
    expect(algs.length).toBeGreaterThan(80);
    for (const a of algs) { same(a); same(a, SCRAMBLED); }
  });

  it('random algs with every move type', () => {
    const fams = ['U', 'D', 'R', 'L', 'F', 'B', 'u', 'd', 'r', 'l', 'f', 'b', 'Rw', 'M', 'E', 'S', 'x', 'y', 'z'];
    let seed = 5;
    const rnd = (n: number) => (seed = (seed * 16807) % 2147483647) % n;
    for (let i = 0; i < 300; i++) {
      const alg = Array.from({ length: 12 }, () => fams[rnd(fams.length)] + ['', '2', "'"][rnd(3)]).join(' ');
      same(alg);
      same(alg, SCRAMBLED);
    }
  });

  it('face-turn algs are canonicalised, not changed in effect', () => {
    const t = "R U R' U' R' F R2 U' R' U' R U R' F'";
    expect(canonicalFaceTurns(t)).toBe(t);
    expect(canonicalFaceTurns("D U R")).toBe('U D R');
    expect(tokenize(toFaceTurns("M2 U M2 U2 M2 U M2"))).toHaveLength(11); // H perm: 4x (R2 L2) + D U2 D (M2 swaps U and D)
  });
});

describe('withoutRotations', () => {
  it('takes the x out of Ab and renames the later moves', () => {
    expect(withoutRotations("x R2 D2 R U R' D2 R U' R x'")).toBe("R2 B2 R F R' B2 R F' R");
  });

  it('keeps wide moves and slices, renamed', () => {
    expect(withoutRotations("y r U R'")).toBe("b U B'"); // after y, the R letter is the old B face
    expect(withoutRotations("x M U")).toBe("M F"); // M stays M under x (same axis)
    expect(withoutRotations("y M")).toBe('S'); // after y, the L letter is the old F face: M turns like F = S
    expect(withoutRotations("z E")).toBe("M'"); // after z, the D letter is the R face
  });

  it('leaves algs without rotations as they are', () => {
    expect(withoutRotations("R U R' U'")).toBe("R U R' U'");
    expect(withoutRotations("M2 U M U2 M' U M2")).toBe("M2 U M U2 M' U M2");
  });

  it('does what the original does on a smart cube, for every DB alg (and the 2-look ones)', () => {
    const algs = [...ALL_CASES.flatMap((c) => [c.alg, ...(c.alts ?? [])]),
      ...[...OLL_EDGES_CASES, ...PLL_CORNERS_CASES].flatMap((c) => [c.alg, ...(c.alts ?? [])])].filter(Boolean) as string[];
    for (const alg of algs) {
      const out = withoutRotations(alg);
      expect(tokenize(out).some((t) => /^[xyz]/.test(t)), alg).toBe(false);
      // What the smart cube sees (some algs end rotated; without rotations you just don't regrip).
      expect(normalizeCenters(applyAlg(SOLVED, out)), alg).toBe(applyAlg(SOLVED, toFaceTurns(alg)));
      expect(toFaceTurns(out), alg).toBe(toFaceTurns(alg));
    }
  });
});

describe('framesByToken / moveInFrame', () => {
  it('names a centre-fixed move as the cube is held after a rotation', () => {
    const frames = framesByToken("x R2 D2");
    expect(frames).toHaveLength(4);
    expect(moveInFrame("D'", frames[0])).toBe("D'");
    // After x the front letter is over the old D face, the D letter over the old B face.
    expect(moveInFrame("D'", frames[1])).toBe("F'");
    expect(moveInFrame('B2', frames[1])).toBe('D2');
    expect(moveInFrame('R', frames[1])).toBe('R');
  });
});
