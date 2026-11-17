// Spaced repetition e2e: with a seeded deck (T missed and due, Ua and H reviewed and not due), the PLL trainer
// marks T as due, says 1 of 3 is due and brings T first; solving it fast moves it up a box; the Algorithms page
// shows when it's due. Switching "Due first" off is remembered.
import assert from 'node:assert/strict';
import { BASE, launch, turn } from './lib.mjs';

const { browser, page, errors, shot } = await launch();
const doAlg = async (moves) => { for (const m of moves) await turn(page, m, 25); await page.waitForTimeout(250); };
const srs = () => page.evaluate(() => JSON.parse(localStorage.getItem('cubevite.srs') ?? '{}'));

try {
  await page.goto(`${BASE}/#trainer`);
  await page.evaluate(() => {
    const now = Date.now();
    localStorage.setItem('cubevite.srs', JSON.stringify({
      'PLL T': { box: 0, due: now - 1000, last: now - 60000, lapses: 2 },
      'PLL Ua': { box: 4, due: now + 86400000, last: now, lapses: 0 },
      'PLL H': { box: 3, due: now + 3600000, last: now, lapses: 0 },
    }));
    localStorage.setItem('cubevite.trainerSel', JSON.stringify({ PLL: ['PLL T', 'PLL Ua', 'PLL H'] }));
    localStorage.setItem('cubevite.trainerDrill', JSON.stringify('PLL'));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  assert.ok(await page.getByRole('checkbox', { name: 'Due first' }).isChecked(), 'on by default');
  assert.equal(await page.locator('.case-tile.due').count(), 1, 'one tile marked due');
  assert.match(await page.locator('.case-tile.due').textContent(), /^T/);
  assert.match(await page.textContent('[data-testid="srs-due"]'), /1 of 3 selected cases due/);
  await shot('srs-1-picker');

  await page.getByRole('button', { name: /Start \(3 cases\)/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 5, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  await doAlg(await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent)));
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'ready');
  assert.equal(await page.textContent('.trainer-run h2'), 'PLL T', 'the due case comes first');
  await doAlg(await page.$$eval('.trainer-run .alg-follow .alg:first-child .mv', (els) => els.map((e) => e.textContent.replace(/[()]/g, ''))));
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'result');
  const t = (await srs())['PLL T'];
  assert.equal(t.box, 1, 'fast clean solve: up a box');
  assert.ok(t.due > Date.now() + 9 * 60000, 'due again in ~10 min');
  assert.equal(t.lapses, 2);
  await shot('srs-2-result');
  await page.getByRole('button', { name: 'Stop' }).click();

  await page.getByRole('checkbox', { name: 'Due first' }).uncheck();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cubevite.settings')).srs), false);
  assert.equal(await page.locator('.case-tile.due').count(), 0, 'no due markers when off');

  await page.getByRole('button', { name: 'Algorithms' }).click();
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  assert.match(await page.locator('.alg-card[data-case="PLL T"] [data-testid="srs"]').textContent(), /review in 10 min · box 1 · missed 2×/);
  assert.match(await page.locator('.alg-card[data-case="PLL Ua"] [data-testid="srs"]').textContent(), /review in 1 d · box 4/);
  assert.equal(await page.locator('.alg-card[data-case="PLL Z"] [data-testid="srs"]').count(), 0, 'unseen case: no review line');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('srs: ok');
} finally {
  await browser.close();
}
