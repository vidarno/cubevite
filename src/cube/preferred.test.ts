import { afterEach, describe, expect, it } from 'vitest';
import { CASE_BY_ID } from './algs';
import { identifyAlg } from './algId';
import { caseKind, validateCaseAlg } from './algValidate';
import { caseState } from './cfop';
import { casePlans, OLL_DRILL, PLL_CORNERS_DRILL, PLL_DRILL, toCubeFrame, twoLookHint } from './drills';
import { F2L } from './f2l';
import { applyAlg, normalizeCenters, tokenize } from './facelets';
import { toFaceTurns } from './faceTurns';
import { llHintFor } from './llHint';
import {
  caseAlgList, customAlgs, preferredFirst, setAlgPrefs, withCustom, withoutCustom, withPreferred, type AlgPrefs,
} from './preferred';
import { PLL_CORNERS_CASES } from './twoLook';

const db = (id: string) => CASE_BY_ID.get(id)!;
const JB_ALT = "R U2 R' U' R U2 L' U R' U' L";
const LEFT_SUNE = "L' U2 L U L' U L"; // OLL 27 done with the left hand

afterEach(() => setAlgPrefs({}));

describe('caseAlgList / preferredFirst', () => {
  const ua = db('PLL Ua');
  it('main, alts, own algs; the preferred one first; unknown preferences ignored', () => {
    expect(caseAlgList(ua, {})).toEqual([ua.alg, ...ua.alts!]);
    expect(caseAlgList(ua, { 'PLL Ua': { preferred: ua.alts![0] } })).toEqual([ua.alts![0], ua.alg]);
    expect(caseAlgList(ua, { 'PLL Ua': { preferred: 'R U R\'' } })).toEqual([ua.alg, ...ua.alts!]);
    expect(caseAlgList(ua, { 'PLL Ua': { preferred: 'M U', custom: ['M U'] } })).toEqual(['M U', ua.alg, ...ua.alts!]);
    expect(caseAlgList({ id: 'x', alg: 'R', alts: ['R'] }, {})).toEqual(['R']);
  });
  it('preferredFirst moves the plan with the preferred alg to the front, keeping the rest in order', () => {
    const plans = [{ alg: 'a' }, { alg: 'b' }, { alg: 'c' }];
    expect(preferredFirst('X', plans, { X: { preferred: 'c' } }).map((p) => p.alg)).toEqual(['c', 'a', 'b']);
    expect(preferredFirst('X', plans, {})).toBe(plans);
  });
});

describe('preference updates', () => {
  it('pick, add own, remove own; entries that say nothing are dropped', () => {
    let p: AlgPrefs = {};
    p = withPreferred(p, 'PLL Ua', 'alt', 'main');
    expect(p).toEqual({ 'PLL Ua': { preferred: 'alt' } });
    p = withPreferred(p, 'PLL Ua', 'main', 'main');
    expect(p).toEqual({});
    p = withCustom(p, 'PLL Jb', JB_ALT);
    p = withCustom(p, 'PLL Jb', JB_ALT);
    expect(p).toEqual({ 'PLL Jb': { preferred: JB_ALT, custom: [JB_ALT] } });
    expect(customAlgs('PLL Jb', p)).toEqual([JB_ALT]);
    p = withoutCustom(p, 'PLL Jb', JB_ALT);
    expect(p).toEqual({});
  });
  it('removing an own alg that is not preferred keeps the preference', () => {
    const p = withPreferred(withCustom({}, 'OLL 27', LEFT_SUNE), 'OLL 27', null);
    expect(p).toEqual({ 'OLL 27': { custom: [LEFT_SUNE] } });
    expect(withoutCustom(withPreferred(withCustom(p, 'OLL 27', 'X'), 'OLL 27', LEFT_SUNE), 'OLL 27', 'X'))
      .toEqual({ 'OLL 27': { preferred: LEFT_SUNE, custom: [LEFT_SUNE] } });
  });
});

describe('validateCaseAlg', () => {
  it('accepts every DB alg and alternative for its own case', () => {
    for (const c of [...CASE_BY_ID.values(), ...F2L, ...PLL_CORNERS_CASES]) {
      for (const a of [c.alg, ...(c.alts ?? [])]) expect(validateCaseAlg(c, a).ok, `${c.id}: ${a}`).toBe(true);
    }
  });
  it('accepts other working algs, with AUFs, rotations, wide moves and messy spacing', () => {
    expect(validateCaseAlg(db('PLL Jb'), JB_ALT)).toMatchObject({ ok: true, alg: JB_ALT });
    expect(validateCaseAlg(db('OLL 27'), LEFT_SUNE)).toMatchObject({ ok: true, preAuf: 'U' });
    expect(validateCaseAlg(db('PLL T'), "y2  (R U R' U') R' F R2 U' R' U' R U R' F’ y2")).toMatchObject({ ok: true, alg: "y2 R U R' U' R' F R2 U' R' U' R U R' F' y2" });
    expect(validateCaseAlg(db('OLL 45'), "Rw U Rw' U' Rw' F Rw F'").ok).toBe(false); // that's a different case
    expect(validateCaseAlg(PLL_CORNERS_CASES[0], db('PLL Aa').alg).ok).toBe(true);
    expect(validateCaseAlg(F2L[0], "U R U' R' U").ok).toBe(true);
  });
  it('rejects unparsable, empty, too long, wrong-case and F2L-breaking algs with a reason', () => {
    expect(validateCaseAlg(db('OLL 27'), 'R Q U')).toMatchObject({ ok: false, error: expect.stringContaining('"Q"') });
    expect(validateCaseAlg(db('OLL 27'), '  ')).toMatchObject({ ok: false });
    expect(validateCaseAlg(db('OLL 27'), Array(61).fill('R').join(' '))).toMatchObject({ ok: false, error: expect.stringContaining('Too long') });
    expect(validateCaseAlg(db('OLL 27'), "R U R'")).toMatchObject({ ok: false, error: expect.stringContaining('orient') });
    expect(validateCaseAlg(db('PLL T'), `${db('PLL T').alg} D`).ok).toBe(false);
    expect(validateCaseAlg(F2L[0], "R U R' U'").ok).toBe(false);
    expect(validateCaseAlg({ id: 'Cross 3', alg: 'R' }, 'R').ok).toBe(false);
  });
  it('knows the case kinds', () => {
    expect(['OLL 1', 'PLL T', 'F2L 3', '2L OLL Dot', '2L PLL Headlights', 'Cross any'].map(caseKind))
      .toEqual(['OLL', 'PLL', 'F2L', 'OLL edges', 'PLL corners', null]);
  });
});

describe('preferences in drills, hints and identification', () => {
  const run = (s: string, alg: string) => normalizeCenters(applyAlg(s, alg));

  it('casePlans puts the preferred alg first (own algs included), and every plan solves', () => {
    const c = PLL_DRILL.cases.find((x) => x.id === 'PLL Jb')!;
    const target = toCubeFrame(applyAlg(caseState(db('PLL Jb')), 'U2'));
    expect(casePlans(PLL_DRILL, c, target).map((p) => p.alg)).toEqual([c.alg]);
    setAlgPrefs(withCustom({}, 'PLL Jb', JB_ALT));
    const plans = casePlans(PLL_DRILL, c, target);
    expect(plans.map((p) => p.alg)).toEqual([JB_ALT, c.alg]);
    for (const p of plans) expect(PLL_DRILL.steps[0].isDone(toCubeFrame(run(applyAlg(caseState(db('PLL Jb')), 'U2'), `${p.preAuf} ${p.alg} ${p.postAuf}`)), c)).toBe(true);
  });

  it('OLL drill: a preferred DB alternative comes first', () => {
    const c = OLL_DRILL.cases.find((x) => x.id === 'OLL 27')!;
    setAlgPrefs(withCustom({}, 'OLL 27', LEFT_SUNE));
    expect(casePlans(OLL_DRILL, c, toCubeFrame(caseState(db('OLL 27'))))[0]).toMatchObject({ alg: LEFT_SUNE, preAuf: 'U' });
  });

  it('2-look hint: Headlights with Aa preferred shows Aa (with its own AUF), T as the alternative', () => {
    const hl = PLL_CORNERS_CASES[0];
    const s = caseState(hl);
    expect(twoLookHint('pllCorners', s)!.alg).toBe(hl.alg);
    setAlgPrefs(withPreferred({}, hl.id, hl.alts![0], hl.alg));
    const h = twoLookHint('pllCorners', s)!;
    expect(h.alg).toBe(hl.alts![0]);
    expect(h.alts!.map((a) => a.alg)).toEqual([hl.alg]);
    expect(PLL_CORNERS_DRILL.steps[0].isDone(toCubeFrame(run(s, `${h.preAuf} ${h.alg} ${h.postAuf}`)))).toBe(true);
  });

  it('Timer LL hint (full) follows the preference', () => {
    setAlgPrefs(withCustom({}, 'PLL Jb', JB_ALT));
    const h = llHintFor(caseState(db('PLL Jb')), 'full')!;
    expect(h.alg).toBe(JB_ALT);
    expect(h.isDone(run(caseState(db('PLL Jb')), `${h.preAuf} ${h.alg} ${h.postAuf}`))).toBe(true);
    expect(h.alts!.map((a) => a.alg)).toEqual([db('PLL Jb').alg]);
  });

  it('solve analysis recognises an own alg (and forgets it when removed)', () => {
    const moves = tokenize(toFaceTurns(`U ${JB_ALT}`));
    expect(identifyAlg('PLL', 'PLL Jb', moves).match).toBeNull();
    setAlgPrefs(withCustom({}, 'PLL Jb', JB_ALT));
    expect(identifyAlg('PLL', 'PLL Jb', moves).match).toMatchObject({ caseId: 'PLL Jb', custom: true });
    setAlgPrefs({});
    expect(identifyAlg('PLL', 'PLL Jb', moves).match).toBeNull();
  });
});
