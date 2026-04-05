import {
  GitBranch, Activity, BarChart2, Layers, Ruler, TrendingUp,
} from 'lucide-react'
import { SPCProvider, useSPC } from './SPCContext.jsx'
import SPCFilterBar from './SPCFilterBar.jsx'
import ProcessFlowView from './flow/ProcessFlowView.jsx'
import ControlChartsView from './charts/ControlChartsView.jsx'
import ScorecardView from './scorecard/ScorecardView.jsx'
import CompareView from './compare/CompareView.jsx'
import MSAView from './msa/MSAView.jsx'
import CorrelationView from './correlation/CorrelationView.jsx'

const TABS = [
  { id: 'flow', label: 'Process Flow', Icon: GitBranch },
  { id: 'charts', label: 'Control Charts', Icon: Activity },
  { id: 'scorecard', label: 'Scorecard', Icon: BarChart2 },
  { id: 'compare', label: 'Compare', Icon: Layers },
  { id: 'msa', label: 'MSA', Icon: Ruler },
  { id: 'correlation', label: 'Correlation', Icon: TrendingUp },
]

function Sidebar() {
  const { state, dispatch } = useSPC()
  return (
    <aside style={{
      width: 200,
      flexShrink: 0,
      borderRight: '1px solid var(--c-border)',
      background: 'var(--c-surface)',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 8,
      paddingBottom: 8,
      gap: 2,
    }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = state.activeTab === id
        return (
          <button
            key={id}
            onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: id })}
            title={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              border: 'none',
              background: active ? 'rgba(27,58,75,0.08)' : 'transparent',
              borderLeft: `3px solid ${active ? 'var(--c-brand)' : 'transparent'}`,
              color: active ? 'var(--c-brand)' : 'var(--c-text-muted)',
              fontWeight: active ? 600 : 400,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              textAlign: 'left',
              borderRadius: '0 6px 6px 0',
              marginRight: 8,
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            <Icon size={16} strokeWidth={active ? 2.5 : 1.75} />
            {label}
          </button>
        )
      })}
    </aside>
  )
}

function SPCContent() {
  const { state } = useSPC()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      <SPCFilterBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem 2rem' }}>
          {state.activeTab === 'flow'        && <ProcessFlowView />}
          {state.activeTab === 'charts'      && <ControlChartsView />}
          {state.activeTab === 'scorecard'   && <ScorecardView />}
          {state.activeTab === 'compare'     && <CompareView />}
          {state.activeTab === 'msa'         && <MSAView />}
          {state.activeTab === 'correlation' && <CorrelationView />}
        </div>
      </div>
    </div>
  )
}

export default function SPCPage() {
  return (
    <SPCProvider>
      <SPCContent />
    </SPCProvider>
  )
}
