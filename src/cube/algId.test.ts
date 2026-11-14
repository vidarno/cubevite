import { describe, expect, it } from 'vitest';
import { applyAlg, invertAlg, SOLVED, tokenize } from './facelets';
import { toFaceTurns } from './faceTurns';
import { algKey, identificationLabel, identifyAlg, matchLabel, stripAuf } from './algId';
import { CASE_BY_ID, OLL, PLL, type AlgCase } from './algs';
import { OCLL_CASES, OLL_EDGES_CASES, PLL_CORNERS_CASES, PLL_EDGES_CASES } from './twoLook';
import { analyzeSolve, type LLStepKind, type TimedMove } from './cfop';

/** Smart-cube report of an alg: face turns, half turns as two quarter turns. */
const reported = (alg: string) =>
  tokenize(toFaceTurns(alg)).flatMap((m) => (m.endsWith('2') ? [m[0], m[0]] : [m]));

const SETS: [LLStepKind, AlgCase[]][] = [
  ['OLL', OLL], ['PLL', PLL], ['OLL edges', OLL_EDGES_CASES], ['OCLL', OCLL_CASES],
  ['PLL corners', PLL_CORNERS_CASES], ['PLL edges', PLL_EDGES_CASES],
];

const conj = (rot: string, alg: string) => algKey(toFaceTurns(`${rot} ${alg} ${rot ? invertAlg(rot) : ''}`));

describe('stripAuf', () => {
  it('drops U turns from the leading and trailing U/D blocks only', () => {
    expect(stripAuf(['U', 'R', 'U', "R'", "U'"])).toEqual(['R', 'U', "R'"]);
    expect(stripAuf(['U2', "D'", 'R', 'U', 'D'])).toEqual(["D'", 'R', 'D']);
    expect(stripAuf(['U', 'U'])).toEqual([]);
    expect(algKey("U R U R' U' U'")).toBe("R U R'");
  });
});

describe('identifyAlg', () => {
  it('every DB alg + alternative is identified as its case, with any AUFs, from any side, as quarter turns', () => {
    for (const [kind, cases] of SETS) {
      for (const c of cases) {
        [c.alg, ...(c.alts ?? [])].forEach((alg, i) => {
          for (const rot of ['', 'y', 'y2', "y'"]) {
            for (const [pre, post] of [['', ''], ['U', "U'"], ['U2', 'U'], ["U'", 'U2']]) {
              const id = identifyAlg(kind, c.id, reported(`${pre} ${rot} ${alg} ${post}`));
              const msg = `${kind} ${c.id} alt ${i - 1} ${rot}`;
              expect(id.match, msg).toMatchObject({ caseId: c.id, alg, alt: i - 1 });
              // Symmetric algs (H-perm from the back = same moves) report the simplest equivalent rotation.
              expect(conj(id.match!.rotation, alg), msg).toBe(conj(rot, alg));
            }
          }
        });
      }
    }
  });

  it('reports move count and reference length for an own alg', () => {
    const sexy6 = Array(6).fill("R U R' U'").join(' ');
    const id = identifyAlg('OLL', 'OLL 27', reported(`U ${sexy6} ${CASE_BY_ID.get('OLL 27')!.alg}`));
    expect(id.match).toBeNull();
    expect(id.refMoves).toBe(7);
    expect(id.moves).toBe(7 + 24);
    expect(identificationLabel(id)).toBe('own alg, 31 moves (DB 7)');
  });

  it('immediate cancellations do not hide the alg', () => {
    const id = identifyAlg('PLL', 'PLL T', reported("R U R' U' R' F F' F R2 U' R' U' R U R' F'"));
    expect(id.match?.caseId).toBe('PLL T');
  });

  it('a 1-look step done as two 2-look algs is reported as such', () => {
    const id = identifyAlg('OLL', null, reported("F R U R' U' F' U2 R U2 R' U' R U' R'"));
    expect(id.match).toBeNull();
    expect(id.twoLook?.map((m) => m.caseId)).toEqual(['2L OLL Line', 'OLL 26']);
    expect(identificationLabel(id)).toBe('2-look: Line + OLL 26 (Antisune)');
  });

  it('labels', () => {
    const m = (caseId: string, alg: string, alt = -1, rotation = '') => ({ caseId, alg, alt, rotation });
    expect(matchLabel(m('OLL 27', ''))).toBe('OLL 27 (Sune)');
    expect(matchLabel(m('OLL 33', ''))).toBe('OLL 33');
    expect(matchLabel(m('PLL T', '', -1, 'y2'))).toBe('T-perm (from y2)');
    expect(matchLabel(m('PLL Ua', '', 0))).toBe('Ua-perm (alt 1)');
    expect(matchLabel(m('2L PLL Headlights', CASE_BY_ID.get('PLL Aa')!.alg, 0))).toBe('Headlights: Aa-perm (alt 1)');
    expect(matchLabel(m('2L OLL Dot', ''))).toBe('Dot');
  });
});

describe('alg identification in analyzeSolve', () => {
  /** A solve of `parts` done with the cross on `crossFace` (`rot` brings D there), 100 ms per move. */
  function solveOf(parts: string[], rot = '') {
    const moves: TimedMove[] = [];
    for (const p of parts) for (const m of reported(`${rot} ${p} ${rot ? invertAlg(rot) : ''}`)) moves.push({ move: m, t: (moves.length + 1) * 100 });
    const start = applyAlg(SOLVED, invertAlg(moves.map((m) => m.move).join(' ')));
    return analyzeSolve(start, moves);
  }

  it('2-look steps get their algs, also with the cross on another face', () => {
    const parts = ["F R U R' U' F'", "U R U R' U R U2 R'", "U2 R U R' U' R' F R2 U' R' U' R U R' F'", "M2 U M U2 M' U M2 U'"];
    for (const [rot, face] of [['', 'D'], ['z2', 'U'], ['x', 'B'], ["x'", 'F'], ['z', 'R'], ["z'", 'L']]) {
      const r = solveOf(parts, rot);
      expect(r.crossFace).toBe(face);
      expect(r.llSteps!.map((s) => s.alg && identificationLabel(s.alg))).toEqual(['Line', 'OLL 27 (Sune)', 'Headlights: T-perm', 'Ua-perm']);
    }
  });

  it('1-look steps: DB alg from the back, and an own alg', () => {
    const r = solveOf(["y2 R U R' U' R' F R F' y2", `${Array(6).fill("R U R' U'").join(' ')} ${CASE_BY_ID.get('PLL Jb')!.alg}`]);
    const [oll, pll] = r.llSteps!;
    expect([oll.kind, oll.caseId, oll.alg?.match?.rotation]).toEqual(['OLL', 'OLL 33', 'y2']);
    expect([pll.kind, pll.caseId, pll.alg?.match]).toEqual(['PLL', 'PLL Jb', null]);
    expect(identificationLabel(pll.alg!)).toBe('own alg, 37 moves (DB 13)');
  });
});
