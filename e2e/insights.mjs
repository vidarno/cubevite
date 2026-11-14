// Insights e2e: seeded smart solves show stage averages, per-case times and frequent errors;
// "Train my weakest" opens the trainer on the mixed weakest-cases drill, which runs with the virtual cube.
import assert from 'node:assert/strict';
import { BASE, launch } from './lib.mjs';

const { browser, page, errors, shot } = await launch();
try {
  await page.goto(`${BASE}/#insights`);
  await page.waitForTimeout(500);
  assert.match(await page.textContent('.insights-page'), /No smart-cube solves yet/, 'empty state');

  // Seed solves built with the app's pure modules: F2L, Sune, U + T-perm (slow recognition) / Ua.
  await page.evaluate(async () => {
    const { applyAlg, invertAlg, SOLVED, tokenize } = await import('/src/cube/facelets.ts');
    const { toFaceTurns } = await import('/src/cube/faceTurns.ts');
    const { analyzeSolve } = await import('/src/cube/cfop.ts');
    const { CASE_BY_ID } = await import('/src/cube/algs.ts');
    const alg = (id) => toFaceTurns(CASE_BY_ID.get(id).alg);
    const mk = (parts, delays, i) => {
      let t = 0;
      const moves = tokenize(parts.join(' ')).map((move, j) => ({ move, t: (t += 150 + (delays[j] ?? 0)) }));
      const start = applyAlg(SOLVED, invertAlg(moves.map((m) => m.move).join(' ')));
      return { id: `e2e-${i}`, date: Date.now() - 1000 * (10 - i), scramble: '', time: t, smart: true, start, moves, splits: analyzeSolve(start, moves) };
    };
    const F2L = ['F R', "U R U' R'", "U' L' U L"];
    const solves = [
      mk([...F2L, alg('OLL 27'), 'U', alg('PLL T')], { 17: 1500 }, 0),
      mk(["F R R' R", ...F2L.slice(1), alg('OLL 27'), 'U', alg('PLL T')], { 19: 2500, 24: 1200 }, 1),
      mk([...F2L, alg('OLL 26'), 'U', alg('PLL Ua')], {}, 2),
      { id: 'manual', date: Date.now(), scramble: '', time: 20000, smart: false },
    ];
    localStorage.setItem('cubevite.solves', JSON.stringify(solves));
  });
  await page.reload();
  await page.waitForTimeout(800);
  await shot('insights-1');
  assert.match(await page.textContent('.insights-page'), /last 3 smart solves/, 'counts smart solves only');
  const stages = await page.$$eval('.insights-table.stages td:first-child', (els) => els.map((e) => e.textContent));
  assert.deepEqual(stages, ['Cross', 'F2L', 'OLL', 'PLL', 'LL recognition', 'Total']);
  const cases = await page.$$eval('.insights-table.cases tbody tr', (els) => els.map((e) => e.textContent));
  assert.match(cases[0], /T-perm.*PLL.*2/, `T-perm is weakest (${cases.join(' | ')})`);
  assert.equal(await page.locator('.insights-table.cases tr.weak').count(), 1, 'only T-perm marked weak');
  assert.equal(cases.length, 4, 'four LL cases');
  const errs = await page.$$eval('.insights-table.errors tbody tr', (els) => els.map((e) => e.textContent));
  assert.ok(errs.some((e) => /cancellation.*Cross/.test(e)), `cross cancellation listed (${errs.join(' | ')})`);

  await page.getByRole('button', { name: /Train my weakest/ }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => location.hash), '#trainer');
  assert.equal(await page.textContent('.seg-control button.active'), 'My weakest cases', 'weakest drill selected');
  const tiles = await page.$$eval('.case-tile .case-name', (els) => els.map((e) => e.textContent));
  assert.deepEqual(tiles, ['PLL T'], `weakest tiles (${tiles.join(', ')})`);

  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.waitForSelector('.trainer-run[data-case]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await shot('insights-2-weakest-drill');
  assert.ok(tiles.includes(await page.getAttribute('.trainer-run', 'data-case')), 'drills a weakest case');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('insights: ok');
} finally {
  await browser.close();
}
