// Rotations e2e: PLL Ab (x ... x'). Rotation steps are marked and explained; a wrong turn after the x
// shows the undo as held after the x plus the undo if the x was skipped; "No rotations" shows and
// follows the rotation-free alg (the smart cube can't see rotations anyway).
import assert from 'node:assert/strict';
import { BASE, launch, turn } from './lib.mjs';

const { browser, page, errors, shot } = await launch();
const blur = () => page.evaluate(() => document.activeElement?.blur()); // the virtual cube ignores keys in inputs
const algMoves = () => page.$$eval('.alg-follow .alg .mv', (els) => els.map((e) => e.textContent.replace(/[()⟳]/g, '')));
const setUp = async () => {
  await page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length > 0, null, { timeout: 20000 });
  for (const m of await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent))) await turn(page, m, 30);
  await page.waitForTimeout(300);
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'ready', 'set up');
};
try {
  await page.goto(`${BASE}/#trainer`);
  await page.getByRole('button', { name: 'Trainer' }).click();
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await page.getByRole('button', { name: 'None' }).click();
  await page.locator('.case-tile', { hasText: /^Ab$/ }).click();
  await page.getByRole('button', { name: /Start \(1 case\)/ }).click();
  await setUp();

  // The rotation steps are marked and explained.
  assert.equal(await page.locator('.alg-follow .mv.rot').count(), 2, 'x and x\' marked as rotations');
  assert.match(await page.textContent('.rot-help'), /x.*front comes up to the top/s, 'x explained');
  const moves = await algMoves();
  const first = moves.findIndex((m) => m === 'x');
  // Do any AUF, then R (half of R2), then skip the x and turn the bottom face: the cube sees D.
  for (const m of moves.slice(0, first)) await turn(page, m, 30);
  await turn(page, 'R', 30);
  await turn(page, 'D', 30);
  await page.waitForTimeout(200);
  assert.match(await page.textContent('.alg-follow .fix'), /Undo:\s*F'/, 'undo named as held after the x');
  assert.match(await page.textContent('[data-testid="fix-unrotated"]'), /D'/, 'undo for a skipped x');
  await shot('rotations-1-undo');
  await turn(page, "D'", 30);
  await page.waitForTimeout(200);
  assert.equal(await page.$('.alg-follow .fix'), null, 'undo clears the hint');

  // "No rotations": the alg without x, followed to the end on the (rotation-blind) cube.
  await page.getByLabel('No rotations').check();
  await blur();
  await page.getByRole('button', { name: 'Restart case' }).click();
  await setUp();
  const plain = await algMoves();
  assert.equal(await page.locator('.alg-follow .mv.rot').count(), 0, 'no rotations shown');
  assert.equal(await page.$('.rot-help'), null, 'no rotation help');
  assert.match(plain.join(' '), /R2 B2 R F R' B2 R F' R/, 'rotation-free Ab');
  await shot('rotations-2-no-rotations');
  for (const m of plain) await turn(page, m, 30);
  await page.waitForTimeout(300);
  assert.equal(await page.getAttribute('.trainer-run', 'data-phase'), 'result', 'the rotation-free alg solves the case');

  // The algs page shows it the same way while the setting is on.
  await page.goto(`${BASE}/#algs`);
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  await page.waitForTimeout(500);
  assert.match(await page.textContent('.alg-card[data-case="PLL Ab"] .alg'), /^R2 B2 R F R' B2 R F' R$/, 'algs page without rotations');
  await page.getByLabel('No rotations').uncheck();
  assert.match(await page.textContent('.alg-card[data-case="PLL Ab"] .alg'), /^x R2 D2/, 'and with them again');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('rotations: ok');
} finally {
  await browser.close();
}
