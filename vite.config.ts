import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // base РќР• РЅСѓР¶РµРЅ РЅР° Netlify. Р•СЃР»Рё С…РѕС‡РµС€СЊ РѕСЃС‚Р°РІРёС‚СЊ вЂ” СЃС‚Р°РІСЊ base: '/'
})

