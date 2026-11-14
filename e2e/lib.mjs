// Shared helpers for the virtual-cube e2e scripts (playwright-core + system Chrome).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

export const PORT = process.env.E2E_PORT ?? '5179';
export const BASE = process.env.E2E_URL ?? `http://localhost:${PORT}`;
export const OUT = process.env.E2E_OUT ?? new URL('../e2e-out/', import.meta.url).pathname;
const DEFAULT_CHROME = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}[process.platform];
const CHROME = process.env.CHROME_PATH ?? DEFAULT_CHROME;

// csTimer key map used by the virtual cube (display-frame moves).
const KEY = { U: 'j', "U'": 'f', R: 'i', "R'": 'k', L: 'd', "L'": 'e', F: 'h', "F'": 'g', D: 's', "D'": 'l', B: 'w', "B'": 'o' };

export const inv = (m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : m + "'");

export async function turn(page, m, delay = 40) {
  const k = KEY[m.replace('2', '')];
  if (!k) throw new Error(`no key for move ${m}`);
  const n = m.endsWith('2') ? 2 : 1;
  for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(delay); }
}

export async function launch() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { browser, page, errors, shot: (name) => page.screenshot({ path: `${OUT}/${name}.png` }) };
}
