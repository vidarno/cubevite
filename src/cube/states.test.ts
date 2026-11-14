import { describe, expect, it } from 'vitest';
import { applyAlg, invertAlg, isSolved, SOLVED, FACES, type Face } from './facelets';
import { faceletsToPatternData, patternDataToFacelets } from './kpattern';
import {
  aufToSolve, llCornersPermuted, llEdgesOriented, llOriented, permParity,
  randomLLState, randomStateWithCrossSolved, randomStateWithF2LSolvedExcept, solvedUpToAuf, type Rng,
} from './states';
import { caseState, isCrossSolved, isF2LSolved, opposite, orientCrossDown, recognizeOLL, recognizePLL, solvedSlots } from './cfop';
import { CASE_BY_ID, OLL, PLL } from './algs';

/** Deterministic PRNG (mulberry32) so failures reproduce. */
function seeded(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 1000;

/** Valid 3x3 state: legal colours, matching permutation parity, orientation sums 0. */
function expectValid(s: string) {
  const d = faceletsToPatternData(s); // throws on impossible pieces
  expect(new Set(d.CORNERS.pieces).size).toBe(8);
  expect(new Set(d.EDGES.pieces).size).toBe(12);
  expect(permParity(d.CORNERS.pieces)).toBe(permParity(d.EDGES.pieces));
  expect(d.CORNERS.orientation.reduce((a, b) => a + b, 0) % 3).toBe(0);
  expect(d.EDGES.orientation.reduce((a, b) => a + b, 0) % 2).toBe(0);
  expect(patternDataToFacelets(d)).toBe(s);
}

describe('patternDataToFacelets', () => {
  it('round-trips scrambled states', () => {
    for (const a of ["R U R' U'", "D2 B' L2 U F2 R D' L B2 U' R2 F D2 L' B U2 R' F' D", "F R U' R' U' R U R' F'"]) {
      const s = applyAlg(SOLVED, a);
      expect(patternDataToFacelets(faceletsToPatternData(s))).toBe(s);
    }
  });
});

describe('LL predicates', () => {
  const ollEdges = (id: string) => llEdgesOriented(caseState(CASE_BY_ID.get(id)!));

  it('edge orientation', () => {
    expect(llEdgesOriented(SOLVED)).toBe(true);
    for (const id of ['OLL 21', 'OLL 22', 'OLL 23', 'OLL 24', 'OLL 25', 'OLL 26', 'OLL 27']) expect(ollEdges(id)).toBe(true); // OCLL
    for (const id of ['OLL 1', 'OLL 2', 'OLL 33', 'OLL 45', 'OLL 44']) expect(ollEdges(id)).toBe(false);
    expect(llEdgesOriented(applyAlg(SOLVED, invertAlg("F R U R' U' F'")))).toBe(false); // line
  });

  it('full orientation', () => {
    expect(llOriented(SOLVED)).toBe(true);
    for (const c of OLL) expect(llOriented(caseState(c))).toBe(false);
    for (const c of PLL) expect(llOriented(caseState(c))).toBe(true);
  });

  it('corner permutation (up to AUF)', () => {
    expect(llCornersPermuted(SOLVED)).toBe(true);
    expect(llCornersPermuted(applyAlg(SOLVED, 'U'))).toBe(true);
    for (const id of ['Ua', 'Ub', 'H', 'Z']) expect(llCornersPermuted(caseState(CASE_BY_ID.get(`PLL ${id}`)!))).toBe(true);
    for (const id of ['T', 'Y', 'Aa', 'E', 'V', 'Ja', 'Na', 'Ga']) expect(llCornersPermuted(caseState(CASE_BY_ID.get(`PLL ${id}`)!))).toBe(false);
    // OCLL cases only twist corners: still permuted
    expect(llCornersPermuted(caseState(CASE_BY_ID.get('OLL 27')!))).toBe(true);
  });

  it('solved up to AUF', () => {
    expect(aufToSolve(SOLVED)).toBe('');
    expect(aufToSolve(applyAlg(SOLVED, "U'"))).toBe('U');
    expect(aufToSolve(applyAlg(SOLVED, 'U2'))).toBe('U2');
    expect(solvedUpToAuf(applyAlg(SOLVED, 'R'))).toBe(false);
    for (const c of PLL) expect(solvedUpToAuf(caseState(c))).toBe(false);
  });
});

describe('random state generators', () => {
  it(`randomLLState: ${N} valid LL states, each solvable by OLL+AUF+PLL from the DB`, () => {
    const rng = seeded(1);
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) {
      const s = randomLLState('D', rng);
      expectValid(s);
      expect(isF2LSolved(s, 'D')).toBe(true);
      seen.add(s);
      const o = recognizeOLL(s);
      const oriented = o ? applyAlg(s, `${o.preAuf} ${o.case.alg}`) : s;
      expect(llOriented(oriented)).toBe(true);
      const p = recognizePLL(oriented);
      const done = p ? applyAlg(oriented, `${p.preAuf} ${p.case.alg} ${p.postAuf}`) : oriented;
      expect(solvedUpToAuf(done)).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(N * 0.95); // 62208 LL states: few repeats
  });

  it('randomLLState reaches every LL permutation (288) and orientation (216), so every LL state', () => {
    const rng = seeded(2);
    const perms = new Set<string>(), orients = new Set<string>();
    for (let i = 0; i < 20000; i++) {
      const d = faceletsToPatternData(randomLLState('D', rng));
      perms.add([...d.CORNERS.pieces.slice(0, 4), ...d.EDGES.pieces.slice(0, 4)].join());
      orients.add([...d.CORNERS.orientation.slice(0, 4), ...d.EDGES.orientation.slice(0, 4)].join());
    }
    expect(perms.size).toBe(4 * 3 * 2 * 4 * 3 * 2 / 2);
    expect(orients.size).toBe(27 * 8);
  });

  it('randomLLState hits every OLL case', () => {
    const rng = seeded(8);
    const oll = new Set<string>();
    for (let i = 0; i < 5000 && oll.size < OLL.length + 1; i++) oll.add(recognizeOLL(randomLLState('D', rng))?.case.id ?? 'skip');
    expect(oll.size).toBe(OLL.length + 1);
  });

  it('randomLLState works for any cross colour', () => {
    const rng = seeded(3);
    for (const f of FACES) {
      for (let i = 0; i < 50; i++) {
        const s = randomLLState(f, rng);
        expectValid(s);
        expect(isF2LSolved(s, f)).toBe(true);
        expect(isF2LSolved(orientCrossDown(s, f), 'D')).toBe(true);
      }
    }
  });

  it(`randomStateWithCrossSolved: ${N} valid states with only the cross guaranteed`, () => {
    const rng = seeded(4);
    let anySlot = 0;
    for (let i = 0; i < N; i++) {
      const f = FACES[i % 6] as Face;
      const s = randomStateWithCrossSolved(f, rng);
      expectValid(s);
      expect(isCrossSolved(s, f)).toBe(true);
      if (solvedSlots(s, f).length) anySlot++;
    }
    expect(anySlot).toBeLessThan(N * 0.2); // pairs are scrambled, not left solved
  });

  it(`randomStateWithF2LSolvedExcept: ${N} valid states, only the chosen slot open`, () => {
    const rng = seeded(5);
    const slots = ['FR', 'RB', 'BL', 'LF'];
    let slotSolved = 0;
    for (let i = 0; i < N; i++) {
      const slot = slots[i % 4];
      const s = randomStateWithF2LSolvedExcept(slot, 'D', rng);
      expectValid(s);
      expect(isCrossSolved(s, 'D')).toBe(true);
      const solved = solvedSlots(s, 'D').map((n) => [...n].sort().join(''));
      const others = slots.filter((x) => x !== slot).map((n) => [...n].sort().join(''));
      for (const o of others) expect(solved).toContain(o);
      if (solved.length === 4) slotSolved++;
    }
    expect(slotSolved).toBeLessThan(N * 0.1);
    expect(isSolved(randomStateWithF2LSolvedExcept('RF', 'U', seeded(6)))).toBe(false);
  });

  it('randomStateWithF2LSolvedExcept works with other cross faces and rejects bad slots', () => {
    const rng = seeded(7);
    const s = randomStateWithF2LSolvedExcept('FR', 'U', rng);
    expectValid(s);
    expect(isCrossSolved(s, 'U')).toBe(true);
    expect(solvedSlots(s, 'U').length).toBeGreaterThanOrEqual(3);
    expect(() => randomStateWithF2LSolvedExcept('FB')).toThrow();
    expect(() => randomStateWithF2LSolvedExcept('UF')).toThrow();
    expect(() => randomStateWithF2LSolvedExcept('F')).toThrow();
    expect(opposite('U')).toBe('D');
  });
});
