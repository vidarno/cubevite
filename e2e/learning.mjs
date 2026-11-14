// Learning path e2e: the Algorithms page shows the path, cases can be started / suggested / marked learned,
// and "Drill my learning cases" opens the trainer on the mixed learning drill, which runs with the virtual cube.
import assert from 'node:assert/strict';
import { BASE, launch, turn } from './lib.mjs';

const { browser, page, errors, shot } = await launch();
const stageText = (id) => page.textContent(`.path-stage[data-stage="${id}"] summary`);

/** Display-frame face turns that solve the current learning case (via its own step drill's hint). */
const solveMoves = () => page.evaluate(async () => {
  const caseId = document.querySelector('.trainer-run').getAttribute('data-case');
  const { cubeStore } = await import('/src/state/cubeStore.ts');
  const { LEARNING_PATH, stageItems } = await import('/src/cube/learningPath.ts');
  const { toCrossDown, toCubeFrame } = await import('/src/cube/drills.ts');
  const { applyAlg, normalizeCenters } = await import('/src/cube/facelets.ts');
  const { movesBetween } = await import('/src/cube/solver.ts');
  const { faceMapFor, mapMove } = await import('/src/cube/display.ts');
  const item = LEARNING_PATH.flatMap(stageItems).find((i) => i.c.id === caseId);
  const state = cubeStore.get().state;
  const h = item.drill.steps[0].classify(state);
  const end = toCubeFrame(normalizeCenters(applyAlg(toCrossDown(state), `${h.preAuf} ${h.alg} ${h.postAuf}`)));
  const map = faceMapFor('z2');
  return { caseId, moves: (await movesBetween(state, end)).split(' ').filter(Boolean).map((m) => mapMove(m, map)) };
});

try {
  await page.goto(`${BASE}/#algs`);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.path-stage').count(), 4, 'four stages');
  assert.match(await stageText('2L-OLL'), /current/, 'first stage is current');
  assert.match(await stageText('2L-OLL'), /0\/10 learned/);
  assert.equal(await page.locator('.path-stage[data-stage="2L-OLL"] .alg-card').count(), 10, '10 algs in 2-look OLL');
  assert.equal(await page.locator('.path-stage[data-stage="2L-PLL"] .alg-card').count(), 6, '6 algs in 2-look PLL');

  await page.getByRole('button', { name: 'Start learning the 10 new' }).click();
  assert.match(await stageText('2L-OLL'), /10 learning/);

  // Fast trainer times for OLL 26 -> suggested as learned.
  // (Seeded via localStorage + reload: an in-page import of the store can be a different module
  // instance than the app's after HMR.)
  await page.evaluate(() => localStorage.setItem('cubevite.caseStats',
    JSON.stringify({ 'OLL 26': { times: [2500, 2400, 2300, 2600, 2200], attempts: 5 } })));
  await page.reload();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.path-stage[data-stage="2L-OLL"] .alg-card[data-case="OLL 26"] .pill.suggest').count(), 1, 'OLL 26 suggested');
  await shot('learning-1-path');
  await page.getByRole('button', { name: 'Mark 1 fast case learned' }).click();
  assert.match(await stageText('2L-OLL'), /1\/10 learned · 9 learning/);

  await page.getByRole('button', { name: /Drill my learning cases \(9\)/ }).click();
  await page.waitForTimeout(300);
  assert.equal(new URL(page.url()).hash, '#trainer', 'navigated to the trainer');
  assert.equal(await page.textContent('.case-picker .seg-control button.active'), 'My learning cases');
  assert.equal(await page.locator('.case-tile.selected').count(), 9, 'all 9 learning cases in the pool');
  await shot('learning-2-trainer');

  // Learning cases can be switched off one by one, or with None / All, like the full OLL/PLL drills.
  const firstTile = page.locator('.case-tile').first();
  const offId = (await firstTile.locator('.case-name').textContent()).trim();
  await firstTile.click();
  assert.equal(await page.locator('.case-tile.selected').count(), 8, 'one case switched off');
  await page.getByRole('button', { name: 'None', exact: true }).click();
  assert.equal(await page.locator('.case-tile.selected').count(), 0, 'None');
  assert.ok(await page.getByRole('button', { name: /Start \(0 cases\)/ }).isDisabled(), 'cannot start with no cases');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  assert.equal(await page.locator('.case-tile.selected').count(), 9, 'All');
  await firstTile.click();
  await page.reload();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.case-tile.selected').count(), 8, 'switched-off case remembered');
  assert.ok(!(await page.locator('.case-tile.selected .case-name').allTextContents()).map((t) => t.trim()).includes(offId), 'the right case is off');

  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await page.getByRole('button', { name: /Start \(8 cases\)/ }).click();
  await page.waitForFunction(() => {
    const r = document.querySelector('.trainer-run');
    return r && (r.getAttribute('data-phase') === 'ready' || document.querySelectorAll('.scramble .mv').length > 0);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  for (const m of await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent))) await turn(page, m, 25);
  await page.waitForTimeout(300);
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'ready', 'setup done');
  const { caseId, moves } = await solveMoves();
  for (const m of moves) await turn(page, m, 25);
  await page.waitForTimeout(300);
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'result', `learning case ${caseId} solved`);
  await shot('learning-3-result');
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`learning: ok (drilled ${caseId})`);
} finally {
  await browser.close();
}
