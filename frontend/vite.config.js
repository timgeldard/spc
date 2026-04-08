import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/zrender/')) return 'zrender'
          if (id.includes('node_modules/echarts/')) return 'echarts-core'
          if (id.includes('node_modules/@xyflow/react') || id.includes('node_modules/d3-') || id.includes('node_modules/react-d3-tree')) return 'process-flow'
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{js,jsx,ts,tsx}'],
  },
})
