import { describe, expect, it } from 'vitest';
import { F2L, type F2LGroup } from './f2l';
import { applyAlg, tokenize } from './facelets';
import { caseState, isCrossSolved, isF2LSolved, solvedSlots } from './cfop';
import { faceletsToPatternData } from './kpattern';
import { randomStateWithF2LSolvedExcept, type Rng } from './states';

/** Deterministic PRNG (mulberry32) so failures reproduce. */
function seeded(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AUF = ['', 'U', 'U2', "U'"];
const DRF = 4; // cubing.js corner index
const FR = 8; // cubing.js edge index
const SLOT_CORNER = 4;
const SLOT_EDGE = 8;

/** Where the FR pair's corner and edge are (slot index + orientation). */
function pairPlace(s: string) {
  const p = faceletsToPatternData(s);
  const c = p.CORNERS.pieces.indexOf(DRF);
  const e = p.EDGES.pieces.indexOf(FR);
  return { c, co: p.CORNERS.orientation[c], e, eo: p.EDGES.orientation[e] };
}
const placeKey = (s: string) => { const p = pairPlace(s); return `${p.c}.${p.co}/${p.e}.${p.eo}`; };
/** Case identity: the pair's placement up to a pre-AUF. */
const caseKey = (s: string) => AUF.map((a) => placeKey(applyAlg(s, a))).sort()[0];

function groupOf(s: string): F2LGroup {
  const { c, co, e } = pairPlace(s);
  if (c === SLOT_CORNER) return e === SLOT_EDGE ? 'Both in slot' : 'Corner in slot';
  if (e === SLOT_EDGE) return 'Edge in slot';
  if (co === 0) return 'White facing up';
  // Basic inserts: a single (setup-free) R U R' / F' U' F family trigger finishes the pair.
  const basic = ["U R U' R'", "U' F' U F", "R U R'", "F' U' F"];
  return AUF.some((a) => basic.some((b) => isF2LSolved(applyAlg(s, `${a} ${b}`), 'D'))) ? 'Basic inserts' : 'White facing side';
}

describe('F2L database', () => {
  it('has 41 cases with ids F2L 1..41', () => {
    expect(F2L).toHaveLength(41);
    expect(F2L.map((c) => c.id)).toEqual(F2L.map((_, i) => `F2L ${i + 1}`));
  });

  for (const c of F2L) {
    it(`${c.id}: only the FR slot is unsolved, and every alg solves it`, () => {
      const s = caseState(c);
      expect(isCrossSolved(s, 'D')).toBe(true);
      expect(solvedSlots(s, 'D').sort()).toEqual(['FL', 'LB', 'BR'].sort());
      for (const alg of [c.alg, ...(c.alts ?? [])]) {
        expect(isF2LSolved(applyAlg(s, alg), 'D'), alg).toBe(true);
        // Face turns only (no rotations / wide moves), so smart-cube moves compare directly.
        for (const t of tokenize(alg)) expect(t, alg).toMatch(/^[URFDLB][2']?$/);
      }
    });
  }

  it('cases are in the group their state says', () => {
    for (const c of F2L) expect(groupOf(caseState(c)), c.id).toBe(c.group);
  });

  it('all 41 cases are distinct and cover every FR pair placement', () => {
    const keys = new Set(F2L.map((c) => caseKey(caseState(c))));
    expect(keys.size).toBe(41);
    // Sampled reachable placements (5 corner spots x 3 x 5 edge spots x 2 = 150, minus solved).
    const rng = seeded(7);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const s = randomStateWithF2LSolvedExcept('FR', 'D', rng);
      if (!isF2LSolved(s, 'D')) seen.add(caseKey(s));
    }
    expect(seen.size).toBe(41);
    for (const k of seen) expect(keys.has(k), k).toBe(true);
  });
});
