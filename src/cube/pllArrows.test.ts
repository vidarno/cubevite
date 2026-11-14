import { describe, expect, it } from 'vitest';
import { applyMove, SOLVED } from './facelets';
import { caseState } from './cfop';
import { PLL } from './algs';
import { pllArrows, pllPermutation } from './pllArrows';
import { faceletsToPatternData, patternDataToFacelets } from './kpattern';
import { solvedUpToAuf } from './states';

/** Cycle structure per orbit, e.g. "c:3 e:-" (3-cycle of corners, edges untouched) or "c:2+2". */
function signature(dest: number[]): string {
  const seen = new Set<number>();
  const cycles: number[] = [];
  for (let i = 0; i < dest.length; i++) {
    if (seen.has(i) || dest[i] === i) continue;
    let n = 0;
    for (let j = i; !seen.has(j); j = dest[j]) { seen.add(j); n++; }
    cycles.push(n);
  }
  return cycles.length ? cycles.sort().join('+') : '-';
}

// Standard chart: what moves in each PLL.
const EXPECTED: Record<string, string> = {
  Aa: 'c:3 e:-', Ab: 'c:3 e:-', E: 'c:2+2 e:-',
  H: 'c:- e:2+2', Z: 'c:- e:2+2', Ua: 'c:- e:3', Ub: 'c:- e:3',
  T: 'c:2 e:2', F: 'c:2 e:2', Ja: 'c:2 e:2', Jb: 'c:2 e:2', Ra: 'c:2 e:2', Rb: 'c:2 e:2',
  V: 'c:2 e:2', Y: 'c:2 e:2', Na: 'c:2 e:2', Nb: 'c:2 e:2',
  Ga: 'c:3 e:3', Gb: 'c:3 e:3', Gc: 'c:3 e:3', Gd: 'c:3 e:3',
};

/** Move the U-layer pieces as the permutation says, then undo the chosen AUF offset. */
function applyArrows(state: string): string {
  const p = pllPermutation(state)!;
  const d = faceletsToPatternData(state);
  const corners = [...d.CORNERS.pieces], edges = [...d.EDGES.pieces];
  p.corners.forEach((to, from) => (corners[to] = d.CORNERS.pieces[from]));
  p.edges.forEach((to, from) => (edges[to] = d.EDGES.pieces[from]));
  return patternDataToFacelets({ CORNERS: { ...d.CORNERS, pieces: corners }, EDGES: { ...d.EDGES, pieces: edges } });
}

describe('PLL arrows', () => {
  it('match the standard chart for every PLL', () => {
    expect(Object.keys(EXPECTED).length).toBe(PLL.length);
    for (const c of PLL) {
      const p = pllPermutation(caseState(c))!;
      expect(`c:${signature(p.corners)} e:${signature(p.edges)}`, c.id).toBe(EXPECTED[c.name.replace('-perm', '')]);
    }
  });

  it('following the arrows solves the case (up to AUF)', () => {
    for (const c of PLL) for (const auf of ['', 'U', 'U2', "U'"]) {
      const s = auf ? applyMove(caseState(c), auf) : caseState(c);
      expect(solvedUpToAuf(applyArrows(s)), `${c.id} ${auf}`).toBe(true);
      // and the arrow count is the same from any angle
      expect(pllArrows(s).length).toBe(pllArrows(caseState(c)).length);
    }
  });

  it('swaps are one double-headed arrow, cycles one arrow per piece', () => {
    const t = pllArrows(caseState(PLL.find((c) => c.name === 'T-perm')!));
    expect(t).toHaveLength(2);
    expect(t.every((a) => a.swap)).toBe(true);
    const ua = pllArrows(caseState(PLL.find((c) => c.name === 'Ua-perm')!));
    expect(ua).toHaveLength(3);
    expect(ua.every((a) => a.kind === 'edge' && !a.swap)).toBe(true);
    for (const a of [...t, ...ua]) {
      expect(a.from).toBeGreaterThanOrEqual(0);
      expect(a.to).toBeLessThan(9);
      expect(a.from).not.toBe(4);
    }
  });

  it('no arrows for solved / AUF-only states', () => {
    expect(pllArrows(SOLVED)).toEqual([]);
    expect(pllArrows(applyMove(SOLVED, 'U'))).toEqual([]);
  });
});
