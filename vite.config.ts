/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Writes dist/sw.js from sw-template.js after the build, with every built file in the precache
 * list and a version hash of their contents (so any change installs a new service worker).
 */
function serviceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'cubevite-sw',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir },
    closeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.startsWith('.'))
        .sort()
      const hash = createHash('sha256')
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)))
      const sw = readFileSync('sw-template.js', 'utf8')
        .replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__FILES__', JSON.stringify(['./', ...files.map((f) => `./${f}`)]))
      writeFileSync(join(outDir, 'sw.js'), sw)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  build: {
    // cubing.js in its own chunk: otherwise its shared code lands in the app's entry chunk, and the
    // scramble/search worker (which imports that shared code) runs the whole React app on load and
    // dies on `document is not defined` - production builds were stuck on "Generating scramble…".
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'cubing', test: /node_modules[\\/]cubing[\\/]/ }] } },
    },
    // Licences of all bundled dependencies (cubing.js is MPL-2.0: recipients of the built app must be
    // told where its source is). Not under a dot-dir, so static hosts like GitHub Pages serve it.
    license: { fileName: 'third-party-licenses.md' },
  },
  test: {
    // Some cube tests check thousands of random states; CI runners are a few times slower than a laptop.
    testTimeout: 30_000,
  },
})
