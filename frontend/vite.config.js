import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const NODE_MODULE = 'node_modules/'

function includesAny(id, patterns) {
  return patterns.some(pattern => id.includes(pattern))
}

const CHUNK_FAMILIES = [
  {
    name: 'react-vendor',
    patterns: [
      `${NODE_MODULE}react/`,
      `${NODE_MODULE}react-dom/`,
      `${NODE_MODULE}scheduler/`,
    ],
  },
  {
    name: 'genie-runtime',
    patterns: [
      `${NODE_MODULE}@carbon/ai-chat/`,
      `${NODE_MODULE}@carbon/ai-chat-components/`,
    ],
  },
  {
    name: 'codemirror-runtime',
    patterns: [
      `${NODE_MODULE}@codemirror/`,
      `${NODE_MODULE}codemirror/`,
      `${NODE_MODULE}@lezer/`,
      `${NODE_MODULE}program-language-detector/`,
    ],
  },
  {
    name: 'markdown-runtime',
    patterns: [
      `${NODE_MODULE}markdown-it/`,
      `${NODE_MODULE}linkify-it/`,
      `${NODE_MODULE}mdurl/`,
      `${NODE_MODULE}entities/`,
      `${NODE_MODULE}uc.micro/`,
      `${NODE_MODULE}punycode.js/`,
      `${NODE_MODULE}remark-`,
      `${NODE_MODULE}rehype-`,
      `${NODE_MODULE}micromark`,
      `${NODE_MODULE}mdast-`,
      `${NODE_MODULE}hast-`,
      `${NODE_MODULE}unified/`,
    ],
  },
  {
    name: 'carbon-web',
    patterns: [
      `${NODE_MODULE}@carbon/web-components/`,
      `${NODE_MODULE}lit/`,
      `${NODE_MODULE}@lit/`,
    ],
  },
  {
    name: 'carbon-table',
    patterns: [
      `${NODE_MODULE}@carbon/react/es/components/DataTable/`,
      `${NODE_MODULE}@carbon/react/es/components/DataTableSkeleton/`,
      `${NODE_MODULE}@carbon/react/es/components/Pagination/`,
      `${NODE_MODULE}@carbon/react/es/components/OverflowMenu/`,
      `${NODE_MODULE}@carbon/react/es/components/OverflowMenuItem/`,
    ],
  },
  {
    name: 'carbon-layout-react',
    patterns: [
      `${NODE_MODULE}@carbon/react/es/components/Grid/`,
      `${NODE_MODULE}@carbon/react/es/components/ContentSwitcher/`,
      `${NODE_MODULE}@carbon/react/es/components/Stack/`,
      `${NODE_MODULE}@carbon/react/es/components/Tile/`,
      `${NODE_MODULE}@carbon/react/es/components/Tag/`,
    ],
  },
  {
    name: 'carbon-date',
    patterns: [
      `${NODE_MODULE}@carbon/react/es/components/DatePicker/`,
      `${NODE_MODULE}@carbon/react/es/components/DatePickerInput/`,
      `${NODE_MODULE}flatpickr/`,
    ],
  },
  {
    name: 'carbon-icons-shell',
    patterns: [
      `${NODE_MODULE}@carbon/icons-react/es/Asleep.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Bookmark.js`,
      `${NODE_MODULE}@carbon/icons-react/es/BookmarkAdd.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Dashboard.js`,
      `${NODE_MODULE}@carbon/icons-react/es/DataTable.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Download.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Edit.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Filter.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Light.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Settings.js`,
      `${NODE_MODULE}@carbon/icons-react/es/TreeView.js`,
      `${NODE_MODULE}@carbon/icons-react/es/UserAvatar.js`,
      `${NODE_MODULE}@carbon/icons-react/es/UserRole.js`,
    ],
  },
  {
    name: 'carbon-icons-overview',
    patterns: [
      `${NODE_MODULE}@carbon/icons-react/es/Analytics.js`,
      `${NODE_MODULE}@carbon/icons-react/es/ArrowRight.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Group.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Growth.js`,
    ],
  },
  {
    name: 'carbon-icons-flow',
    patterns: [
      `${NODE_MODULE}@carbon/icons-react/es/Activity.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Branch.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Building.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Close.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Network_1.js`,
      `${NODE_MODULE}@carbon/icons-react/es/SearchAdvanced.js`,
      `${NODE_MODULE}@carbon/icons-react/es/WarningAlt.js`,
      `${NODE_MODULE}@carbon/icons-react/es/ZoomFit.js`,
    ],
  },
  {
    name: 'carbon-icons-status',
    patterns: [
      `${NODE_MODULE}@carbon/icons-react/es/CheckmarkFilled.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Misuse.js`,
      `${NODE_MODULE}@carbon/icons-react/es/SubtractFilled.js`,
      `${NODE_MODULE}@carbon/icons-react/es/WarningAltFilled.js`,
      `${NODE_MODULE}@carbon/icons-react/es/WarningFilled.js`,
    ],
  },
  {
    name: 'carbon-icons-page',
    patterns: [
      `${NODE_MODULE}@carbon/icons-react/es/Chemistry.js`,
      `${NODE_MODULE}@carbon/icons-react/es/Security.js`,
    ],
  },
  {
    name: 'carbon-icons-chart',
    patterns: [
      `${NODE_MODULE}@carbon/icons-react/es/Flag.js`,
    ],
  },
  {
    name: 'carbon-app',
    patterns: [
      `${NODE_MODULE}@carbon/react/`,
    ],
  },
]

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
          for (const family of CHUNK_FAMILIES) {
            if (includesAny(id, family.patterns)) {
              return family.name
            }
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
