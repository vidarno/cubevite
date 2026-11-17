// Preferred algs e2e: on the Algorithms page, add an own alg for Jb (a wrong one is refused with a
// reason, typing doesn't turn the virtual cube), it becomes the first alg and survives a reload, the
// loop and the trainer follow it; "use" on the main alg switches back; the own alg can be removed.
import assert from 'node:assert/strict';
import { BASE, launch, turn } from './lib.mjs';

const OWN = "R U2 R' U' R U2 L' U R' U' L";
const { browser, page, errors, shot } = await launch();
const card = () => page.locator('.alg-card[data-case="PLL Jb"]');
const firstAlg = () => card().locator('.alg-line').first().getAttribute('data-alg');
const doAlg = async (moves) => { for (const m of moves) await turn(page, m, 25); await page.waitForTimeout(250); };

try {
  await page.goto(`${BASE}/#algs`);
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  const mainAlg = await firstAlg();

  await card().getByRole('button', { name: 'Add own alg' }).click();
  const input = card().getByRole('textbox', { name: 'Own alg' });
  await input.fill("R U R'");
  await card().getByRole('button', { name: 'Save' }).click();
  assert.match(await card().getByRole('alert').textContent(), /doesn't solve the cube/, 'wrong alg refused');
  await input.fill('');
  await input.pressSequentially(OWN, { delay: 5 }); // real key presses: R/U/L must not reach the virtual cube
  await shot('prefs-1-entering');
  await input.press('Enter');
  await page.waitForSelector('.alg-card[data-case="PLL Jb"] .alg-line[data-alg="' + OWN + '"]');
  assert.equal(await firstAlg(), OWN, 'own alg first');
  assert.match(await card().locator('.alg-line').first().textContent(), /your pick.*own/);
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('cubevite.algPrefs')));
  assert.deepEqual(stored['PLL Jb'], { preferred: OWN, custom: [OWN] });
  await shot('prefs-2-saved');

  await page.reload();
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  assert.equal(await firstAlg(), OWN, 'kept after reload');

  // Loop follows the own alg (and the cube was not turned by the typing: the loop starts clean).
  await card().getByRole('button', { name: 'loop' }).click();
  await page.waitForSelector('.alg-loop');
  await doAlg(OWN.split(' '));
  assert.equal(await page.getAttribute('.alg-loop', 'data-reps'), '1', 'own alg rep counted');
  assert.equal(await page.getAttribute('.alg-loop', 'data-clean'), '1');
  await page.keyboard.press('Escape');
  await doAlg(OWN.split(' ').reverse().map((m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : m + "'")));

  // Trainer: the Jb case shows and follows the own alg first.
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  await page.getByRole('button', { name: 'None' }).click();
  await page.locator('.case-tile', { hasText: /^Jb$/ }).click();
  await page.getByRole('button', { name: /Start \(1 case\)/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 5, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  await doAlg(await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent)));
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'ready');
  const shown = await page.$$eval('.trainer-run .alg-follow .alg:first-child .mv:not(.auf)', (els) => els.map((e) => e.textContent).join(' '));
  assert.equal(shown, OWN, 'trainer shows the own alg');
  await shot('prefs-3-trainer');
  await doAlg(await page.$$eval('.trainer-run .alg-follow .alg:first-child .mv', (els) => els.map((e) => e.textContent.replace(/[()]/g, ''))));
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'result', 'own alg solves the case');

  // Back to the main alg, then remove the own alg.
  await page.getByRole('button', { name: 'Algorithms' }).click();
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  await card().locator(`.alg-line[data-alg="${mainAlg}"]`).getByRole('button', { name: 'use' }).click();
  assert.equal(await firstAlg(), mainAlg, 'main alg first again');
  await card().getByRole('button', { name: 'Remove own alg' }).click();
  assert.equal(await card().locator('.alg-line').count(), 1, 'own alg removed');
  assert.equal(await page.evaluate(() => localStorage.getItem('cubevite.algPrefs')), '{}');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('prefs: ok');
} finally {
  await browser.close();
}
