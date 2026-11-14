// Cross drill e2e: level 3 scramble solved optimally, a no-look solve with an extra move, then plan-only;
// checks the moves-vs-optimal report, the hidden 3D view and the trainer's summary.
import assert from 'node:assert/strict';
import { BASE, launch, turn } from './lib.mjs';

const { browser, page, errors, shot } = await launch();

/** Display-frame optimal cross solution from the current cube state (via the app's own modules). */
const optimal = () => page.evaluate(async () => {
  const { cubeStore } = await import('/src/state/cubeStore.ts');
  const { solveCross } = await import('/src/cube/crossSolver.ts');
  const { faceMapFor, mapMove } = await import('/src/cube/display.ts');
  const { settingsStore } = await import('/src/state/data.ts');
  const map = faceMapFor((settingsStore.get().yellowTop ?? true) ? 'z2' : '');
  return solveCross(cubeStore.get().state, 'U', 1)[0].split(' ').filter(Boolean).map((m) => mapMove(m, map));
});

const phase = () => page.getAttribute('.trainer-run', 'data-phase');

async function setUp(label) {
  await page.waitForFunction(() => {
    const r = document.querySelector('.trainer-run');
    return r && (r.getAttribute('data-phase') === 'ready' || document.querySelectorAll('.scramble .mv').length > 0);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  for (const m of await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent))) await turn(page, m, 25);
  await page.waitForTimeout(300);
  assert.equal(await phase(), 'ready', `${label}: scramble completion detected`);
}

try {
  await page.goto(`${BASE}/#trainer`);
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.getByRole('button', { name: 'Cross', exact: true }).click();
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  assert.match(await page.textContent('.case-grid'), /Any.*8 moves/s, 'levels listed');
  const startText = await page.textContent('button.primary.big'); assert.match(startText, /Start \(1 level\)/, `"Any" selected by default: ${startText}`);
  await page.getByRole('button', { name: 'None' }).click();
  await page.locator('.case-tile', { hasText: /^3 moves$/ }).click();
  await page.getByRole('button', { name: /Start \(1 level\)/ }).click();

  // 1. Solve mode, optimal solution.
  await setUp('solve');
  assert.match(await page.textContent('.trainer-run .clock'), /^1[0-5]$/, 'inspection countdown');
  assert.match(await page.textContent('.trainer-run h2'), /Cross · 3 moves/, 'level in title');
  const sol = await optimal();
  assert.equal(sol.length, 3, 'level 3 scramble has a 3-move optimal cross');
  for (const m of sol) await turn(page, m, 30);
  await page.waitForTimeout(400);
  assert.equal(await phase(), 'result', 'solving the cross ends the attempt');
  assert.equal(await page.getAttribute('.cross-result', 'data-optimal'), '3');
  assert.equal(await page.getAttribute('.cross-result', 'data-moves'), '3');
  assert.match(await page.textContent('.cross-result'), /\(optimal\)/, 'optimal solve recognised');
  assert.ok((await page.$$('.cross-solutions li')).length >= 1, 'optimal solutions listed');
  await shot('cross-1-result');
  await page.waitForTimeout(1800);
  assert.equal(await phase(), 'result', 'cross result does not auto-advance');

  // 2. No-look mode, one extra move first.
  await page.getByLabel('Mode').selectOption('noLook');
  await page.getByRole('button', { name: /Next/ }).click();
  await setUp('no-look');
  assert.ok(await page.$('.trainer-run .live-cube:not(.hidden-cube)'), '3D view visible during inspection');
  await turn(page, 'U', 30);
  await page.waitForTimeout(200);
  assert.ok(await page.$('.hidden-cube'), '3D view hidden once solving starts');
  await shot('cross-2-nolook');
  const rest = await optimal();
  for (const m of rest) await turn(page, m, 30);
  await page.waitForTimeout(400);
  assert.equal(await phase(), 'result', 'no-look solve finished');
  const opt2 = Number(await page.getAttribute('.cross-result', 'data-optimal'));
  const moves2 = Number(await page.getAttribute('.cross-result', 'data-moves'));
  assert.ok(moves2 >= opt2 && moves2 <= rest.length + 1, `moves ${moves2} counted against optimal ${opt2}`);

  // 2b. Redo with solution: back to the same scramble by undoing the moves, then follow the optimal solution.
  await page.getByLabel('Mode').selectOption('solve');
  await page.getByRole('button', { name: 'Redo with solution' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 0, null, { timeout: 20000 });
  assert.match(await page.textContent('.trainer-run'), /Back to the same start/, 'redo setup labelled');
  const back = await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent));
  assert.ok(back.length <= moves2, `way back (${back.length}) is the undo, not a new scramble`);
  for (const m of back) await turn(page, m, 25);
  await page.waitForTimeout(300);
  assert.equal(await phase(), 'ready', 'redo setup done');
  const shown = await page.$$eval('.cross-follow .alg-follow .alg .mv', (els) => els.map((e) => e.textContent));
  assert.equal(shown.length, opt2, 'optimal solution shown for the redo');
  await shot('cross-2b-redo');
  for (const m of shown) await turn(page, m, 30);
  await page.waitForTimeout(400);
  assert.equal(await phase(), 'result', 'redo solved');
  assert.equal(await page.getAttribute('.cross-result', 'data-moves'), String(opt2), 'following the shown solution is optimal');

  // 2c. "Redo previous" while the next scramble is being set up.
  await page.getByRole('button', { name: /Next/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 0, null, { timeout: 20000 });
  await turn(page, (await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent)))[0], 25);
  await page.getByRole('button', { name: 'Redo previous', exact: true }).click();
  await setUp('redo previous');
  for (const m of await optimal()) await turn(page, m, 30);
  await page.waitForTimeout(400);
  assert.equal(await page.getAttribute('.cross-result', 'data-optimal'), String(opt2), 'same scramble again');

  // 3. Plan only: reveal without solving.
  await page.getByLabel('Mode').selectOption('plan');
  await page.getByRole('button', { name: /Next/ }).click();
  await setUp('plan');
  await page.getByRole('button', { name: /Show optimal/ }).click();
  await page.waitForTimeout(200);
  assert.equal(await phase(), 'result', 'plan-only reveal');
  assert.equal(await page.getAttribute('.cross-result', 'data-moves'), null, 'no move count without solving');
  assert.equal(await page.getAttribute('.cross-result', 'data-optimal'), '3');
  assert.match(await page.textContent('.trainer-run .clock'), /Plan/);
  await shot('cross-3-plan');

  const log = JSON.parse(await page.evaluate(() => localStorage.getItem('cubevite.crossLog')));
  assert.deepEqual(log.map((a) => a.mode), ['solve', 'noLook', 'solve', 'solve', 'plan'], 'attempts logged');
  assert.deepEqual(log.map((a) => !!a.redo), [false, false, true, true, false], 'redos marked');
  await page.getByRole('button', { name: 'Stop' }).click();
  assert.match(await page.textContent('[data-testid=cross-summary]'), /Last 3.*Over optimal.*Plan/s, 'summary on the intro');
  await shot('cross-4-intro');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('cross: ok');
} finally {
  await browser.close();
}
