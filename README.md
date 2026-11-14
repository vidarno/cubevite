# CubeVite

A speedcubing web app for **GAN smart cubes** (developed with a GAN i4 MagLev):
a live 3D view of the cube, random-state scrambles you follow on the physical cube,
a timer that starts and stops itself, automatic CFOP splits, and an OLL/PLL trainer.

**Try it: https://cube.pantekni.no** (desktop Chrome/Edge or Android Chrome for the smart cube; on a
phone, "Add to Home screen" installs it as an app that also works offline).

## Running

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # cube model, algorithm database, recognition, scramble follower
npm run build
npm run e2e      # virtual-cube browser tests; needs `npm run dev -- --port 5179` running
```

The e2e tests drive your installed Google Chrome through `playwright-core`. The default path is
picked per OS (macOS, Linux `/usr/bin/google-chrome`, Windows); set `CHROME_PATH` to use another
Chrome/Chromium, `E2E_PORT` or `E2E_URL` for another dev server, `E2E_OUT` for the screenshot folder
(default `e2e-out/`).

### Browsers and devices

The smart-cube connection needs **Web Bluetooth**:

| Platform | Works with the cube? |
| --- | --- |
| Chrome on macOS | Yes (developed and tested here) |
| Chrome / Edge on Windows, ChromeOS | Should work (Web Bluetooth supported; untested) |
| Chrome on Linux | Web Bluetooth may need `chrome://flags/#enable-experimental-web-platform-features` (untested) |
| Chrome on Android | Should work (not yet tested with a real cube) |
| iPhone / iPad (any browser) | No - iOS browsers have no Web Bluetooth. The Bluefy browser (App Store) adds it (untested) |
| Safari, Firefox | No |

Without a cube, the virtual cube, spacebar timer, flashcard trainer and algorithm library work in
any modern browser. Web Bluetooth needs a secure context: `localhost` or HTTPS.

### Connecting the GAN cube

GAN cubes encrypt their Bluetooth traffic with a key derived from the cube's MAC address.
Chrome only exposes the MAC with an experimental flag turned on:

1. Open `chrome://flags/#enable-experimental-web-platform-features`, enable it and restart Chrome.
2. Click **Connect GAN cube**, then pick the cube (named `GAN…`) in the browser dialog.

Without the flag, the app asks for the MAC once and remembers it per device.
**Mark solved** re-syncs the app and the cube if they ever drift apart.

No cube handy? **Virtual cube** drives everything from the keyboard (csTimer key map, shown at the bottom of the page).

## Features

- **Timer**: WCA random-state scrambles (cubing.js). With a smart cube connected, the scramble is
  highlighted as you turn. Wrong turns show an *Undo* hint, `R2` can be done as `R' R'`, and
  opposite-face moves can be done in either order. If the cube isn't solved when you start, the app
  works out moves from its current state to the scrambled state.
  The timer starts on your first turn and stops when the cube is solved. Optional 15 s inspection with +2/DNF.
  Without a smart cube it works as a normal spacebar timer.
- **CFOP analysis** (colour neutral): times for cross, each F2L pair, OLL and PLL, the recognised OLL/PLL case,
  move count and TPS. Each solve also gets a reconstruction grouped by stage, plus a 3D replay.
- **Trainer**: pick OLL/PLL cases (or the beginner 2-look subset, or the cases you've marked as
  *learning*). The app gives you a setup sequence from whatever state your cube is in, then
  times your algorithm and detects when the case is solved. Slower and unseen cases come up more often.
  Without a smart cube it falls back to flashcards.
- **Algorithms**: all 57 OLL and 21 PLL cases with diagrams, plus learning status.
  Each diagram is generated from its algorithm, so the picture and the algorithm always match.
  Tests check that every algorithm works.

## Architecture

```
src/cube/       pure TypeScript, no DOM (unit tested)
  facelets.ts   54-sticker cube model; moves derived geometrically (faces, wide, slices, rotations)
  kpattern.ts   facelets -> cubing.js KPattern (verified against cubing.js)
  cfop.ts       stage detection, OLL/PLL recognition, solve analysis
  algs.ts       OLL/PLL database
  follow.ts     state-based scramble/setup follower
  solver.ts     cubing.js bridge: scrambles, "moves from state A to B"
src/devices/    CubeDevice interface + GAN (Web Bluetooth) and virtual implementations
src/state/      cube connection store, persisted data (localStorage)
src/pages/      Timer, Trainer, Algorithms
```

## Roadmap: iOS app

iOS Safari has no Web Bluetooth, so the plan is to wrap this app with **Capacitor** and add a
`CubeDevice` implementation built on `@capacitor-community/bluetooth-le`. The GAN protocol and
decryption code from `gan-web-bluetooth` (MIT) can be adapted on top of it. Nothing outside
`src/devices/` needs to change, and native BLE can read the MAC itself, so no prompt is needed.
In the meantime, the Bluefy browser on iOS supports Web Bluetooth and is worth trying.

Other ideas: F2L case trainer, cross trainer with optimal cross solutions after each solve,
gyro-driven cube orientation, sessions and charts, IndexedDB storage.

## Deployment

Every push to `main` that passes CI (lint, unit tests, build, virtual-cube e2e on the dev server, and a
smoke test of the production build: `e2e/prod.mjs`) is deployed to GitHub Pages at
https://cube.pantekni.no. The build is a PWA: `public/manifest.webmanifest`, icons in `public/icons/`
(regenerate with `node scripts/icons.mjs`), and a service worker generated into `dist/sw.js` from
`sw-template.js` that precaches the whole build. A new deploy shows a "new version - Reload" prompt.

To check a production build locally: `npm run build && npx vite preview --port 4179`, then
`E2E_URL=http://localhost:4179 node e2e/run.mjs prod trainer loop rotations`.

## Contributing

Issues and pull requests are welcome. Cube logic lives in `src/cube/` as pure TypeScript with unit
tests; before opening a PR run `npm test`, `npx tsc -b`, `npm run build`, `npx oxlint src` and, for UI
changes, `npm run e2e` (CI runs the same). If a change affects the real cube connection, say in the PR
what you tested on which cube. [CLAUDE.md](CLAUDE.md) has the architecture notes and conventions
(written for AI coding assistants, useful for humans too).

## License

MIT, see [LICENSE](LICENSE). Third-party packages (notably cubing.js, MPL-2.0) and trademark
notes are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
