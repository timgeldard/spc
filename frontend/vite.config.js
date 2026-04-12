import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
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
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/@carbon/ai-chat/') || id.includes('node_modules/@carbon/ai-chat-components/')) {
            return 'genie-runtime'
          }
          if (
            id.includes('node_modules/@codemirror/') ||
            id.includes('node_modules/codemirror/') ||
            id.includes('node_modules/@lezer/') ||
            id.includes('node_modules/program-language-detector/')
          ) {
            return 'codemirror-runtime'
          }
          if (
            id.includes('node_modules/markdown-it/') ||
            id.includes('node_modules/linkify-it/') ||
            id.includes('node_modules/mdurl/') ||
            id.includes('node_modules/entities/') ||
            id.includes('node_modules/uc.micro/') ||
            id.includes('node_modules/punycode.js/')
          ) {
            return 'markdown-runtime'
          }
          if (id.includes('node_modules/@carbon/web-components/') || id.includes('node_modules/lit/') || id.includes('node_modules/@lit/')) {
            return 'carbon-web'
          }
          if (id.includes('node_modules/@carbon/react/') || id.includes('node_modules/@carbon/icons')) {
            return 'carbon-react'
          }
          if (
            id.includes('/src/spc/SPCContext.tsx') ||
            id.includes('/src/spc/types.ts') ||
            id.includes('/src/spc/hooks/useSPCUrlSync.ts') ||
            id.includes('/src/spc/hooks/useSPCPreferences.ts')
          ) {
            return 'spc-core'
          }
          if (id.includes('node_modules/framer-motion/')) return 'motion'
          if (id.includes('node_modules/zrender/')) return 'zrender'
          if (id.includes('node_modules/echarts/')) return 'echarts-core'
          if (id.includes('node_modules/echarts-for-react/')) return 'echarts-react'
          if (id.includes('node_modules/@xyflow/react') || id.includes('node_modules/d3-') || id.includes('node_modules/react-d3-tree')) return 'process-flow'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/__tests__/**/*.test.{js,jsx,ts,tsx}'],
  },
})
