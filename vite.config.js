import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Served from the apex custom domain 4right.app (GitHub Pages),
  // so assets live at the site root.
  base: '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})