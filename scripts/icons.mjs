// Regenerates the PWA / home-screen PNG icons from public/favicon.svg (run: node scripts/icons.mjs).
// Uses the same system Chrome as the e2e tests (CHROME_PATH to override).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const root = new URL('../public/', import.meta.url);
const svg = readFileSync(new URL('favicon.svg', root), 'utf8');
const grid = svg.match(/<g [\s\S]*<\/g>/)[0]; // the 3x3 stickers, drawn in a 24x24 box at (4,4) of 32x32
// Maskable: full-bleed background, stickers inside the 80% safe zone (Android crops to circles/squircles).
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#111"/>${grid.replace('translate(4 4)', 'translate(7.2 7.2) scale(0.7333)')}</svg>`;
// Apple touch icon: iOS rounds the corners itself and shows transparency as black, so no rounded rect.
const apple = svg.replace(/rx="6"/, '');

const CHROME = process.env.CHROME_PATH ?? {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}[process.platform];
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const out = [
  ['icon-192.png', svg, 192], ['icon-512.png', svg, 512],
  ['maskable-192.png', maskable, 192], ['maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', apple, 180],
];
for (const [name, src, size] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml,${encodeURIComponent(src)}" width="${size}" height="${size}" style="display:block">`);
  await page.locator('img').screenshot({ path: new URL(`icons/${name}`, root).pathname, omitBackground: true });
  console.log(name);
}
await browser.close();
