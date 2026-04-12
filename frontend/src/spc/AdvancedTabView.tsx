import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { SPCState } from './types'

type AdvancedTabId = Extract<SPCState['activeTab'], 'compare' | 'msa' | 'correlation' | 'genie'>

const CompareView = lazy(() => import('./compare/CompareView'))
const MSAView = lazy(() => import('./msa/MSAView'))
const CorrelationView = lazy(() => import('./correlation/CorrelationView'))
const GenieView = lazy(() => import('./genie/GenieView'))

const ADVANCED_TAB_COMPONENTS: Record<AdvancedTabId, LazyExoticComponent<ComponentType>> = {
  compare: CompareView,
  msa: MSAView,
  correlation: CorrelationView,
  genie: GenieView,
}

interface AdvancedTabViewProps {
  tabId: AdvancedTabId
}

export default function AdvancedTabView({ tabId }: AdvancedTabViewProps) {
  const ActiveView = ADVANCED_TAB_COMPONENTS[tabId]
  return <ActiveView />
}
