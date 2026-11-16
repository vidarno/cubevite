import { describe, expect, it } from 'vitest';
import { applyAlg, applyMove, isSolved, normalizeCenters, SOLVED, tokenize, type Face } from './facelets';
import { caseState, isF2LSolved, isLLOriented, orientCrossDown } from './cfop';
import { CASE_BY_ID, OLL, PLL } from './algs';
import { toFaceTurns } from './faceTurns';
import { toCubeFrame } from './drills';
import { randomStateForCase } from './twoLook';
import { f2lFace, llHintFor, LLHintTracker, TIER_DELAYS, tierDelays } from './llHint';

const run = (s: string, alg: string) => normalizeCenters(applyAlg(s, alg));
const AUF = ['', 'U', 'U2', "U'"];
const caseOf = (id: string) => CASE_BY_ID.get(id)!;
/** A cross-down state (= cube frame with the cross on D) for a DB case, with a pre-AUF. */
const llState = (id: string, auf = '') => run(caseState(caseOf(id)), auf);
/** Do an alg on a cross-down-on-D cube as a smart cube reports it. */
const turns = (alg: string) => tokenize(toFaceTurns(alg));

describe('llHintFor', () => {
  it('no hint while solved, before F2L is done, for an AUF only, or when off', () => {
    expect(llHintFor(SOLVED, '2look')).toBeNull();
    expect(llHintFor(applyAlg(SOLVED, "R U F' L2 D"), '2look')).toBeNull();
    expect(llHintFor(applyMove(SOLVED, 'U'), '2look')).toBeNull();
    expect(llHintFor(applyMove(SOLVED, 'U'), 'full')).toBeNull();
    expect(llHintFor(llState('PLL T'), 'off')).toBeNull();
  });

  it('full: every OLL and PLL case with every AUF, and the hinted alg finishes the step', () => {
    for (const c of [...OLL, ...PLL]) {
      for (const a of AUF) {
        const s = llState(c.id, a);
        const h = llHintFor(s, 'full');
        expect(h, `${c.id} ${a}`).not.toBeNull();
        expect(h!.stage).toBe(c.set);
        // Symmetric / equivalent cases may come out as another case id, but its alg must work.
        const end = run(s, `${h!.preAuf} ${h!.alg} ${h!.postAuf}`);
        expect(h!.isDone(end), `${c.id} ${a} -> ${h!.caseId}`).toBe(true);
        for (const alt of h!.alts ?? []) expect(h!.isDone(run(s, `${alt.preAuf} ${alt.alg} ${alt.postAuf}`))).toBe(true);
      }
    }
  });

  it('2-look: names the step-1 case before step 2', () => {
    for (const [step, id, stage] of [
      ['ollEdges', '2L OLL Dot', 'OLL'], ['ollEdges', '2L OLL Line', 'OLL'], ['ocll', 'OLL 27', 'OLL'],
      ['pllCorners', '2L PLL Headlights', 'PLL'], ['pllEdges', 'PLL Ua', 'PLL'],
    ] as const) {
      const s = randomStateForCase(step, id);
      const h = llHintFor(s, '2look')!;
      expect(h.caseId).toBe(id);
      expect(h.stage).toBe(stage);
      expect(h.isDone(run(s, `${h.preAuf} ${h.alg} ${h.postAuf}`))).toBe(true);
    }
    expect(llHintFor(llState('OLL 45'), '2look')!.stepLabel).toBe('OLL edges');
    expect(llHintFor(llState('PLL T'), '2look')!.stepLabel).toBe('PLL corners');
  });

  it('works for any cross colour', () => {
    for (const face of ['U', 'F', 'R', 'B', 'L', 'D'] as Face[]) {
      const s = toCubeFrame(llState('PLL Ua', 'U'), face);
      expect(f2lFace(s)).toBe(face);
      const h = llHintFor(s, 'full')!;
      expect(h.crossFace).toBe(face);
      expect(h.caseId).toBe('PLL Ua');
      expect(isF2LSolved(orientCrossDown(s, face), 'D')).toBe(true);
    }
  });
});

describe('tierDelays', () => {
  it('turns gaps in seconds into cumulative idle ms (default 5 / 5 / 5)', () => {
    expect(TIER_DELAYS).toEqual([5000, 10000, 15000]);
    expect(tierDelays([3, 0, 4])).toEqual([3000, 3000, 7000]);
  });

  it('a tracker with custom delays', () => {
    const tr = new LLHintTracker('full', false, 0, llState('PLL T'), tierDelays([1, 1, 1]));
    expect(tr.tick(999)).toBe(0);
    expect(tr.tick(3000)).toBe(3);
  });
});

describe('LLHintTracker', () => {
  it('auto tiers on idle time, then the alg is followed and the hint clears when done', () => {
    const start = llState('PLL T', 'U');
    const tr = new LLHintTracker('full', false, 0, start);
    expect(tr.tick(TIER_DELAYS[0] - 1)).toBe(0);
    expect(tr.tick(TIER_DELAYS[0])).toBe(1);
    expect(tr.tick(TIER_DELAYS[1])).toBe(2);
    expect(tr.tick(TIER_DELAYS[2])).toBe(3);
    expect(tr.used()).toEqual([{ caseId: 'PLL T', stepLabel: 'PLL', tier: 3, at: 0 }]);
    const h = tr.view()!.hint;
    let s = start;
    let t = 10_000;
    const ms = turns(`${h.preAuf} ${h.alg} ${h.postAuf}`);
    ms.forEach((m, i) => {
      s = applyMove(s, m);
      tr.push(m, s, t += 100);
      if (i === 2) expect(tr.view()!.follow!.progress.some((p) => p.done > 0 && !p.fix.length)).toBe(true);
    });
    expect(isSolved(s)).toBe(true);
    expect(tr.view()).toBeNull();
    expect(tr.used()).toHaveLength(1);
  });

  it('moving resets the idle clock; reveal steps up at once', () => {
    const start = llState('OLL 27');
    const tr = new LLHintTracker('2look', false, 0, start);
    const s = applyMove(start, 'U');
    tr.push('U', s, TIER_DELAYS[0] - 500);
    expect(tr.tick(TIER_DELAYS[0] + 100)).toBe(0);
    tr.reveal();
    tr.reveal();
    expect(tr.view()!.tier).toBe(2);
    expect(tr.used()).toEqual([{ caseId: 'OLL 27', stepLabel: 'OCLL', tier: 2, at: 1 }]);
  });

  it('an AUF keeps the case and tier; the next step starts hidden', () => {
    const start = randomStateForCase('ollEdges', '2L OLL Line');
    const tr = new LLHintTracker('2look', false, 0, start);
    tr.reveal();
    let s = applyMove(start, 'U');
    tr.push('U', s, 100);
    expect(tr.view()!.tier).toBe(1);
    expect(tr.view()!.hint.caseId).toBe('2L OLL Line');
    const h = tr.view()!.hint;
    for (const m of turns(`${h.preAuf} ${h.alg}`)) { s = applyMove(s, m); tr.push(m, s, 200); }
    const v = tr.view();
    if (v) { // null if the LL is solved up to AUF
      // Random state: corners can come out oriented (OCLL skip), then the next step is a PLL one.
      if (isLLOriented(s, 'D')) expect(v.hint.stage).toBe('PLL');
      else expect(v.hint.stepLabel).toBe('OCLL');
      expect(v.tier).toBe(0);
    }
    expect(tr.used()).toEqual([{ caseId: '2L OLL Line', stepLabel: 'OLL edges', tier: 1, at: 0 }]);
  });

  it('no hints during F2L, nothing recorded without a pause', () => {
    const tr = new LLHintTracker('2look', false, 0, applyAlg(SOLVED, "R U R' F2 D"));
    expect(tr.tick(60_000)).toBe(0);
    tr.reveal();
    expect(tr.used()).toEqual([]);
  });
});
