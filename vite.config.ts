import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // base НЕ нужен на Netlify. Если хочешь оставить — ставь base: '/'
})
