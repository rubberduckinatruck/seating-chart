import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Important: set base so GH Pages serves from /seating-chart/
  base: '/seating-chart/',
})
