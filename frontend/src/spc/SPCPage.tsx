import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  BarChart2,
  GitBranch,
  Layers,
  LayoutDashboard,
  Microscope,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { SPCHeader } from '../components/layout'
import { SPCProvider, useSPC } from './SPCContext'
import SPCErrorBoundary from './SPCErrorBoundary'
import SPCFilterBar from './SPCFilterBar'
import SPCPageHeader from './SPCPageHeader'
import { useSPCUrlSync } from './hooks/useSPCUrlSync'
import { useSPCPreferences } from './hooks/useSPCPreferences'
import type { SPCState } from './types'
import { cn } from '../lib/utils'
import { pageShellClass } from './uiClasses'

type TabId = SPCState['activeTab']
type PrimaryTabId = Extract<TabId, 'overview' | 'flow' | 'charts' | 'scorecard'>
type AdvancedTabId = Extract<TabId, 'compare' | 'msa' | 'correlation'>

interface TabDefinition {
  id: TabId
  label: string
  Icon: LucideIcon
}

const OverviewPage = lazy(() => import('./overview/OverviewPage'))
const ProcessFlowView = lazy(() => import('./flow/ProcessFlowView'))
const ControlChartsView = lazy(() => import('./charts/ControlChartsView'))
const ScorecardView = lazy(() => import('./scorecard/ScorecardView'))
const CompareView = lazy(() => import('./compare/CompareView'))
const MSAView = lazy(() => import('./msa/MSAView'))
const CorrelationView = lazy(() => import('./correlation/CorrelationView'))

const PRIMARY_TABS: TabDefinition[] = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'flow', label: 'Process Flow', Icon: GitBranch },
  { id: 'charts', label: 'Control Charts', Icon: Activity },
  { id: 'scorecard', label: 'Scorecard', Icon: BarChart2 },
]

const ADVANCED_TABS: TabDefinition[] = [
  { id: 'compare', label: 'Compare', Icon: Layers },
  { id: 'msa', label: 'MSA', Icon: Microscope },
  { id: 'correlation', label: 'Correlation', Icon: TrendingUp },
]

const TAB_COMPONENTS: Record<TabId, LazyExoticComponent<ComponentType>> = {
  overview: OverviewPage,
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
  if (tabId === 'overview') return null
  if (!state.selectedMaterial) return 'Select a material first'
  if (tabId === 'charts' && !state.selectedMIC) return 'Select a characteristic to view control charts'
  if (tabId === 'msa' && !state.selectedMIC) return 'Select a characteristic to run MSA'
  return null
}

function PrimaryTabNavigation() {
  const { state, dispatch } = useSPC()

  return (
    <div role="tablist" aria-label="SPC analysis modules" className="flex flex-wrap items-center gap-2">
      {PRIMARY_TABS.map(tab => {
        const active = state.activeTab === tab.id
        const unavailableReason = getTabUnavailableReason(tab.id, state)
        const Icon = tab.Icon
        const disabled = Boolean(unavailableReason) && !active
        return (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${tab.id}`}
            title={unavailableReason ?? undefined}
            disabled={disabled}
            onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.id as PrimaryTabId })}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                : disabled
                  ? 'cursor-not-allowed border-slate-200 bg-white text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white',
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function AdvancedModuleRail() {
  const { state, dispatch } = useSPC()

  if (state.roleMode === 'operator') {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        Advanced
      </span>
      {ADVANCED_TABS.map(tab => {
        const active = state.activeTab === tab.id
        const unavailableReason = getTabUnavailableReason(tab.id, state)
        const disabled = Boolean(unavailableReason) && !active
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            title={unavailableReason ?? undefined}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.id as AdvancedTabId })}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                : disabled
                  ? 'cursor-not-allowed border-slate-200 bg-white text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function SPCContent({ dark = false, onToggleDark }: SPCPageProps) {
  const { state } = useSPC()
  useSPCUrlSync()
  useSPCPreferences()
  const ActiveView = TAB_COMPONENTS[state.activeTab]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <SPCHeader dark={dark} onToggleDark={onToggleDark} />

      <div className="px-4 pt-16 sm:px-6">
        <div className="sticky top-16 z-40 -mx-4 border-b border-slate-200 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-6">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-4 sm:px-6">
            <SPCFilterBar embedded />
          </div>
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 border-t border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <PrimaryTabNavigation />
            <AdvancedModuleRail />
          </div>
        </div>

        <main className="mx-auto w-full max-w-screen-2xl py-6">
          <div className={`${pageShellClass} min-h-0 gap-5 bg-transparent`}>
            <SPCPageHeader />
            <div
              role="tabpanel"
              id={`tabpanel-${state.activeTab}`}
              aria-labelledby={`tab-${state.activeTab}`}
              className="rounded-xl border border-slate-200 bg-white/70 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
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
        </main>
      </div>
    </div>
  )
}

export default function SPCPage({ dark = false, onToggleDark }: SPCPageProps) {
  return (
    <SPCProvider>
      <SPCContent dark={dark} onToggleDark={onToggleDark} />
    </SPCProvider>
  )
}
