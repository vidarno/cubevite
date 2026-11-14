// Timer e2e: follow a scramble (with one mistake + undo), solve it, check the solve is recorded.
import assert from 'node:assert/strict';
import { BASE, launch, turn, inv } from './lib.mjs';

const { browser, page, errors, shot } = await launch();
try {
  await page.goto(`${BASE}/#timer`);
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 10, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await shot('timer-1-scramble');
  const moves = await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent));

  for (let i = 0; i < moves.length; i++) {
    await turn(page, moves[i]);
    if (i === 2) {
      await turn(page, moves[3][0] === 'D' ? 'B' : 'D'); // a wrong move
      await page.waitForTimeout(150);
      await shot('timer-2-mistake');
      assert.match(await page.textContent('.status'), /undo/i, 'mistake shows undo hint');
      await turn(page, moves[3][0] === 'D' ? "B'" : "D'");
    }
  }
  await page.waitForTimeout(300);
  await shot('timer-3-ready');
  assert.match(await page.textContent('.status'), /Scrambled/, 'scramble completion detected');

  for (const m of [...moves].reverse().map(inv)) await turn(page, m, 60);
  await page.waitForTimeout(1200);
  await shot('timer-4-solved');
  const items = await page.$$eval('.history-item', (els) => els.map((e) => e.textContent));
  assert.equal(items.length, 1, 'one solve in history');
  const qtm = moves.reduce((n, m) => n + (m.endsWith('2') ? 2 : 1), 0); // smart cube reports quarter turns
  assert.match(items[0], new RegExp(`${qtm} moves`), 'solve records the move count');

  const card = await page.textContent('.analysis-card');
  assert.match(card, /Pauses/, `summary card under the timer (${card})`);
  assert.match(card, /Errors/, 'summary card lists errors');
  assert.match(await page.textContent('[data-testid=cross-line]'), /Cross \w+ · \d+ moves \((optimal|optimal \d+: .+)\)/, 'card shows cross vs optimal');
  await page.getByRole('button', { name: 'Full analysis' }).click();
  await page.waitForTimeout(1000);
  await shot('timer-5-detail');
  assert.ok((await page.$('.reconstruction')) !== null, 'solve detail shows reconstruction');
  assert.equal(await page.locator('.tl-move').count(), qtm, 'timeline shows every move');
  const opt = Number(await page.getAttribute('.cross-section', 'data-optimal'));
  const mine = Number(await page.getAttribute('.cross-section', 'data-moves'));
  assert.ok(opt >= 0 && opt <= 8 && opt <= mine, `detail shows cross ${mine} vs optimal ${opt}`);
  assert.ok((await page.$$('.cross-section .cross-solutions li')).length >= 1, 'optimal cross solutions listed');
  await page.locator('.modal button', { hasText: 'Close' }).click();

  // Redo with the optimal cross: the way back from solved is the scramble itself; the optimal cross is followed live.
  await page.locator('.analysis-card button', { hasText: 'Redo with optimal cross' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 0, null, { timeout: 20000 });
  assert.match(await page.textContent('.status'), /Redo/, 'redo status');
  const back = await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent));
  assert.deepEqual(back, moves, 'redo from solved replays the original scramble');
  for (const m of back) await turn(page, m);
  await page.waitForTimeout(300);
  assert.match(await page.textContent('.status'), /Scrambled/, 'redo setup done');
  assert.ok(await page.$('.cross-follow .alg-follow'), 'optimal cross shown');
  await shot('timer-7-redo-cross');
  /** Display-frame moves from the current state: the optimal cross for `face`, or the rest of the solve. */
  const displayMoves = (face) => page.evaluate(async (face) => {
    const { cubeStore } = await import('/src/state/cubeStore.ts');
    const { solveCross } = await import('/src/cube/crossSolver.ts');
    const { movesBetween } = await import('/src/cube/solver.ts');
    const { SOLVED } = await import('/src/cube/facelets.ts');
    const { faceMapFor, mapMove } = await import('/src/cube/display.ts');
    const { settingsStore } = await import('/src/state/data.ts');
    const map = faceMapFor((settingsStore.get().yellowTop ?? true) ? 'z2' : '');
    const st = cubeStore.get().state;
    const alg = face ? solveCross(st, face, 1)[0] : await movesBetween(st, SOLVED);
    return alg.split(' ').filter(Boolean).map((m) => mapMove(m, map));
  }, face);
  const crossFace = JSON.parse(await page.evaluate(() => localStorage.getItem('cubevite.solves')))[0].splits.crossFace;
  const crossMoves = await displayMoves(crossFace);
  for (const m of crossMoves) await turn(page, m, 60);
  await page.waitForTimeout(300);
  assert.equal(await page.$('.cross-follow'), null, 'cross follower goes away once the cross is solved');
  for (const m of await displayMoves(null)) await turn(page, m, 60);
  await page.waitForTimeout(1200);
  const items2 = await page.$$eval('.history-item', (els) => els.map((e) => e.textContent));
  assert.equal(items2.length, 2, 'redo solve recorded');
  assert.match(items2[0], /redo/, 'redo tagged in history');
  assert.equal(await page.textContent('.stat:has(.stat-l:text-is("solves")) .stat-v'), '1', 'redo not counted');
  const redoCross = await page.textContent('[data-testid=cross-line]');
  assert.match(redoCross, new RegExp(`${crossMoves.length} moves \\(optimal\\)`), `redo cross is optimal (${redoCross})`);

  // A stored 2-look solve (built with the app's pure modules) shows its LL sub-steps in the splits.
  await page.evaluate(async () => {
    const { applyAlg, invertAlg, SOLVED, tokenize } = await import('/src/cube/facelets.ts');
    const { toFaceTurns } = await import('/src/cube/faceTurns.ts');
    const { analyzeSolve } = await import('/src/cube/cfop.ts');
    const algs = ["F R U R' U' F'", "U U'", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "M2 U M U2 M' U M2"];
    const moves = algs.flatMap((a) => tokenize(a === "U U'" ? a : toFaceTurns(a))).map((m, i) => ({ move: m, t: (i + 1) * 150 + (i >= 9 ? 2000 : 0) })); // 2 s pause inside the Sune
    const start = applyAlg(SOLVED, invertAlg(moves.map((m) => m.move).join(' ')));
    const time = moves[moves.length - 1].t;
    const solve = { id: 'e2e-2look', date: Date.now(), scramble: '', time, smart: true, start, moves, splits: analyzeSolve(start, moves) };
    localStorage.setItem('cubevite.solves', JSON.stringify([solve]));
  });
  await page.reload();
  await page.waitForTimeout(500);
  await page.locator('.history-item').first().click();
  await page.waitForTimeout(800);
  await shot('timer-6-2look-detail');
  const rows = await page.$$eval('.splits tr td:first-child', (els) => els.map((e) => e.textContent));
  for (const r of ['OLL edges', 'OCLL', 'PLL corners', 'PLL edges']) assert.ok(rows.includes(r), `splits show ${r} (${rows.join(', ')})`);
  const algCells = await page.$$eval('.splits tr td:last-child', (els) => els.map((e) => e.textContent));
  for (const a of ['Line', 'OLL 27 (Sune)', 'Headlights: T-perm', 'Ua-perm']) assert.ok(algCells.includes(a), `splits identify ${a} (${algCells.join(', ')})`);
  const rec = await page.$eval('.reconstruction', (e) => e.textContent);
  assert.match(rec, /PLL corners: Headlights: T-perm/, 'reconstruction labels LL steps with the identified alg');
  const pauses = await page.$$eval('.pause:not(.pause-error)', (els) => els.map((e) => e.textContent));
  assert.equal(pauses.length, 1, `one pause (${pauses.join(' | ')})`);
  assert.match(pauses[0], /mid-algorithm: OLL 27 \(Sune\).*drill it/, 'pause inside the Sune is mid-algorithm');
  const errs = await page.$$eval('.pause-error', (els) => els.map((e) => e.textContent));
  assert.equal(errs.length, 2, `two errors (${errs.join(' | ')})`);
  assert.match(errs[0], /OCLL:.*extra AUF \(U U'\): 2 moves wasted/, 'U U\' before the Sune is an extra AUF');
  assert.match(errs[1], /cancellation \(R' R\)/, "Sune's last R' + T-perm's first R is a cancellation");
  // Timeline: stage bands, the pause (hatched), both errors; clicking the pause jumps the replay there.
  const bands = await page.$$eval('.tl-band', (els) => els.map((e) => e.title.split(':')[0]));
  assert.deepEqual(bands, ['OLL edges', 'OCLL', 'PLL corners', 'PLL edges'], `timeline bands (${bands.join(', ')})`);
  assert.equal(await page.locator('.tl-pause').count(), 1, 'timeline shows the pause');
  assert.equal(await page.locator('.tl-error').count(), 2, 'timeline shows the errors');
  await page.locator('.tl-pause').click();
  await page.waitForTimeout(600);
  await shot('timer-6b-timeline-jump');
  const [cursorLeft, pauseLeft] = await page.evaluate(() => ['.tl-cursor', '.tl-pause'].map((q) => parseFloat(document.querySelector(q).style.left)));
  assert.ok(Math.abs(cursorLeft - pauseLeft) < 0.01, `replay cursor jumped to the pause (${cursorLeft} vs ${pauseLeft})`);
  await page.locator('.pause button.link').click();
  await page.waitForTimeout(500);
  await shot('timer-7-drill-it');
  assert.equal(await page.evaluate(() => location.hash), '#trainer', '"drill it" opens the trainer');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cubevite.trainerDrill'))), '2L OCLL', 'on the OCLL drill');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('cubevite.trainerSel'))['2L OCLL']), ['OLL 27'], 'with only that case selected');
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`timer: ok (${moves.length}-move scramble)`);
} finally {
  await browser.close();
}
