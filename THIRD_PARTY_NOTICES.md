# Third-party notices

CubeVite is MIT licensed (see `LICENSE`). It depends on these packages, installed from npm and
bundled into the built app:

| Package | License | Source |
| --- | --- | --- |
| [cubing.js](https://js.cubing.net/cubing/) | MPL-2.0 (dual-licensed MPL-2.0 OR GPL-3.0-or-later; used under MPL-2.0) | https://github.com/cubing/cubing.js |
| [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth) | MIT, Copyright (c) Andy Fedotov | https://github.com/afedotov/gan-web-bluetooth |
| [React / React DOM](https://react.dev) | MIT | https://github.com/facebook/react |
| [RxJS](https://rxjs.dev) | Apache-2.0 | https://github.com/ReactiveX/rxjs |

`npm run build` also writes `dist/third-party-licenses.md` (Vite `build.license`) with the licence
text of every bundled package; the app footer links to it and to the cubing.js source.

cubing.js is used unmodified; its source code is available at the link above, under the
Mozilla Public License 2.0 (https://mozilla.org/MPL/2.0/). Transitive dependencies
(three.js, tslib, and others) are under MIT, Apache-2.0, BSD, ISC, 0BSD or Unlicense; run
`npm ls --all` and see each package's `LICENSE` in `node_modules/` for details.

## Trademarks

GAN is a trademark of its owner. CubeVite is an independent project, not affiliated with or
endorsed by GAN. The name is used only to say which cubes the app works with.
