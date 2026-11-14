import { describe, expect, it } from 'vitest';
import { F2L } from './f2l';
import { applyAlg, invertAlg, normalizeCenters, SOLVED } from './facelets';
import { caseState, isCrossSolved, isF2LSolved, solvedSlots } from './cfop';
import { F2L_SLOTS, pairStatus, recognizeF2L, recognizeF2LSlots, SLOT_ROTATION, slotName } from './f2lRecognize';
import { randomStateWithCrossSolved, randomStateWithF2LSolvedExcept, type Rng } from './states';

function seeded(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const AUF = ['', 'U', 'U2', "U'"];

/** A case placed in another slot: build it at FR, then turn the cube so FR goes to `slot`. */
const atSlot = (fr: string, slot: keyof typeof SLOT_ROTATION) =>
  SLOT_ROTATION[slot] ? normalizeCenters(applyAlg(fr, invertAlg(SLOT_ROTATION[slot]))) : fr;

describe('F2L recognition', () => {
  it('slot names', () => {
    expect(slotName('FR')).toBe('RF');
    expect(slotName('bl')).toBe('LB');
    expect(slotName('RB')).toBe('BR');
    expect(() => slotName('UF')).toThrow();
  });

  it('recognises every case under every AUF in every slot, and its moves solve it', () => {
    for (const c of F2L) for (const a of AUF) for (const slot of F2L_SLOTS) {
      const s = atSlot(a ? applyAlg(caseState(c), a) : caseState(c), slot);
      expect(solvedSlots(s, 'D')).not.toContain(slot);
      const r = recognizeF2L(s, slot);
      expect(r?.case.id, `${c.id} ${a} ${slot}`).toBe(c.id);
      expect(r!.moves).toMatch(/^([URFDLB][2']? ?)+$/); // face turns only, no rotations
      expect(isF2LSolved(applyAlg(s, r!.moves), 'D'), `${c.id} ${a} ${slot}`).toBe(true);
    }
  });

  it('solved and other slots: null', () => {
    for (const slot of F2L_SLOTS) {
      expect(pairStatus(SOLVED, slot)).toBe('solved');
      expect(recognizeF2L(SOLVED, slot)).toBeNull();
    }
    const s = caseState(F2L[10]); // only FR is unsolved
    expect(recognizeF2LSlots(s).map((r) => r.slot)).toEqual(['RF']);
  });

  it('random last-slot states in any slot', () => {
    const rng = seeded(3);
    for (const slot of F2L_SLOTS) for (let i = 0; i < 150; i++) {
      const s = randomStateWithF2LSolvedExcept(slot, 'D', rng);
      if (pairStatus(s, slot) === 'solved') continue;
      const r = recognizeF2L(s, slot)!;
      expect(r.slot).toBe(slot);
      expect(isF2LSolved(applyAlg(s, r.moves), 'D')).toBe(true);
    }
  });

  it('cross-solved states: free pairs get solved without touching the cross; stuck pairs are elsewhere', () => {
    const rng = seeded(11);
    let stuck = 0;
    for (let i = 0; i < 300; i++) {
      const s = randomStateWithCrossSolved('D', rng);
      for (const slot of F2L_SLOTS) {
        const st = pairStatus(s, slot);
        if (st === 'stuck') { stuck++; expect(recognizeF2L(s, slot)).toBeNull(); continue; }
        if (st === 'solved') continue;
        const r = recognizeF2L(s, slot)!;
        const after = applyAlg(s, r.moves);
        expect(isCrossSolved(after, 'D')).toBe(true);
        expect(solvedSlots(after, 'D')).toContain(slot);
        // Slots that were solved stay solved.
        for (const o of solvedSlots(s, 'D')) expect(solvedSlots(after, 'D')).toContain(o);
      }
    }
    expect(stuck).toBeGreaterThan(0);
  });
});
