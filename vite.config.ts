import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Licences of all bundled dependencies (cubing.js is MPL-2.0: recipients of the built app must be
    // told where its source is). Not under a dot-dir, so static hosts like GitHub Pages serve it.
    license: { fileName: 'third-party-licenses.md' },
  },
})
