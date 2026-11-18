// Progress chart e2e (Insights): with 130 seeded timer solves (improving, one DNF, one very slow, one redo), the chart
// shows the last 100 by default with ao5/ao12/ao100 lines, ranges switch, the slow one sits above the top edge, and
// hovering shows the solve and its averages.
import assert from 'node:assert/strict';
import { BASE, launch } from './lib.mjs';

const { browser, page, errors, shot } = await launch();
try {
  await page.goto(`${BASE}/#insights`);
  await page.evaluate(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const day = 86400000;
    const solves = Array.from({ length: 130 }, (_, i) => ({
      id: `s${i}`, date: Date.now() - (130 - i) * day / 4, scramble: "R U R' U'", smart: false,
      time: Math.round(60000 - i * 150 + (rnd() - 0.5) * 12000),
    }));
    solves[100].time = null; solves[100].penalty = 'DNF';
    solves[110].time = 240000;
    solves.push({ ...solves[129], id: 'redo', redoOf: 's129', time: 1000 });
    localStorage.setItem('cubevite.solves', JSON.stringify(solves));
  });
  await page.reload();
  const chart = page.locator('[data-testid="progress"] .progress-chart');
  await chart.waitFor();
  assert.equal(await chart.getAttribute('data-n'), '100', 'last 100 by default');
  assert.equal(await chart.locator('.avg-line').count(), 3, 'ao5, ao12, ao100');
  assert.equal(await chart.locator('circle.solve-dot').count(), 98, '100 minus the DNF and the off-scale one');
  assert.equal(await chart.locator('.solve-dot.over').count(), 1, 'slow solve as a caret at the top');
  assert.match(await chart.textContent(), /1 DNF not drawn/);
  assert.match(await chart.locator('.chart-legend').textContent(), /ao5 \d+\.\d\d best/);
  await shot('progress-1');

  const box = await chart.locator('svg').boundingBox();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
  const tip = await page.getByTestId('chart-tip').textContent();
  assert.match(tip, /Solve \d+ ·/, 'tooltip names the solve');
  assert.match(tip, /ao5 \d+\.\d\d.*ao12 \d+\.\d\d.*ao100/s, `tooltip has the averages (${tip})`);
  await shot('progress-2-hover');

  await chart.getByRole('button', { name: 'last 50' }).click();
  assert.equal(await chart.getAttribute('data-n'), '50');
  await chart.getByRole('button', { name: 'all' }).click();
  assert.equal(await chart.getAttribute('data-n'), '130', 'redo left out');

  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(200);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 390, `no horizontal scroll on a phone (${w})`);
  await chart.scrollIntoViewIfNeeded();
  await shot('progress-3-phone');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('progress: ok');
} finally {
  await browser.close();
}
