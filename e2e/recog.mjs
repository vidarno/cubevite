// Recognition-only trainer e2e: the case stays hidden while the clock runs; space stops it, the case and
// alg are shown for a self-grade; M = missed (stats + spaced repetition: due again), the first turn also stops
// the clock and space = got it. Execution stats are untouched.
import assert from 'node:assert/strict';
import { BASE, launch, turn } from './lib.mjs';

const { browser, page, errors, shot } = await launch();
const doAlg = async (moves) => { for (const m of moves) await turn(page, m, 25); await page.waitForTimeout(250); };
const store = (k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), k);
const phase = () => page.getAttribute('.trainer-run', 'data-phase');
const setUp = async () => {
  await page.waitForFunction(() => document.querySelector('.trainer-run')?.getAttribute('data-phase') === 'setup'
    && document.querySelectorAll('.scramble .mv').length > 5, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  await doAlg(await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent)));
  assert.equal(await phase(), 'ready');
};

try {
  await page.goto(`${BASE}/#trainer`);
  await page.evaluate(() => {
    localStorage.setItem('cubevite.trainerSel', JSON.stringify({ PLL: ['PLL T', 'PLL Ua'] }));
    localStorage.setItem('cubevite.trainerDrill', JSON.stringify('PLL'));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await page.getByRole('button', { name: /Start \(2 cases\)/ }).click();
  await page.getByRole('checkbox', { name: 'Recognition only' }).check();
  assert.equal(await page.getByRole('checkbox', { name: 'Show algorithm' }).count(), 0, 'alg toggle hidden');

  await setUp();
  assert.equal(await page.textContent('.trainer-run h2'), 'PLL', 'case name hidden');
  assert.equal(await page.$('.trainer-run .trainer-body svg.ll-diagram, .trainer-run .trainer-body .ll-diagram'), null, 'picture hidden');
  assert.equal(await page.$('.trainer-run .alg-box'), null, 'alg hidden');
  assert.ok(await page.getByTestId('recog-prompt').isVisible());
  await page.waitForTimeout(400);
  await shot('recog-1-guessing');
  await page.keyboard.press('Space');
  assert.equal(await phase(), 'result');
  const first = await page.getAttribute('.trainer-run', 'data-case');
  assert.equal(await page.textContent('.trainer-run h2'), first, 'case shown after space');
  assert.ok(await page.$('.trainer-run .alg-box'), 'alg shown for checking');
  const t1 = Number((await page.textContent('.clock')).trim());
  assert.ok(t1 >= 0.3 && t1 < 5, `recognition time ${t1}`);
  await shot('recog-2-grade');
  await page.keyboard.press('m');
  assert.equal(await page.getAttribute('.recog-result', 'data-got'), 'false');
  const rs = (await store('cubevite.recogStats'))[first];
  assert.deepEqual([rs.attempts, rs.misses, rs.times.length], [1, 1, 0]);
  assert.equal((await store('cubevite.srs'))[first].box, 0, 'missed: due again');

  // Next case: the first turn stops the clock; space = got it.
  await setUp();
  const second = await page.getAttribute('.trainer-run', 'data-case');
  assert.notEqual(second, first, 'never the same case twice in a row');
  await doAlg(['R']);
  assert.equal(await phase(), 'result', 'first turn stops the clock');
  await page.keyboard.press('Space');
  assert.equal(await page.getAttribute('.recog-result', 'data-got'), 'true');
  assert.deepEqual((await store('cubevite.recogStats'))[second].times.length, 1);
  assert.equal((await store('cubevite.srs'))[second], undefined, 'a hit does not promote');
  assert.deepEqual(await store('cubevite.caseStats'), {}, 'execution stats untouched');
  await page.waitForFunction(() => document.querySelector('.trainer-run')?.getAttribute('data-phase') === 'setup', null, { timeout: 5000 });
  await page.getByRole('checkbox', { name: 'Recognition only' }).uncheck();
  await page.getByRole('button', { name: 'Stop' }).click();

  await page.getByRole('button', { name: 'Algorithms' }).click();
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  assert.match(await page.locator(`.alg-card[data-case="${second}"]`).textContent(), /recognition: .* avg · 1\/1/);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('recog: ok');
} finally {
  await browser.close();
}
