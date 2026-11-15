// Timer LL hints e2e: scramble, solve to a 2-look PLL-corners case (via the solver), pause for the
// first hint tier, step up with space, follow the alg shown, finish; the solve is tagged "hint" and
// the case shows under "Hints used" in Insights.
import assert from 'node:assert/strict';
import { BASE, launch, turn } from './lib.mjs';

const { browser, page, errors, shot } = await launch();

/** Display-frame face turns from the current cube state to `target` (cube frame); null target = solved. */
const movesTo = (target) => page.evaluate(async (target) => {
  const { cubeStore } = await import('/src/state/cubeStore.ts');
  const { movesBetween } = await import('/src/cube/solver.ts');
  const { SOLVED } = await import('/src/cube/facelets.ts');
  const { faceMapFor, mapMove } = await import('/src/cube/display.ts');
  const { settingsStore } = await import('/src/state/data.ts');
  const map = faceMapFor((settingsStore.get().yellowTop ?? true) ? 'z2' : '');
  const alg = await movesBetween(cubeStore.get().state, target ?? SOLVED);
  return alg.split(' ').filter(Boolean).map((m) => mapMove(m, map));
}, target);

try {
  await page.goto(`${BASE}/#timer`);
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 10, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const scramble = await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent));
  for (const m of scramble) await turn(page, m, 25);
  await page.waitForTimeout(300);
  assert.match(await page.textContent('.status'), /Scrambled/, 'scrambled');

  // Solve to F2L + OLL done, PLL = T-perm (white cross on the cube-frame U face): 2-look "Headlights".
  const target = await page.evaluate(async () => {
    const { caseState } = await import('/src/cube/cfop.ts');
    const { CASE_BY_ID } = await import('/src/cube/algs.ts');
    const { toCubeFrame } = await import('/src/cube/drills.ts');
    return toCubeFrame(caseState(CASE_BY_ID.get('PLL T')));
  });
  for (const m of await movesTo(target)) await turn(page, m, 25);
  await page.waitForTimeout(300);
  assert.ok(await page.$('.ll-hint-ask'), 'hint button while the hint is hidden');
  assert.equal(await page.$('.ll-hint'), null, 'no hint before a pause');

  await page.waitForTimeout(2300); // idle: tier 1 shows on its own
  const t1 = await page.textContent('.ll-hint');
  assert.match(t1, /PLL corners:\s*Headlights/, `tier 1 names the step and case (${t1})`);
  assert.equal(await page.$('.ll-hint svg'), null, 'tier 1: no picture yet');
  await shot('hints-1-name');

  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  assert.ok(await page.$('.ll-hint .step-hint-case svg'), 'space: picture');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  assert.ok(await page.$('.ll-hint .alg-follow'), 'space again: alg followed live');
  await shot('hints-2-alg');

  // Do the alg as shown (AUFs included); the virtual cube takes display-frame face turns.
  const algMoves = await page.$$eval('.ll-hint .alg-follow .alg .mv', (els) => els.map((e) => e.textContent.replace(/[()]/g, '')));
  assert.ok(algMoves.length >= 10, `alg shown (${algMoves.join(' ')})`);
  for (const m of algMoves) await turn(page, m, 25);
  await page.waitForTimeout(300);
  // 2-look: corners done, now PLL edges (or solved / AUF only if the T happened to fix the edges).
  const v = await page.$('.ll-hint, .ll-hint-ask');
  if (v) assert.equal(await page.$('.ll-hint'), null, 'next step starts hidden');
  for (const m of await movesTo(null)) await turn(page, m, 25);
  await page.waitForTimeout(1200);

  const items = await page.$$eval('.history-item', (els) => els.map((e) => e.textContent));
  assert.equal(items.length, 1, 'solve recorded');
  assert.match(items[0], /hint/, `tagged hint (${items[0]})`);
  const hints = await page.evaluate(() => JSON.parse(localStorage.getItem('cubevite.solves'))[0].hints);
  assert.equal(hints.length, 1, 'one hint stored');
  assert.deepEqual([hints[0].caseId, hints[0].stepLabel, hints[0].tier], ['2L PLL Headlights', 'PLL corners', 3]);
  await shot('hints-3-history');

  await page.goto(`${BASE}/#insights`);
  await page.waitForTimeout(800);
  const panel = await page.locator('section.panel', { hasText: 'Hints used' }).textContent();
  assert.match(panel, /Headlights\s*x1/, `insights lists the hinted case (${panel})`);
  await shot('hints-4-insights');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('hints: ok');
} finally {
  await browser.close();
}
