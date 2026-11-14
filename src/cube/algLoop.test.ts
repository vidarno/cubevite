import { describe, expect, it } from 'vitest';
import { algOrder, endsRotated, faceTurnCount, quarterTurns, loopMove, loopPlans, restartRep, startLoop, summarize, type LoopState } from './algLoop';
import { OLL, PLL } from './algs';
import { F2L } from './f2l';
import { applyAlg, applyMove, invertMove, parseMove, SOLVED, tokenize } from './facelets';
import { toFaceTurns } from './faceTurns';

const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
const SUNE = "R U R' U R U2 R'";

/** A display-frame (yellow top) alg as a smart cube reports it: cube-frame quarter turns. */
const asCubeTurns = (alg: string) => tokenize(toFaceTurns(`z2 ${alg} z2`)).flatMap((m) => {
  const { family, amount } = parseMove(m);
  return amount === 2 ? [family, family] : [m];
});

/** Perform moves one per 100 ms from `t0`. */
function perform(s: LoopState, state: string, moves: string[], t0 = 0) {
  let t = t0;
  for (const m of moves) { state = applyMove(state, m); t += 100; s = loopMove(s, m, state, t); }
  return { s, state, t };
}

describe('alg loop', () => {
  it('counts back-to-back reps of T-perm, timed first to last move, and notices back-to-start', () => {
    const start = applyAlg(SOLVED, "R U F' L2"); // any state works
    let r = perform(startLoop(loopPlans([T]), start), start, asCubeTurns(T));
    const n = asCubeTurns(T).length;
    expect(r.s.reps).toEqual([{ ms: (n - 1) * 100, moves: n, clean: true, plan: 0 }]);
    expect(r.s.backAfter).toBeNull();
    r = perform(r.s, r.state, asCubeTurns(T), r.t + 2000);
    expect(r.s.reps).toHaveLength(2);
    expect(r.s.reps[1].ms).toBe((n - 1) * 100); // the pause between reps isn't counted
    expect(r.s.backAfter).toBe(2); // T-perm has order 2
    expect(r.state).toBe(start);
  });

  it('Sune returns to the start after 6 reps', () => {
    let r = { s: startLoop(loopPlans([SUNE]), SOLVED), state: SOLVED, t: 0 };
    const back: (number | null)[] = [];
    for (let i = 0; i < 12; i++) { r = perform(r.s, r.state, asCubeTurns(SUNE), r.t); back.push(r.s.backAfter); }
    expect(back).toEqual([null, null, null, null, null, 6, null, null, null, null, null, 6]);
    expect(algOrder(SUNE)).toBe(6);
  });

  it('moves before a rep starts (AUF, wrong first move) just re-anchor it', () => {
    let r = perform(startLoop(loopPlans([T]), SOLVED), SOLVED, ['D', 'B']); // U and an off-alg move (display frame)
    expect(r.s.repStart).toBeNull();
    expect(r.s.reps).toEqual([]);
    r = perform(r.s, r.state, asCubeTurns(T), r.t);
    expect(r.s.reps).toHaveLength(1);
    expect(r.s.reps[0].clean).toBe(true);
    // The cycle starts where the rep did (after the AUF), so two T-perms are "back to start".
    r = perform(r.s, r.state, asCubeTurns(T), r.t);
    expect(r.s.backAfter).toBe(2);
  });

  it('a wrong turn inside a rep shows the undo and makes the rep unclean', () => {
    const moves = asCubeTurns(T);
    let r = perform(startLoop(loopPlans([T]), SOLVED), SOLVED, moves.slice(0, 4));
    r = perform(r.s, r.state, ['F']);
    expect(r.s.follow.progress[0].fix.length).toBe(1);
    r = perform(r.s, r.state, ["F'", ...moves.slice(4)], r.t);
    expect(r.s.reps).toHaveLength(1);
    expect(r.s.reps[0].clean).toBe(false);
    expect(r.s.reps[0].moves).toBe(moves.length + 2);
    expect(summarize(r.s.reps)).toEqual({ reps: 1, clean: 0, best: null, mean: null });
  });

  it('undoing a started rep back to its start resets it', () => {
    const moves = asCubeTurns(T);
    let r = perform(startLoop(loopPlans([T]), SOLVED), SOLVED, moves.slice(0, 2));
    expect(r.s.repStart).not.toBeNull();
    r = perform(r.s, r.state, moves.slice(0, 2).reverse().map(invertMove)); // undo both
    expect(r.s.repStart).toBeNull();
    expect(r.s.repMoves).toBe(0);
  });

  it('follows whichever alternative is done', () => {
    const c = PLL.find((x) => x.alts?.length)!;
    const plans = loopPlans([c.alg, ...(c.alts ?? [])]);
    const r = perform(startLoop(plans, SOLVED), SOLVED, asCubeTurns(c.alts![0]));
    expect(r.s.reps).toHaveLength(1);
    expect(r.s.reps[0].plan).toBe(1);
  });

  it('restartRep drops the current rep but keeps completed ones', () => {
    let r = perform(startLoop(loopPlans([T]), SOLVED), SOLVED, asCubeTurns(T));
    r = perform(r.s, r.state, asCubeTurns(T).slice(0, 3), r.t);
    const s = restartRep(r.s, r.state);
    expect(s.reps).toHaveLength(1);
    expect(s.repStart).toBeNull();
  });

  it('every OLL, PLL and F2L alg (and alt) can be looped twice', () => {
    for (const c of [...OLL, ...PLL, ...F2L]) {
      const algs = [c.alg, ...(c.alts ?? [])];
      algs.forEach((alg, i) => {
        // Algs ending rotated need a regrip between reps; the tracking is in the cube frame either way.
        let r = perform(startLoop(loopPlans(algs), SOLVED), SOLVED, asCubeTurns(alg));
        r = perform(r.s, r.state, asCubeTurns(alg), r.t);
        expect(r.s.reps.length, `${c.id} alg ${i}`).toBe(2);
        expect(r.s.reps.every((x) => x.clean), `${c.id} alg ${i}`).toBe(true);
      });
    }
  });

  it('helpers: order, rotation, face-turn count, summary', () => {
    expect(algOrder(T)).toBe(2);
    expect(algOrder('R')).toBe(4);
    expect(endsRotated(T)).toBe(false);
    expect(endsRotated("R U R' y")).toBe(true);
    expect(faceTurnCount(T)).toBe(14);
    expect(faceTurnCount("r U r'")).toBe(3);
    expect(quarterTurns(T)).toBe(15);
    expect(quarterTurns("M' U2")).toBe(4);
    expect(summarize([{ ms: 2000, moves: 14, clean: true, plan: 0 }, { ms: 1000, moves: 14, clean: true, plan: 0 }, { ms: 500, moves: 20, clean: false, plan: 0 }]))
      .toEqual({ reps: 3, clean: 2, best: 1000, mean: 1500 });
  });
});
