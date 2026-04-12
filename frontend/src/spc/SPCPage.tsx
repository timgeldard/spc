import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Tab, TabList, Tabs } from '~/lib/carbon-shell'
import { AppShell } from '../components/layout'
import { SPCProvider, shallowEqual, useSPCDispatch, useSPCSelector } from './SPCContext'
import SPCErrorBoundary from './SPCErrorBoundary'
import { useSPCUrlSync } from './hooks/useSPCUrlSync'
import { useSPCPreferences } from './hooks/useSPCPreferences'
import type { SPCState } from './types'

type TabId = SPCState['activeTab']

interface TabDefinition {
  id: TabId
  label: string
}

const SPCFilterBar = lazy(() => import('./SPCFilterBar'))
const SPCPageHeader = lazy(() => import('./SPCPageHeader'))
const OverviewPage = lazy(() => import('./overview/OverviewPage'))
const ProcessFlowView = lazy(() => import('./flow/ProcessFlowView'))
const ControlChartsView = lazy(() => import('./charts/ControlChartsView'))
const ScorecardView = lazy(() => import('./scorecard/ScorecardView'))
const AdvancedTabView = lazy(() => import('./AdvancedTabView'))

const PRIMARY_TABS: TabDefinition[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'flow', label: 'Process Flow' },
  { id: 'charts', label: 'Control Charts' },
  { id: 'scorecard', label: 'Scorecard' },
]

const ADVANCED_TABS: TabDefinition[] = [
  { id: 'compare', label: 'Compare' },
  { id: 'msa', label: 'MSA' },
  { id: 'correlation', label: 'Correlation' },
  { id: 'genie', label: 'Ask Genie' },
]

const PRIMARY_TAB_COMPONENTS: Record<Extract<TabId, 'overview' | 'flow' | 'charts' | 'scorecard'>, LazyExoticComponent<ComponentType>> = {
  overview: OverviewPage,
  flow: ProcessFlowView,
  charts: ControlChartsView,
  scorecard: ScorecardView,
}

function isAdvancedTab(tabId: TabId): tabId is Extract<TabId, 'compare' | 'msa' | 'correlation' | 'genie'> {
  return tabId === 'compare' || tabId === 'msa' || tabId === 'correlation' || tabId === 'genie'
}

function TabLoadingState() {
  return (
    <div className="spc-page-shell__loading">
      Loading analysis view…
    </div>
  )
}

function FilterBarLoadingState() {
  return (
    <div className="spc-page-shell__loading">
      Loading filters…
    </div>
  )
}

function HeaderLoadingState() {
  return (
    <div className="spc-page-shell__loading">
      Loading workspace summary…
    </div>
  )
}

interface SPCPageProps {
  dark?: boolean
  onToggleDark?: () => void
}


function getTabUnavailableReason(
  tabId: TabId,
  state: Pick<SPCState, 'selectedMaterial' | 'selectedMIC'>,
): string | null {
  if (tabId === 'overview') return null
  if (!state.selectedMaterial) return 'Select a material first'
  if (tabId === 'charts' && !state.selectedMIC) return 'Select a characteristic to view control charts'
  if (tabId === 'msa' && !state.selectedMIC) return 'Select a characteristic to run MSA'
  return null
}

function ModuleTabs() {
  const dispatch = useSPCDispatch()
  const state = useSPCSelector(
    current => ({
      roleMode: current.roleMode,
      activeTab: current.activeTab,
      selectedMaterial: current.selectedMaterial,
      selectedMIC: current.selectedMIC,
    }),
    shallowEqual,
  )
  const visibleTabs = state.roleMode === 'operator' ? PRIMARY_TABS : [...PRIMARY_TABS, ...ADVANCED_TABS]
  const selectedIndex = Math.max(visibleTabs.findIndex(tab => tab.id === state.activeTab), 0)

  return (
    <Tabs
      selectedIndex={selectedIndex}
      onChange={({ selectedIndex: nextIndex }) => {
        const nextTab = visibleTabs[nextIndex]
        if (nextTab) {
          dispatch({ type: 'SET_ACTIVE_TAB', payload: nextTab.id })
        }
      }}
    >
      <TabList aria-label="SPC analysis modules" contained>
      {visibleTabs.map(tab => {
        const unavailableReason = getTabUnavailableReason(tab.id, state)
        const disabled = Boolean(unavailableReason) && state.activeTab !== tab.id
        return (
          <Tab
            key={tab.id}
            title={unavailableReason ?? undefined}
            disabled={disabled}
          >
            {tab.label}
          </Tab>
        )
      })}
      </TabList>
    </Tabs>
  )
}

function SPCContent({ dark = false, onToggleDark }: SPCPageProps) {
  const activeTab = useSPCSelector(state => state.activeTab)
  useSPCUrlSync()
  useSPCPreferences()
  const isAdvanced = isAdvancedTab(activeTab)
  const ActivePrimaryView = isAdvanced ? null : PRIMARY_TAB_COMPONENTS[activeTab]
  const filterBar = (
    <Suspense fallback={<FilterBarLoadingState />}>
      <SPCFilterBar embedded />
    </Suspense>
  )

  return (
    <AppShell dark={dark} onToggleDark={onToggleDark} filterBar={filterBar}>
      <div className="spc-page-shell">
        <div className="spc-page-shell__tabs">
          <div className="spc-page-shell__tabs-body">
            <ModuleTabs />
          </div>
        </div>

        <Suspense fallback={<HeaderLoadingState />}>
          <SPCPageHeader />
        </Suspense>
        <div className="spc-page-shell__panel">
          <SPCErrorBoundary key={activeTab}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <Suspense fallback={<TabLoadingState />}>
                  {isAdvanced ? (
                    <AdvancedTabView tabId={activeTab} />
                  ) : ActivePrimaryView ? (
                    <ActivePrimaryView />
                  ) : null}
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
