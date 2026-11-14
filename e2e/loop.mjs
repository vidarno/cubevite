// Alg loop e2e: loop T-perm from the Algorithms page (AUF before a rep doesn't count, two reps get
// back to the start, a wrong turn + undo makes a rep unclean), stats on the card; then "Loop this alg"
// from a trainer result pauses the drill until the loop closes.
import assert from 'node:assert/strict';
import { BASE, launch, turn, inv } from './lib.mjs';

const T = "R U R' U' R' F R2 U' R' U' R U R' F'".split(' ');
const { browser, page, errors, shot } = await launch();
const loopAttr = (a) => page.getAttribute('.alg-loop', a);
const doAlg = async (moves) => { for (const m of moves) await turn(page, m, 25); await page.waitForTimeout(250); };

try {
  await page.goto(`${BASE}/#algs`);
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  const card = page.locator('.alg-card[data-case="PLL T"]');
  assert.ok(await card.getByRole('button', { name: 'loop' }).isDisabled(), 'loop needs a cube');
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await card.getByRole('button', { name: 'loop' }).click();
  await page.waitForSelector('.alg-loop');
  assert.match(await page.textContent('.alg-loop'), /back to its start every 2 reps/, 'order shown');

  // An AUF before the rep is ignored; the rep starts on the alg's first turn.
  await doAlg(['U']);
  assert.equal(await loopAttr('data-reps'), '0');
  assert.match(await page.textContent('[data-testid="loop-clock"]'), /Go!/, 'clock idle before the rep');
  await doAlg(T.slice(0, 3));
  assert.equal(await page.$$eval('.alg-loop .alg-follow .mv.done', (els) => els.length), 3, 'rep followed live');
  await doAlg(T.slice(3));
  assert.equal(await loopAttr('data-reps'), '1');
  assert.match(await page.textContent('.alg-loop'), /TPS/, 'TPS shown');
  await doAlg(T);
  assert.equal(await loopAttr('data-reps'), '2');
  assert.equal(await loopAttr('data-clean'), '2');
  assert.match(await page.textContent('[data-testid="loop-back"]'), /after 2 reps/, 'T-perm x2 returns to the start');
  await shot('loop-1-two-reps');

  // Wrong turn inside a rep: undo hint, rep counted but unclean.
  await doAlg(T.slice(0, 5));
  await doAlg(['D']);
  assert.match(await page.textContent('.alg-loop .fix'), /Undo:\s*D'/, 'undo hint');
  await doAlg([inv('D'), ...T.slice(5)]);
  assert.equal(await loopAttr('data-reps'), '3');
  assert.equal(await loopAttr('data-clean'), '2', 'rep with a wrong turn is not clean');
  assert.equal(await page.$$eval('.loop-reps li.unclean', (els) => els.length), 1);
  await shot('loop-2-unclean');

  await page.keyboard.press('Escape');
  assert.equal(await page.$('.alg-loop'), null, 'Esc closes');
  assert.match(await card.textContent(), /loop: .*3 reps/, 'loop stats on the card');
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('cubevite.loopStats')))['PLL T'];
  assert.equal(stored.reps, 3);
  assert.equal(stored.times.length, 2, 'only clean reps are timed');

  // Trainer: solve the T case, loop it from the result; the drill waits.
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  await page.getByRole('button', { name: 'None' }).click();
  await page.locator('.case-tile', { hasText: /^T$/ }).click();
  await page.getByRole('button', { name: /Start \(1 case\)/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 5, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  await doAlg(await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent)));
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'ready');
  await doAlg(await page.$$eval('.trainer-run .alg-follow .alg .mv', (els) => els.map((e) => e.textContent.replace(/[()]/g, ''))));
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'result');
  await page.getByRole('button', { name: 'Loop this alg' }).click();
  await doAlg(T);
  await doAlg(T); // twice: back to solved, so the next T case needs a real setup
  assert.equal(await loopAttr('data-reps'), '2', 'loop counts the reps');
  await page.waitForTimeout(1800);
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'result', 'drill paused while looping');
  await shot('loop-3-from-trainer');
  await page.getByRole('button', { name: 'Close (Esc)' }).click();
  await page.waitForFunction(() => document.querySelector('.trainer-run')?.getAttribute('data-phase') === 'setup', null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 5, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  assert.ok(await page.getByRole('button', { name: 'Loop previous alg' }).isVisible(), 'loop offered during the next setup');
  await doAlg(await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent)));
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'ready', 'drill resumes after the loop');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('loop: ok');
} finally {
  await browser.close();
}
