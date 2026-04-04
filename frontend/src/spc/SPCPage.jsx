import { SPCProvider, useSPC } from './SPCContext.jsx'
import SPCFilterBar from './SPCFilterBar.jsx'
import ProcessFlowView from './flow/ProcessFlowView.jsx'
import ControlChartsView from './charts/ControlChartsView.jsx'
import ScorecardView from './scorecard/ScorecardView.jsx'
import CompareView from './compare/CompareView.jsx'
import MSAView from './msa/MSAView.jsx'
import CorrelationView from './correlation/CorrelationView.jsx'

function TabBar() {
  const { state, dispatch } = useSPC()
  const tabs = [
    { id: 'flow',        label: 'Process Flow' },
    { id: 'charts',      label: 'Control Charts' },
    { id: 'scorecard',   label: 'Scorecard' },
    { id: 'compare',     label: 'Compare' },
    { id: 'msa',         label: 'MSA' },
    { id: 'correlation', label: 'Correlation' },
  ]
  return (
    <div className="spc-tab-bar">
      {tabs.map(t => (
        <button
          key={t.id}
          className={'spc-tab' + (state.activeTab === t.id ? ' spc-tab--active' : '')}
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: t.id })}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function SPCContent() {
  const { state } = useSPC()
  return (
    <div className="spc-layout">
      <SPCFilterBar />
      <TabBar />
      <div className="spc-tab-content">
        {state.activeTab === 'flow'        && <ProcessFlowView />}
        {state.activeTab === 'charts'      && <ControlChartsView />}
        {state.activeTab === 'scorecard'   && <ScorecardView />}
        {state.activeTab === 'compare'     && <CompareView />}
        {state.activeTab === 'msa'         && <MSAView />}
        {state.activeTab === 'correlation' && <CorrelationView />}
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
