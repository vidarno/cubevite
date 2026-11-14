import { describe, expect, it } from 'vitest';
import { applyAlg, applyMove, invertAlg, normalizeCenters, SOLVED } from './facelets';
import { faceTurnsByToken } from './faceTurns';
import { ALL_CASES } from './algs';
import { OLL_EDGES_CASES, PLL_CORNERS_CASES } from './twoLook';
import { Follower, simplify } from './follow';

function run(alg: string, performed: string[]) {
  const f = new Follower(SOLVED, alg);
  let s = SOLVED;
  let p = f.progress();
  for (const m of performed) { s = applyMove(s, m); p = f.push(m, s); }
  return p;
}

describe('simplify', () => {
  it('merges and cancels', () => {
    expect(simplify(['R', 'R'])).toEqual(['R2']);
    expect(simplify(['R', "R'"])).toEqual([]);
    expect(simplify(['R', 'L', 'R'])).toEqual(['R2', 'L']);
    expect(simplify(['R', 'U', 'R'])).toEqual(['R', 'U', 'R']);
  });
});

describe('Follower', () => {
  it('follows a scramble exactly', () => {
    expect(run("R U2 F'", ['R', 'U2', "F'"]).complete).toBe(true);
  });
  it('accepts double moves as two quarter turns either way', () => {
    const p = run("R U2 F'", ['R', "U'"]);
    expect(p.done).toBe(1);
    expect(p.half).toBe(true);
    expect(run("R U2 F'", ['R', "U'", "U'", "F'"]).complete).toBe(true);
  });
  it('accepts commuting opposite moves in any order', () => {
    expect(run("R L U", ['L', 'R', 'U']).complete).toBe(true);
  });
  it('reports how to fix a wrong move', () => {
    const p = run("R U F", ['R', 'D']);
    expect(p.done).toBe(1);
    expect(p.fix).toEqual(["D'"]);
    const q = run("R U F", ['R', 'D', "D'", 'U', 'F']);
    expect(q.complete).toBe(true);
  });
  it('wrong direction on a quarter move', () => {
    const p = run("R U F", ['R', "U'"]);
    expect(p.fix).toEqual(['U']);
    expect(run("R U F", ['R', "U'", 'U2', 'F']).complete).toBe(true);
  });
});

describe('Follower on algs with wide moves, slices and rotations (smart-cube face turns)', () => {
  /** How a smart cube reports an alg: quarter turns, each slice's two faces in the given order. */
  const reported = (alg: string, sliceFirst: 'first' | 'second') =>
    faceTurnsByToken(alg).flatMap((turns) => {
      const ordered = sliceFirst === 'first' ? turns : [...turns].reverse();
      return ordered.flatMap(([f, n]) => (n === 2 ? [f, f] : [n === 3 ? `${f}'` : f]));
    });

  const algs = [...ALL_CASES, ...OLL_EDGES_CASES, ...PLL_CORNERS_CASES].flatMap((c) => [c.alg, ...(c.alts ?? [])]);

  it('every DB alg is followed move by move with no undo hint, ending complete', () => {
    for (const alg of algs) {
      for (const order of ['first', 'second'] as const) {
        const start = normalizeCenters(applyAlg(SOLVED, invertAlg(alg)));
        const f = new Follower(start, alg);
        let s = start;
        let done = 0;
        for (const m of reported(alg, order)) {
          s = applyMove(s, m);
          const p = f.push(m, s);
          expect(p.fix, `${alg} (${order}) after ${m}`).toEqual([]);
          expect(p.done).toBeGreaterThanOrEqual(done);
          done = p.done;
        }
        expect(f.progress().complete, alg).toBe(true);
      }
    }
  });

  it("the L-shape alg: f arrives as B and advances (it used to ask for B')", () => {
    const alg = "f R U R' U' f'";
    const start = normalizeCenters(applyAlg(SOLVED, invertAlg(alg)));
    const f = new Follower(start, alg);
    const p = f.push('B', applyMove(start, 'B'));
    expect([p.done, p.fix]).toEqual([1, []]);
  });

  it('half a slice counts as part-way, not as a wrong turn', () => {
    const f = new Follower(SOLVED, "M' U");
    const p = f.push("L", applyMove(SOLVED, 'L')); // M' = R' L: L done first
    expect([p.done, p.half, p.fix]).toEqual([0, true, []]);
  });
});

describe('Follower undo hints after a rotation', () => {
  const AB = "x R2 D2 R U R' D2 R U' R x'";
  const start = normalizeCenters(applyAlg(SOLVED, invertAlg(AB)));

  it('names the undo as the cube is held after the x, with the no-rotation undo too', () => {
    const f = new Follower(start, AB);
    let s = applyMove(start, 'R');
    expect(f.push('R', s)).toMatchObject({ done: 1, half: true, fix: [] });
    // Skipping the x, the user turns the bottom face: that's D on the centre-fixed cube.
    s = applyMove(s, 'D');
    const p = f.push('D', s);
    expect(p.fix).toEqual(["F'"]); // held after x, the old bottom face is in front
    expect(p.fixUnrotated).toEqual(["D'"]);
  });

  it('the B face after x is what the alg calls D', () => {
    const f = new Follower(start, AB);
    const s = applyMove(start, 'B');
    expect(f.push('B', s).fix).toEqual(["D'"]);
  });

  it('a pending leading rotation is assumed done; no fixUnrotated without rotations', () => {
    const f = new Follower(start, AB);
    expect(f.push('U', applyMove(start, 'U')).fix).toEqual(["B'"]);
    const g = new Follower(SOLVED, "R U R'");
    const p = g.push('D', applyMove(SOLVED, 'D'));
    expect(p.fix).toEqual(["D'"]);
    expect(p.fixUnrotated).toBeUndefined();
  });

  it('follows the rotation-free version of the alg too', () => {
    const f = new Follower(start, "R2 B2 R F R' B2 R F' R");
    let s = start;
    for (const m of ['R', 'R', 'B', 'B', 'R', 'F', "R'", 'B2', 'R', "F'", 'R']) { s = applyMove(s, m); f.push(m, s); }
    expect(f.progress()).toMatchObject({ complete: true, fix: [] });
  });
});
