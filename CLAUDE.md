# CubeVite - notes for AI coding assistants (and humans)

Speedcubing web app (Vite + React + TypeScript) for **GAN smart cubes** over Web Bluetooth
(desktop Chrome/Edge, Android Chrome). A keyboard-driven virtual cube lets everything be developed
and tested without a physical cube. Planned: native iOS app via Capacitor, so keep all Bluetooth
code behind the `CubeDevice` interface in `src/devices/`.

## Working on a change

1. Put cube logic in `src/cube/` as pure TypeScript (no DOM, no React) and unit-test it there.
2. Verify before you're done:
   - `npm test` (vitest), `npx tsc -b`, `npm run build`, `npx oxlint src`
   - `npm run e2e` - virtual-cube browser tests; needs `npm run dev -- --port 5179` running
     (`E2E_PORT` / `E2E_URL` to change, `CHROME_PATH` if Chrome isn't in the default place for your OS).
     Screenshots land in `e2e-out/`; look at them for UI changes.
   - Production-only problems (bundling, workers, service worker) don't show on the dev server:
     `npm run build && npx vite preview --port 4179`, then
     `E2E_URL=http://localhost:4179 node e2e/run.mjs prod trainer loop rotations` (CI runs both).
3. Physical-cube behaviour can't be tested automatically: say in the PR what should be checked
   with a real cube.

## Architecture

```
src/cube/       pure TS cube logic (unit tested)
src/devices/    CubeDevice interface (types.ts), gan.ts (Web Bluetooth + connection log), virtual.ts, scan.ts
src/state/      cubeStore (connection, tracked state, move stream), persisted stores (localStorage)
src/components/ UI pieces;  src/pages/  Timer, Trainer, Algorithms, Insights
e2e/            playwright-core scripts driving the virtual cube
```

Key modules in `src/cube/`:

- `facelets.ts` - 54-char Kociemba facelet string (U R F D L B order, as GAN reports). Moves derived
  geometrically (faces, wide, slices, rotations). `normalizeCenters` after rotations.
- `faceTurns.ts` - algs in smart-cube form (face turns only), rotation frames per token.
- `kpattern.ts` - facelets -> cubing.js KPattern (tested against cubing.js).
- `solver.ts` - cubing.js bridge: random-state scrambles, `movesBetween(from, to)` for setups from any state.
- `follow.ts` - state-based scramble/setup follower (accepts R2 as R' R', commuting moves, undo hints).
- `cfop.ts`, `twoLook.ts`, `states.ts` - stage predicates, OLL/PLL recognition (try AUF x alg, check result).
- `algs.ts` (OLL/PLL), `f2l.ts` (F2L) - case databases. Diagrams are generated from the alg (inverse
  applied to solved), so any new or changed case must be covered by tests: preserves what it should,
  all cases distinct, full coverage.
- `analysis.ts`, `pauses.ts`, `errors.ts`, `algId.ts`, `f2lAnalysis.ts`, `insights.ts` - solve analysis.
- `crossSolver.ts`, `crossDrill.ts`, `f2lDrill.ts`, `drills.ts`, `algLoop.ts`, `learningPath.ts` - trainers.

## Conventions that matter

- **Two frames.** Cube frame = what the cube reports: white U, green F (white cross = cube-frame U).
  Display frame = how the user holds it: yellow on top by default (`settings.yellowTop`, a `z2`).
  Track and compare state in the cube frame; convert moves only for display/input with
  `faceMapFor('z2')` + `mapMove`. To show colours correctly in TwistyPlayer, rotate the player
  (append `z2` to the setup alg); never relabel the state to fake it.
- Smart cubes report face turns only (fixed centres): slices/wide moves arrive as face turns,
  rotations are invisible. Compare against algs in face-turn form.
- GAN internal state can drift; "Mark solved" (REQUEST_RESET) resyncs.
- Case images use yellow-top colours: U yellow, F green, R orange, L red, B blue.
- Persisted data goes through `src/state/storage.ts` (localStorage now, swappable for native storage).
- Keep cubing.js in its own chunk (`codeSplitting` group in `vite.config.ts`): its search worker imports
  shared cubing code, and if that sits in the app's entry chunk the worker runs the React app and crashes.
- Deployed by CI to GitHub Pages (https://cube.pantekni.no) on every green push to `main`. PWA bits:
  `public/manifest.webmanifest`, `public/icons/` (`node scripts/icons.mjs`), `sw-template.js` ->
  `dist/sw.js` (precache list generated at build), `src/pwa.ts` (registration + update prompt).
