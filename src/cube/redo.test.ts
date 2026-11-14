import { describe, expect, it } from 'vitest';
import { applyAlg, SOLVED } from './facelets';
import { shortestWayBack, undoAlg } from './redo';

describe('redo', () => {
  const scramble = "R U2 F' L D2 B R' U";
  const start = applyAlg(SOLVED, scramble);

  it('undoAlg merges and reverses', () => {
    expect(undoAlg(['R', 'R', 'U', "U'", 'F'])).toBe("F' R2");
    expect(undoAlg([])).toBe('');
  });

  it('picks the shortest candidate that really leads back', () => {
    const solveMoves = "U' R B' D2 L' F U2 R' U R U' R' F R F'".split(' ');
    const end = applyAlg(start, solveMoves.join(' '));
    const undo = undoAlg(solveMoves);
    // From solved the scramble itself is shortest; the undo is valid only from where the solve ended.
    expect(shortestWayBack(SOLVED, start, [undo, scramble])).toBe(scramble);
    expect(shortestWayBack(end, start, [scramble, undo])).toBe(undo);
    expect(shortestWayBack(applyAlg(end, 'D'), start, [scramble, undo])).toBeNull();
    expect(shortestWayBack(start, start, [scramble])).toBe('');
    expect(shortestWayBack(SOLVED, start, [null, undefined, 'R', scramble])).toBe(scramble);
  });
});
