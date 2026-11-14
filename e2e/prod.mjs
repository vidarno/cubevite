// Production-build smoke test: run against `npm run build && npx vite preview --port 4179` with
// E2E_URL=http://localhost:4179. Catches what the dev server hides: the cubing.js scramble worker
// (it once crashed in builds only), the 3D cube chunk, the PWA manifest, and the service worker
// (installs, controls the page after a reload, starts and scrambles offline).
import assert from 'node:assert/strict';
import { BASE, launch } from './lib.mjs';

const { browser, page, errors, shot } = await launch();
const scrambleShown = () => page.waitForFunction(() => document.querySelectorAll('.scramble .mv').length >= 15, null, { timeout: 20000 });
try {
  await page.goto(`${BASE}/`);
  await scrambleShown();

  await page.getByRole('button', { name: 'Virtual cube' }).click();
  // The 3D canvas sits in a closed shadow root: check the player is laid out; errors are checked at the end.
  await page.waitForFunction(() => (document.querySelector('twisty-player')?.getBoundingClientRect().width ?? 0) > 100, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot('prod-0-live-cube');

  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'maskable icon');
  for (const i of manifest.icons) assert.equal((await page.request.get(`${BASE}/${i.src}`)).status(), 200, i.src);
  assert.equal((await page.request.get(`${BASE}/third-party-licenses.md`)).status(), 200, 'licence file');

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });

  await page.context().setOffline(true);
  await page.reload();
  await scrambleShown(); // app shell + search worker chunks from the precache
  await shot('prod-1-offline');
  await page.context().setOffline(false);

  assert.deepEqual(errors, []);
  console.log('prod: ok');
} finally {
  await browser.close();
}
