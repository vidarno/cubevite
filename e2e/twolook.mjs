// 2-look e2e: run the combined "2-look OLL" and "2-look PLL" drills with the virtual cube and check
// that each shows two step times and the recognised case per step.
// The virtual cube only takes face turns, so each step is performed as the face-turn path (from
// cubing.js, via the app's own modules served by Vite) to the state the step's hint leads to.
import assert from 'node:assert/strict';
import { BASE, launch, turn } from './lib.mjs';

const { browser, page, errors, shot } = await launch();

/** Display-frame face turns that perform the hint of `drillId`'s step `step` from the current cube state. */
const stepMoves = (drillId, step) => page.evaluate(async ([drillId, step]) => {
  const { cubeStore } = await import('/src/state/cubeStore.ts');
  const { DRILL_BY_ID, toCrossDown, toCubeFrame } = await import('/src/cube/drills.ts');
  const { applyAlg, normalizeCenters } = await import('/src/cube/facelets.ts');
  const { movesBetween } = await import('/src/cube/solver.ts');
  const { faceMapFor, mapMove } = await import('/src/cube/display.ts');
  const { settingsStore } = await import('/src/state/data.ts');
  const state = cubeStore.get().state;
  const h = DRILL_BY_ID.get(drillId).steps[step].classify(state);
  const end = toCubeFrame(normalizeCenters(applyAlg(toCrossDown(state), `${h.preAuf} ${h.alg} ${h.postAuf}`)));
  const seq = (await movesBetween(state, end)).split(' ').filter(Boolean);
  const map = faceMapFor((settingsStore.get().yellowTop ?? true) ? 'z2' : '');
  return { name: h.name, moves: seq.map((m) => mapMove(m, map)) };
}, [drillId, step]);

const phase = () => page.getAttribute('.trainer-run', 'data-phase');

async function runDrill(label, drillId) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForFunction(() => {
    const r = document.querySelector('.trainer-run');
    return r && (r.getAttribute('data-phase') === 'ready' || document.querySelectorAll('.scramble .mv').length > 0);
  }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  const setup = await page.$$eval('.scramble .mv', (els) => els.map((e) => e.textContent));
  for (const m of setup) await turn(page, m, 25);
  await page.waitForTimeout(300);
  assert.equal(await phase(), 'ready', `${label}: setup completion detected`);

  // "Show algorithm" is on by default: the step's case and alg show without asking.
  assert.equal(await page.$('.step-hint button'), null, `${label}: hint shown without a click`);
  const hintText = await page.textContent('.step-hint');
  await shot(`twolook-${drillId.replace(/\W+/g, '-')}-1-hint`);

  const names = [];
  for (let step = 0; step < 2 && (await phase()) !== 'result'; step++) {
    const { name, moves } = await stepMoves(drillId, step);
    if (step === 0) assert.ok(hintText.includes(name), `${label}: hint names the case (${name})`);
    names.push(name);
    for (const m of moves) await turn(page, m, 25);
    await page.waitForTimeout(300);
    if (step === 0) {
      assert.ok(await page.locator('.drill-splits li.done').count() >= 1, `${label}: first step time recorded`);
      if ((await phase()) !== 'result') await shot(`twolook-${drillId.replace(/\W+/g, '-')}-2-step1`);
    }
  }
  assert.equal(await phase(), 'result', `${label}: drill finished`);
  await shot(`twolook-${drillId.replace(/\W+/g, '-')}-3-result`);
  const splits = await page.$$eval('.drill-splits li.done', (els) => els.map((e) => e.textContent));
  assert.equal(splits.length, 2, `${label}: two step times`);
  for (const s of splits) assert.match(s, /\d+\.\d\d/, `${label}: step time shown (${s})`);
  assert.ok(splits[0].includes(names[0]), `${label}: first split names the case`);
  assert.equal(await page.locator('.step-results li').count(), 2, `${label}: result lists both steps`);
  await page.getByRole('button', { name: 'Stop' }).click();
  return `${names.join(' + ')} | ${splits.join(' / ')}`;
}

try {
  await page.goto(`${BASE}/#trainer`);
  await page.getByRole('button', { name: 'Virtual cube' }).click();
  await page.waitForTimeout(300);
  await shot('twolook-0-picker');
  const oll = await runDrill('2-look OLL', '2L OLL');
  const pll = await runDrill('2-look PLL', '2L PLL');

  // A step drill shows step-1 case tiles.
  await page.getByRole('button', { name: 'OLL edges', exact: true }).click();
  assert.equal(await page.locator('.case-tile').count(), 3, 'OLL edges has 3 cases');
  await page.getByRole('button', { name: 'PLL corners', exact: true }).click();
  assert.equal(await page.locator('.case-tile').count(), 2, 'PLL corners has 2 cases');
  await shot('twolook-4-pll-corners-tiles');

  assert.deepEqual(errors, [], 'no page errors');
  console.log(`twolook: ok (OLL: ${oll}; PLL: ${pll})`);
} finally {
  await browser.close();
}
