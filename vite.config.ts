import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig(({ mode: _mode }) => {
  const HMR = (process.env.VITE_HMR === 'true')
  return {
    base: './',
    plugins: [solid()],
    server: {
      hmr: HMR,
    },
  }
})
