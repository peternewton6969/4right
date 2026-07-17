import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Served from the apex custom domain 4right.app (GitHub Pages),
  // so assets live at the site root.
  base: '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  test: {
    // tests/mobile/* are Playwright specs (mobile WebKit), run via
    // `npm run test:mobile` — not Vitest. Keep Vitest from picking them up.
    exclude: [...configDefaults.exclude, 'tests/mobile/**']
  }
})