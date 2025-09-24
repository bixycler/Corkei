import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig(({ mode }) => {
  const HMR = (process.env.VITE_HMR === 'true')
  return {
    plugins: [solid()],
    server: {
      hmr: HMR,
    },
  }
})
