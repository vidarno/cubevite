import { describe, expect, it } from 'vitest';
import { cube3x3x3 } from 'cubing/puzzles';
import { applyAlg, applyMove, invertAlg, isSolved, normalizeCenters, SOLVED } from './facelets';
import { faceletsToPatternData } from './kpattern';
import { CROSS_DOWN_ROTATION, faceMapFor, mapMove } from './display';

const RANDOM_ALGS = [
  'R', 'U', 'F', 'D', 'L', 'B', "R'", 'U2',
  "R U R' U'", "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  "D2 B' L2 U F2 R D' L B2 U' R2 F D2 L' B U2 R' F' D",
  "L' B2 D R U' F L2 B D' R2 U F' L D2 B' R U2",
];

describe('facelet model', () => {
  it('quarter turns have order 4', () => {
    for (const m of ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'r', 'u', 'x', 'y', 'z']) {
      let s = SOLVED;
      for (let i = 0; i < 4; i++) s = applyMove(s, m);
      expect(s).toBe(SOLVED);
      expect(applyMove(SOLVED, m)).not.toBe(SOLVED);
    }
  });

  it('sexy move has order 6', () => {
    let s = SOLVED;
    for (let i = 0; i < 6; i++) s = applyAlg(s, "R U R' U'");
    expect(s).toBe(SOLVED);
  });

  it('alg followed by its inverse is identity', () => {
    for (const a of RANDOM_ALGS) expect(applyAlg(applyAlg(SOLVED, a), invertAlg(a))).toBe(SOLVED);
  });

  it('wide moves and rotations are consistent with face moves', () => {
    const s = applyAlg(SOLVED, "D' F R2");
    expect(normalizeCenters(applyAlg(s, 'r'))).toBe(normalizeCenters(applyAlg(s, "L x")));
    expect(normalizeCenters(applyAlg(s, 'M'))).toBe(normalizeCenters(applyAlg(s, "R L' x'")));
    expect(normalizeCenters(applyAlg(s, 'Rw'))).toBe(normalizeCenters(applyAlg(s, 'r')));
    expect(applyAlg(s, 'y')).toBe(applyAlg(s, "U E' D'"));
    expect(applyAlg(s, 'x')).toBe(applyAlg(s, "R M' L'"));
    expect(applyAlg(s, 'z')).toBe(applyAlg(s, "F S B'"));
  });

  it('T-perm is a PLL that swaps two corners and two edges', () => {
    const s = applyAlg(SOLVED, "R U R' U' R' F R2 U' R' U' R U R' F'");
    expect(isSolved(s)).toBe(false);
    // F2L untouched
    expect(s.slice(27, 36)).toBe('DDDDDDDDD');
    expect(s.slice(0, 9)).toBe('UUUUUUUUU');
  });

  it('known face colours after R', () => {
    const s = applyMove(SOLVED, 'R');
    // The U face right column now shows F colour
    expect(s[2] + s[5] + s[8]).toBe('FFF');
    // B face left column (as seen from behind) shows U colour
    expect(s[45] + s[48] + s[51]).toBe('UUU');
  });
});

describe('cubing.js conversion', () => {
  it('matches cubing.js move application', async () => {
    const kp = await cube3x3x3.kpuzzle();
    for (const a of RANDOM_ALGS) {
      const ours = faceletsToPatternData(applyAlg(SOLVED, a));
      const theirs = kp.defaultPattern().applyAlg(a).patternData;
      expect(ours.CORNERS, a).toEqual(theirs.CORNERS);
      expect(ours.EDGES, a).toEqual(theirs.EDGES);
    }
  });
});

describe('frame mapping', () => {
  it('re-expresses moves after a rotation', () => {
    for (const [, rot] of Object.entries(CROSS_DOWN_ROTATION)) {
      const map = faceMapFor(rot);
      const alg = "R U F' D2 L B'";
      const direct = normalizeCenters(applyAlg(SOLVED, `${alg} ${rot}`));
      const viaMap = normalizeCenters(applyAlg(SOLVED, `${rot} ${alg.split(' ').map((m) => mapMove(m, map)).join(' ')}`));
      expect(viaMap, rot).toBe(direct);
    }
  });
});
