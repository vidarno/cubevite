// Runs every e2e script in sequence. Needs `npm run dev -- --port 5179` (or E2E_PORT / E2E_URL).
// `prod` is not in the default list: it needs the built app (`npm run build && npx vite preview --port 4179`,
// E2E_URL=http://localhost:4179), where only prod, trainer, loop and rotations work (the rest import /src/ modules).
import { spawnSync } from 'node:child_process';
import { BASE, OUT } from './lib.mjs';

try { await fetch(BASE); } catch {
  console.error(`e2e: no dev server at ${BASE}. Start it with: npm run dev -- --port ${process.env.E2E_PORT ?? 5179}`);
  process.exit(2);
}
const only = process.argv.slice(2);
const scripts = (only.length ? only : ['timer', 'hints', 'trainer', 'twolook', 'learning', 'insights', 'cross', 'f2l', 'loop', 'rotations']).map((s) => new URL(`./${s}.mjs`, import.meta.url).pathname);
let failed = 0;
for (const s of scripts) {
  const r = spawnSync(process.execPath, [s], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.error(`FAILED: ${s}`); }
}
console.log(failed ? `e2e: ${failed} failed` : `e2e: all passed (screenshots in ${OUT})`);
process.exit(failed ? 1 : 0);
