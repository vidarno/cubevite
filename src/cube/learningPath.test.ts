import { describe, expect, it } from 'vitest';
import { applyAlg } from './facelets';
import { advanceSteps, toCrossDown, toCubeFrame } from './drills';
import {
  currentStage, drillById, LEARNING_DRILL_ID, LEARNING_PATH, learningDrill, stageItems, stageProgress, suggestLearned,
  type LearnStatus,
} from './learningPath';

const ids = (stageId: string) => stageItems(LEARNING_PATH.find((s) => s.id === stageId)!).map((i) => i.c.id);

describe('learning path', () => {
  it('has the planned stages and sizes', () => {
    expect(LEARNING_PATH.map((s) => s.label)).toEqual(['2-look OLL', '2-look PLL', 'Full PLL', 'Full OLL']);
    expect(ids('2L-OLL')).toHaveLength(10);
    expect(ids('2L-PLL')).toHaveLength(6);
    expect(ids('PLL')).toHaveLength(21);
    expect(ids('OLL')).toHaveLength(57);
  });

  it('2-look cases are shared with the full sets where they are the same alg', () => {
    for (const id of ['OLL 21', 'OLL 27']) { expect(ids('2L-OLL')).toContain(id); expect(ids('OLL')).toContain(id); }
    for (const id of ['PLL Ua', 'PLL H']) { expect(ids('2L-PLL')).toContain(id); expect(ids('PLL')).toContain(id); }
  });

  it('suggests learned only with 5+ times and a fast recent mean, never when already learned', () => {
    const fast = { times: [9000, 3000, 3000, 3000, 3000, 3000] };
    expect(suggestLearned('X', 4000, {}, { X: fast })).toBe(true);
    expect(suggestLearned('X', 4000, { X: 'learned' }, { X: fast })).toBe(false);
    expect(suggestLearned('X', 4000, {}, { X: { times: [1000, 1000, 1000, 1000] } })).toBe(false);
    expect(suggestLearned('X', 4000, {}, { X: { times: [5000, 5000, 5000, 3000, 3000] } })).toBe(false);
  });

  it('stage progress and current stage', () => {
    const learn: Record<string, LearnStatus> = {};
    expect(currentStage(learn)!.id).toBe('2L-OLL');
    for (const id of ids('2L-OLL')) learn[id] = 'learned';
    learn['PLL Ua'] = 'learning';
    const stats = { 'PLL H': { times: [1000, 1000, 1000, 1000, 1000] } };
    const [s1, s2] = LEARNING_PATH;
    expect(stageProgress(s1, learn, stats)).toMatchObject({ total: 10, learned: 10, done: true });
    expect(stageProgress(s2, learn, stats)).toMatchObject({ total: 6, learned: 0, learning: 1, suggested: ['PLL H'], done: false });
    expect(currentStage(learn)!.id).toBe('2L-PLL');
  });
});

describe('learning drill', () => {
  const learn: Record<string, LearnStatus> = {
    '2L OLL Dot': 'learning', 'OLL 26': 'learning', '2L PLL Diagonal': 'learning', 'PLL T': 'learning', 'OLL 45': 'learned',
  };

  it('collects the learning cases, once each', () => {
    const d = learningDrill(learn);
    expect(d.id).toBe(LEARNING_DRILL_ID);
    expect(d.cases.map((c) => c.id).sort()).toEqual(['2L OLL Dot', '2L PLL Diagonal', 'OLL 26', 'PLL T']);
    expect(drillById(LEARNING_DRILL_ID, learn)!.cases).toHaveLength(4);
    expect(drillById('PLL', learn)!.id).toBe('PLL');
  });

  it('sets up each case via its own drill and is done exactly when that drill is', () => {
    const d = learningDrill(learn);
    for (const c of d.cases) {
      const target = d.pickTarget(c);
      expect(advanceSteps(d, target, 0, c)).toBe(0);
      const h = drillById(c.id === 'OLL 26' ? '2L OCLL' : c.id === 'PLL T' ? 'PLL' : c.id.includes('OLL') ? '2L OLL edges' : '2L PLL corners', learn)!
        .steps[0].classify?.(target);
      // Step drills give a hint; for the full PLL case use the case alg with each AUF.
      const finished = h
        ? toCubeFrame(applyAlg(toCrossDown(target), `${h.preAuf} ${h.alg} ${h.postAuf}`))
        : ['', 'U', 'U2', "U'"].flatMap((a) => ['', 'U', 'U2', "U'"].map((b) => toCubeFrame(applyAlg(toCrossDown(target), `${a} ${c.alg} ${b}`))))
          .find((s) => advanceSteps(d, s, 0, c) === 1)!;
      expect(advanceSteps(d, finished, 0, c), c.id).toBe(1);
    }
  });
});
