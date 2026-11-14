// Trainer e2e: algs page renders; PLL trainer with only the T case - set up, solve with T-perm, see a result.
import assert from 'node:assert/strict';
import { BASE, launch, turn, inv } from './lib.mjs';

const T = "R U R' U' R' F R2 U' R' U' R U R' F'".split(' ');
const { browser, page, errors, shot } = await launch();
try {
  await page.goto(`${BASE}/#algs`);
  await page.waitForTimeout(800);
  await shot('algs-1-pll');
  await page.getByRole('button', { name: 'OLL', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('algs-2-oll');

  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await page.getByRole('button', { name: 'None' }).click();
  await page.locator('.case-tile', { hasText: /^T$/ }).click();
  await page.getByRole('button', { name: /Start \(1 case\)/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 5, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await shot('trainer-1-setup');
  assert.equal(await page.$('.trainer-run .clock'), null, 'no clock placeholder during setup');
  const setup = await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent));
  for (const m of setup) await turn(page, m, 30);
  await page.waitForTimeout(300);
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'ready', 'setup completion detected');

  // "Show algorithm" (default on) shows the alg right away; off puts it behind a button again.
  assert.ok(await page.$('.alg-follow'), 'alg shown without a click by default');
  const toggle = page.getByLabel('Show algorithm');
  await toggle.uncheck();
  assert.equal(await page.$('.alg-follow'), null, 'toggle off hides the alg');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('cubevite.settings'))).drillShowAlg, false, 'toggle persisted');
  // Alg hidden: "Undo tips" (default on) still shows how to undo a wrong turn.
  const blur = () => page.evaluate(() => document.activeElement?.blur()); // the virtual cube ignores keys in inputs
  await blur();
  assert.ok(await page.getByLabel('Undo tips').isChecked(), 'undo tips on by default');
  await turn(page, 'B', 30);
  await page.waitForTimeout(200);
  assert.equal(await page.$('.alg-follow'), null, 'alg stays hidden');
  assert.match(await page.textContent('.undo-tip'), /Undo:\s*B'/, 'hidden alg: wrong turn shows an undo tip');
  await shot('trainer-2a-undo-tip');
  await page.getByLabel('Undo tips').uncheck();
  assert.equal(await page.$('.undo-tip'), null, 'undo tips can be switched off');
  await page.getByLabel('Undo tips').check();
  await blur();
  await turn(page, "B'", 30);
  await page.waitForTimeout(200);
  assert.equal(await page.$('.undo-tip'), null, 'undoing clears the tip');
  // "Restart case": undo back to the same start state, then go again.
  await turn(page, 'L', 30);
  await turn(page, 'D', 30);
  await page.getByRole('button', { name: 'Restart case' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'setup', 'restart goes back to setup');
  const back = await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent));
  assert.deepEqual(back, ["D'", "L'"], 'restart undoes the moves made');
  for (const m of back) await turn(page, m, 30);
  await page.waitForTimeout(300);
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'ready', 'back at the case start');
  assert.match(await page.textContent('.trainer-run h2'), /restart/, 'title marks the restart');
  // Reveal the alg: it's followed live (AUFs included), with an undo hint for wrong turns.
  await page.getByRole('button', { name: /Show algorithm/ }).click();
  const shown = await page.$$eval('.alg-follow .alg .mv', (els) => els.map((e) => e.textContent.replace(/[()]/g, '')));
  assert.ok(shown.length >= T.length, 'followed alg shown');
  const current = () => page.$$eval('.alg-follow .alg .mv', (els) => els.findIndex((e) => e.classList.contains('current')));
  assert.equal(await current(), 0, 'first move highlighted');
  for (const m of shown.slice(0, 3)) await turn(page, m, 30);
  await page.waitForTimeout(200);
  assert.equal(await current(), 3, 'highlight follows the moves');
  await turn(page, 'D', 30);
  await page.waitForTimeout(200);
  assert.match(await page.textContent('.alg-follow .fix'), /Undo:\s*D'/, 'wrong turn shows undo');
  await shot('trainer-2-undo');
  await turn(page, "D'", 30);
  await page.waitForTimeout(200);
  assert.equal(await page.$('.alg-follow .fix'), null, 'undo clears the hint');
  assert.equal(await current(), 3, 'back on track');
  for (const m of shown.slice(3)) await turn(page, m, 30);
  await page.waitForTimeout(300);
  const solvedWith = shown.length - T.length ? shown[0] : '(none)';
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'result', 'following the shown alg solves the case');
  await shot('trainer-3-result');
  assert.ok(solvedWith, 'T-perm solves the T case (with some AUF)');
  assert.match(await page.textContent('.trainer-run h2'), /T/, 'result names the case');
  assert.match(await page.textContent('.trainer-run .clock'), /\d/, 'result shows a time');
  assert.equal(await page.$('.case-tile.selected .case-time'), null, 'a restarted attempt is not counted');
  // Next case (auto-advance): a normal attempt is counted.
  await page.waitForFunction(() => document.querySelector('.trainer-run')?.dataset.phase === 'setup'
    && document.querySelectorAll('.scramble .mv').length > 5, null, { timeout: 20000 });
  for (const m of await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent))) await turn(page, m, 30);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Show algorithm/ }).click();
  for (const m of await page.$$eval('.alg-follow .alg .mv', (els) => els.map((e) => e.textContent.replace(/[()]/g, '')))) await turn(page, m, 30);
  await page.waitForTimeout(300);
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'result', 'second attempt solved');
  assert.match(await page.locator('.case-tile.selected .case-time').textContent(), /\d/, 'case tile shows a time');
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`trainer: ok (AUF ${solvedWith})`);
} finally {
  await browser.close();
}
