// F2L drills e2e: a case drill (follow the shown alg incl. AUF) and a full-F2L attempt solved pair by pair
// (via the app's recognition), checking the per-pair report.
import assert from 'node:assert/strict';
import { BASE, launch, turn } from './lib.mjs';

const { browser, page, errors, shot } = await launch();
const phase = () => page.getAttribute('.trainer-run', 'data-phase');

async function setUp(label) {
  await page.waitForFunction(() => {
    const r = document.querySelector('.trainer-run');
    return r && (r.getAttribute('data-phase') === 'ready' || document.querySelectorAll('.scramble .mv').length > 0);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  for (const m of await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent))) await turn(page, m, 25);
  await page.waitForTimeout(300);
  assert.equal(await phase(), 'ready', `${label}: setup completion detected`);
}

/** Next pair to insert from the current cube state (cross-down = yellow-top display frame). */
const nextPair = (n) => page.evaluate(async (n) => {
  const { cubeStore } = await import('/src/state/cubeStore.ts');
  const { toCrossDown } = await import('/src/cube/drills.ts');
  const { recognizeF2LSlots, pairStatus, F2L_SLOTS } = await import('/src/cube/f2lRecognize.ts');
  const s = toCrossDown(cubeStore.get().state);
  const free = recognizeF2LSlots(s);
  if (free.length) return free[0].moves.split(' ').filter(Boolean);
  const pop = { RF: "R U R'", FL: "L' U' L", LB: "L U L'", BR: "R' U' R" };
  // Rotate through the unsolved slots: always popping the same one can loop without freeing anything.
  const open = F2L_SLOTS.filter((sl) => pairStatus(s, sl) !== 'solved');
  return open.length ? pop[open[n % open.length]].split(' ') : [];
}, n);

/** Display-frame moves (yellow top = cross-down for the white cross) from the current state: optimal cross / rest of the solve. */
const crossMoves = () => page.evaluate(async () => {
  const { cubeStore } = await import('/src/state/cubeStore.ts');
  const { solveCross } = await import('/src/cube/crossSolver.ts');
  const { faceMapFor, mapMove } = await import('/src/cube/display.ts');
  const map = faceMapFor('z2');
  return solveCross(cubeStore.get().state, 'U', 1)[0].split(' ').filter(Boolean).map((m) => mapMove(m, map));
});
const finishMoves = () => page.evaluate(async () => {
  const { cubeStore } = await import('/src/state/cubeStore.ts');
  const { movesBetween } = await import('/src/cube/solver.ts');
  const { SOLVED } = await import('/src/cube/facelets.ts');
  const { faceMapFor, mapMove } = await import('/src/cube/display.ts');
  const map = faceMapFor('z2');
  return (await movesBetween(cubeStore.get().state, SOLVED)).split(' ').filter(Boolean).map((m) => mapMove(m, map));
});
const pairsSolved = () => page.evaluate(async () => {
  const { cubeStore } = await import('/src/state/cubeStore.ts');
  const { toCrossDown } = await import('/src/cube/drills.ts');
  const { solvedSlots } = await import('/src/cube/cfop.ts');
  return solvedSlots(toCrossDown(cubeStore.get().state), 'D').length;
});

try {
  await page.goto(`${BASE}/#trainer`);
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.getByRole('button', { name: 'F2L cases' }).click();
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  assert.equal(await page.locator('.case-tile').count(), 41, '41 F2L cases');
  assert.equal(await page.locator('.case-tile svg.f2l-diagram').count(), 41, 'F2L pictures');
  await shot('f2l-1-cases');
  await page.getByRole('button', { name: 'None' }).click();
  await page.locator('.case-tile', { hasText: /^7$/ }).click();
  await page.getByRole('button', { name: /Start \(1 case\)/ }).click();

  // 1. Case drill: follow the shown alg (with its AUF).
  await setUp('case');
  const alg = await page.$$eval('.alg-follow .alg .mv', (els) => els.map((e) => e.textContent.replace(/[()]/g, '')));
  assert.ok(alg.length >= 7, `alg shown: ${alg.join(' ')}`);
  await shot('f2l-2-case');
  for (const m of alg) await turn(page, m, 30);
  await page.waitForTimeout(400);
  assert.equal(await phase(), 'result', 'case solved');
  assert.equal(await page.getAttribute('.trainer-run', 'data-case'), 'F2L 7');
  const stats = JSON.parse(await page.evaluate(() => localStorage.getItem('cubevite.caseStats')));
  assert.equal(stats['F2L 7']?.times.length, 1, 'case time recorded');

  // 2. Full F2L.
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'Full F2L' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await setUp('full');
  for (let guard = 0; guard < 24 && (await phase()) !== 'result'; guard++) {
    const seq = await nextPair(guard);
    for (const m of seq) await turn(page, m, 30);
    await page.waitForTimeout(250);
  }
  assert.equal(await phase(), 'result', 'all four pairs solved');
  const rows = await page.$$eval('[data-testid=f2l-pairs] tbody tr', (trs) => trs.map((tr) => tr.getAttribute('data-slot')));
  assert.equal(rows.length, 4, 'four pair rows');
  assert.deepEqual(rows.join(' ').split(' ').filter(Boolean).sort(), ['BR', 'FL', 'LB', 'RF'], `every slot once: ${rows}`);
  assert.match(await page.textContent('[data-testid=f2l-pairs]'), /F2L \d+/, 'cases named');
  await shot('f2l-3-full');
  await page.getByRole('button', { name: 'Stop' }).click();

  // 3. A CFOP-style timer solve (optimal cross, pairs one by one, solver for the LL): F2L in the solve analysis.
  await page.getByRole('button', { name: 'Timer' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 10, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  for (const m of await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent))) await turn(page, m, 25);
  await page.waitForTimeout(300);
  assert.match(await page.textContent('.status'), /Scrambled/, 'timer scramble done');
  for (const m of await crossMoves()) await turn(page, m, 40);
  for (let guard = 0; guard < 24 && (await pairsSolved()) < 4; guard++) {
    for (const m of await nextPair(guard)) await turn(page, m, 40);
  }
  for (const m of await finishMoves()) await turn(page, m, 40);
  await page.waitForTimeout(1200);
  assert.match(await page.textContent('[data-testid=f2l-line]'), /^F2L .*moves \(algs \d+\)/, 'card shows F2L cases and moves');
  await page.getByRole('button', { name: 'Full analysis' }).click();
  await page.waitForTimeout(800);
  const slots = await page.$$eval('[data-testid=f2l-section] tbody tr td:nth-child(2)', (tds) => tds.map((td) => td.textContent).join(' + ').split(' + '));
  assert.deepEqual(slots.sort(), ['BL', 'BR', 'FL', 'FR'], `F2L section covers every slot once: ${slots}`);
  assert.ok(await page.$('[data-testid=f2l-section] tr[data-used=main]'), 'a pair inserted with the DB alg is recognised');
  await page.locator('[data-testid=f2l-section]').scrollIntoViewIfNeeded();
  await shot('f2l-4-analysis');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('f2l: ok');
} finally {
  await browser.close();
}
