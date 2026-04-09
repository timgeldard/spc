import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  GitBranch, Activity, BarChart2, Layers, Ruler, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { AppShell } from '../components/layout'
import { SPCProvider, useSPC } from './SPCContext'
import SPCErrorBoundary from './SPCErrorBoundary'
import SPCFilterBar from './SPCFilterBar'
import SPCPageHeader from './SPCPageHeader'
import { useSPCUrlSync } from './hooks/useSPCUrlSync'
import { useSPCPreferences } from './hooks/useSPCPreferences'
import type { SPCState } from './types'
import {
  pageShellClass,
} from './uiClasses'

type TabId = SPCState['activeTab']

interface TabDefinition {
  id: TabId
  label: string
  Icon: LucideIcon
}

const ProcessFlowView = lazy(() => import('./flow/ProcessFlowView'))
const ControlChartsView = lazy(() => import('./charts/ControlChartsView'))
const ScorecardView = lazy(() => import('./scorecard/ScorecardView'))
const CompareView = lazy(() => import('./compare/CompareView'))
const MSAView = lazy(() => import('./msa/MSAView'))
const CorrelationView = lazy(() => import('./correlation/CorrelationView'))

const TABS: TabDefinition[] = [
  { id: 'flow', label: 'Process Flow', Icon: GitBranch },
  { id: 'charts', label: 'Control Charts', Icon: Activity },
  { id: 'scorecard', label: 'Scorecard', Icon: BarChart2 },
  { id: 'compare', label: 'Compare', Icon: Layers },
  { id: 'msa', label: 'MSA', Icon: Ruler },
  { id: 'correlation', label: 'Correlation', Icon: TrendingUp },
]

const TAB_COMPONENTS: Record<TabId, LazyExoticComponent<ComponentType>> = {
  flow: ProcessFlowView,
  charts: ControlChartsView,
  scorecard: ScorecardView,
  compare: CompareView,
  msa: MSAView,
  correlation: CorrelationView,
}

function TabLoadingState() {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-white/70 px-6 py-12 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
      Loading analysis view…
    </div>
  )
}

interface SPCPageProps {
  dark?: boolean
  onToggleDark?: () => void
}


function getTabUnavailableReason(tabId: TabId, state: SPCState): string | null {
  if (!state.selectedMaterial) return 'Select a material first'
  if (tabId === 'charts' && !state.selectedMIC) return 'Select a characteristic to view control charts'
  if (tabId === 'msa' && !state.selectedMIC) return 'Select a characteristic to run MSA'
  return null
}

function TabNavigation() {
  const { state, dispatch } = useSPC()

  return (
    <div className="border-b border-slate-200 dark:border-slate-700">
      <div role="tablist" aria-label="SPC analysis modules" className="flex flex-wrap gap-6">
        {TABS.map(tab => {
          const active = state.activeTab === tab.id
          const unavailableReason = getTabUnavailableReason(tab.id, state)
          const dimmed = !active && Boolean(unavailableReason)
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`tabpanel-${tab.id}`}
              title={dimmed ? unavailableReason ?? undefined : undefined}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.id })}
              className={`pb-4 px-1 font-medium text-sm border-b-2 transition-colors ${
                active
                  ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                  : dimmed
                    ? 'border-transparent text-slate-300 dark:text-slate-600 cursor-default'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SPCContent({ dark = false, onToggleDark }: SPCPageProps) {
  const { state, dispatch } = useSPC()
  useSPCUrlSync()
  useSPCPreferences()
  const ActiveView = TAB_COMPONENTS[state.activeTab]

  const shellItems = TABS.map(({ id, label, Icon }) => ({ id, label, icon: Icon }))

  return (
    <AppShell
      dark={dark}
      onToggleDark={onToggleDark}
      sidebarItems={shellItems}
      activeItem={state.activeTab}
      onSelectItem={id => state.activeTab !== id && dispatch({ type: 'SET_ACTIVE_TAB', payload: id as TabId })}
      filterBar={<SPCFilterBar embedded />}
    >
      <div className={`${pageShellClass} min-h-0 bg-transparent gap-5`}>
        <TabNavigation />
        <SPCPageHeader />
        <div
          role="tabpanel"
          id={`tabpanel-${state.activeTab}`}
          aria-labelledby={`tab-${state.activeTab}`}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 p-1 shadow-sm"
        >
          <SPCErrorBoundary key={state.activeTab}>
            <AnimatePresence mode="wait">
              <motion.div
                key={state.activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <Suspense fallback={<TabLoadingState />}>
                  <ActiveView />
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </SPCErrorBoundary>
        </div>
      </div>
    </AppShell>
  )
}

export default function SPCPage({ dark = false, onToggleDark }: SPCPageProps) {
  return (
    <SPCProvider>
      <SPCContent dark={dark} onToggleDark={onToggleDark} />
    </SPCProvider>
  )
}
