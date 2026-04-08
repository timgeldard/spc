import { Suspense, lazy, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  GitBranch, Activity, BarChart2, Layers, Ruler, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { AppShell } from '../components/layout'
import { Card, CardContent, MetadataLabel, StatusBadge } from '../components/ui'
import { SPCProvider, useSPC } from './SPCContext'
import SPCErrorBoundary from './SPCErrorBoundary'
import SPCFilterBar from './SPCFilterBar'
import SPCPageHeader from './SPCPageHeader'
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
    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-white/70 px-6 py-12 text-sm text-slate-500 shadow-sm">
      Loading analysis view…
    </div>
  )
}

interface SPCPageProps {
  dark?: boolean
  onToggleDark?: () => void
}

function ScopeSummaryStrip() {
  const { state } = useSPC()
  const scopeCount = [
    state.selectedMaterial,
    state.selectedPlant,
    state.selectedMIC,
    state.dateFrom || state.dateTo,
  ].filter(Boolean).length

  const activeModuleLabel = TABS.find(tab => tab.id === state.activeTab)?.label ?? 'SPC'
  const chartModeLabel = state.selectedMIC?.chart_type === 'p_chart'
    ? 'Attribute'
    : state.selectedMIC?.chart_type === 'xbar_r'
      ? 'Subgroup'
      : state.selectedMIC
        ? 'Variable'
        : 'Pending'
  const exclusions = state.exclusionAudit?.excluded_count ?? state.excludedIndices.size

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card variant="dark">
        <CardContent className="space-y-3">
          <MetadataLabel className="text-slate-400">Active Module</MetadataLabel>
          <div className="text-4xl font-semibold tracking-tight text-white">{activeModuleLabel}</div>
          <StatusBadge status="healthy" label="Operational" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <MetadataLabel>Scope Completeness</MetadataLabel>
          <div className="text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">{scopeCount}/4</div>
          <StatusBadge
            status={scopeCount >= 3 ? 'healthy' : scopeCount >= 2 ? 'warning' : 'critical'}
            label={scopeCount >= 3 ? 'Analysis ready' : scopeCount >= 2 ? 'Needs refinement' : 'Scope incomplete'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <MetadataLabel>Analysis Mode</MetadataLabel>
          <div className="text-4xl font-semibold tracking-tight text-slate-900">{chartModeLabel}</div>
          <StatusBadge
            status={state.stratifyBy ? 'warning' : 'healthy'}
            label={state.stratifyBy ? `Stratified by ${state.stratifyBy.replace('_', ' ')}` : 'Single view'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <MetadataLabel>Governance State</MetadataLabel>
          <div className="text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">{exclusions}</div>
          <StatusBadge
            status={exclusions > 0 || state.limitsMode === 'locked' ? 'warning' : 'healthy'}
            label={state.limitsMode === 'locked' ? 'Locked limits active' : exclusions > 0 ? 'Reviewed exclusions' : 'Live baseline'}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function TabNavigation() {
  const { state, dispatch } = useSPC()

  return (
    <div className="border-b border-slate-200">
      <div className="flex flex-wrap gap-6">
        {TABS.map(tab => {
          const active = state.activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.id })}
              className={`pb-4 px-1 font-medium text-sm border-b-2 transition-colors ${
                active
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
              aria-current={active ? 'page' : undefined}
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
  const ActiveView = TAB_COMPONENTS[state.activeTab]
  const [tabTransitioning, setTabTransitioning] = useState(false)

  useEffect(() => {
    setTabTransitioning(true)
    const timer = window.setTimeout(() => setTabTransitioning(false), 220)
    return () => window.clearTimeout(timer)
  }, [state.activeTab])

  const shellItems = TABS.map(({ id, label, Icon }) => ({
    id,
    label: tabTransitioning && state.activeTab === id ? `${label} •` : label,
    icon: Icon,
  }))

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
        <ScopeSummaryStrip />
        <TabNavigation />
        <SPCPageHeader />
        <div className="rounded-xl border border-slate-200 bg-white/70 p-1 shadow-sm">
          <SPCErrorBoundary key={state.activeTab}>
            <AnimatePresence mode="wait">
              <motion.div
                key={state.activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
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
