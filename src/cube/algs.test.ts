import { describe, expect, it } from 'vitest';
import { OLL, PLL } from './algs';
import { applyAlg, invertAlg, isSolved, normalizeCenters, SOLVED } from './facelets';
import {
  analyzeSolve, caseState, isF2LSolved, isLLOriented, orientCrossDown, recognizeOLL, recognizePLL,
} from './cfop';

const AUF = ['', 'U', 'U2', "U'"];

/** Canonical key of a state up to pre- and post-AUF (for PLL) or pre-AUF (for OLL orientation masks). */
function ollMask(state: string): string {
  // Which LL stickers show the U colour: U face (0-8) + top rows of F, R, B, L.
  const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8, 18, 19, 20, 9, 10, 11, 45, 46, 47, 36, 37, 38];
  return idx.map((i) => (state[i] === 'U' ? '1' : '0')).join('');
}
const ollKey = (s: string) => AUF.map((a) => ollMask(applyAlg(s, a))).sort()[0];
const pllKey = (s: string) => {
  const keys: string[] = [];
  // Post-AUF = a U move; pre-AUF = conjugation, realised as a y rotation + colour relabel.
  for (const y of ['', 'y', 'y2', "y'"]) for (const a of AUF) {
    keys.push(normalizeCenters(applyAlg(s, `${y} ${a}`)));
  }
  return keys.sort()[0];
};

function edgesOrientedCount(s: string) {
  return [1, 3, 5, 7].filter((i) => s[i] === 'U').length;
}
function cornersOrientedCount(s: string) {
  return [0, 2, 6, 8].filter((i) => s[i] === 'U').length;
}

describe('OLL database', () => {
  it('has 57 cases', () => expect(OLL).toHaveLength(57));

  for (const c of OLL) {
    it(`${c.id} preserves F2L and is a real OLL`, () => {
      const s = caseState(c);
      expect(isF2LSolved(s, 'D')).toBe(true);
      expect(isLLOriented(s, 'D')).toBe(false);
      // Alg actually orients the LL from its case
      expect(isLLOriented(applyAlg(s, c.alg), 'D')).toBe(true);
    });
  }

  it('all 57 cases are distinct (so the full set is covered)', () => {
    const keys = new Set(OLL.map((c) => ollKey(caseState(c))));
    expect(keys.size).toBe(57);
  });

  it('cases fall into the right orientation groups', () => {
    const groupOf = (n: number) => {
      const s = caseState(OLL[n - 1]);
      return `${edgesOrientedCount(s)}e${cornersOrientedCount(s)}c`;
    };
    for (const n of [1, 2, 3, 4, 17, 18, 19]) expect(groupOf(n), `OLL ${n}`).toMatch(/^0e[0-3]c$/);
    expect(groupOf(20)).toBe('0e4c');
    for (const n of [21, 22, 23, 24, 25, 26, 27]) expect(groupOf(n), `OLL ${n}`).toMatch(/^4e/);
    for (const n of [28, 57]) expect(groupOf(n), `OLL ${n}`).toBe('2e4c');
    for (let n = 5; n <= 56; n++) {
      if (n >= 17 && n <= 28) continue;
      expect(groupOf(n), `OLL ${n}`).toMatch(/^2e[0-3]c$/);
    }
  });
});

describe('PLL database', () => {
  it('has 21 cases', () => expect(PLL).toHaveLength(21));

  for (const c of PLL) {
    it(`${c.id} preserves F2L and orientation`, () => {
      const s = caseState(c);
      expect(isF2LSolved(s, 'D')).toBe(true);
      expect(isLLOriented(s, 'D')).toBe(true);
      expect(AUF.some((a) => isSolved(applyAlg(s, a)))).toBe(false);
      expect(isSolved(applyAlg(s, c.alg))).toBe(true);
    });
  }

  it('all 21 cases are distinct up to AUF', () => {
    expect(new Set(PLL.map((c) => pllKey(caseState(c)))).size).toBe(21);
  });

  it('edges-only and corners-only cases have the right shape', () => {
    const cornersSolvedUpToAuf = (s: string) =>
      AUF.some((a) => { const x = a ? applyAlg(s, a) : s; return [18, 20, 9, 11, 45, 47, 36, 38].every((i) => x[i] === x[Math.floor(i / 9) * 9 + 4]); });
    for (const n of ['H', 'Ua', 'Ub', 'Z']) expect(cornersSolvedUpToAuf(caseState(PLL.find((c) => c.id === `PLL ${n}`)!)), n).toBe(true);
    for (const n of ['T', 'Y', 'Aa', 'E', 'Ga', 'V']) expect(cornersSolvedUpToAuf(caseState(PLL.find((c) => c.id === `PLL ${n}`)!)), n).toBe(false);
  });
});

describe('recognition', () => {
  it('recognises every OLL under every AUF', () => {
    for (const c of OLL) for (const a of AUF) {
      const s = a ? applyAlg(caseState(c), a) : caseState(c);
      expect(recognizeOLL(s)?.case.id).toBe(c.id);
    }
  });
  it('recognises every PLL under pre and post AUF', () => {
    for (const c of PLL) for (const a of AUF) for (const b of AUF) {
      const s = applyAlg(SOLVED, `${b} ${invertAlg(c.alg)} ${a}`);
      expect(recognizePLL(s)?.case.id).toBe(c.id);
    }
  });
  it('works with a non-D cross after re-orientation', () => {
    // Build a T-perm with the white cross on U: apply x2 to a case.
    const s = applyAlg(SOLVED, `x2 ${invertAlg(PLL.find((c) => c.id === 'PLL T')!.alg)} x2`);
    expect(recognizePLL(orientCrossDown(s, 'U'))?.case.id).toBe('PLL T');
  });
});

describe('solve analysis', () => {
  it('detects cross, pairs, OLL and PLL', () => {
    // Solve built backwards: scramble = inverse of (cross-ish solution + OLL + PLL)
    const tperm = PLL.find((c) => c.id === 'PLL T')!.alg;
    const sune = OLL.find((c) => c.id === 'OLL 27')!.alg;
    const f2lBreak = "R U R' F' L' U2 L"; // breaks pairs / cross
    const solution = `${f2lBreak} ${invertAlg("U2")} ${sune} ${tperm}`;
    const start = applyAlg(SOLVED, invertAlg(solution));
    const moves = solution.split(' ').filter(Boolean).map((m, i) => ({ move: m, t: i * 100 }));
    const r = analyzeSolve(start, moves);
    expect(r.crossFace).not.toBeNull();
    expect(r.pll).toBe((moves.length - 1) * 100);
    expect(r.pairs).toHaveLength(4);
    expect(r.ollCase).toBe('OLL 27');
    expect(r.pllCase).toBe('PLL T');
  });
});
