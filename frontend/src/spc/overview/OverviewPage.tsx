import { useEffect, useMemo } from 'react'
import { AlertCircle, ArrowRight, Target, TrendingUp, Users } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { useSPC } from '../SPCContext'
import { useSPCFlow } from '../hooks/useSPCFlow'
import { useSPCScorecard } from '../hooks/useSPCScorecard'
import KPICard from './KPICard'
import RecentViolations from './RecentViolations'

export default function OverviewPage() {
  const { state, dispatch } = useSPC()

  const materialLabel = state.selectedMaterial?.material_name || state.selectedMaterial?.material_id || 'No material selected'
  const plantLabel = state.selectedPlant?.plant_name || state.selectedPlant?.plant_id || 'All plants'
  const characteristicLabel = state.selectedMIC?.mic_name || state.selectedMIC?.mic_id || 'No characteristic selected'
  const hasScope = Boolean(state.selectedMaterial)
  const hasCharacteristic = Boolean(state.selectedMIC)
  const { scorecard, loading: scorecardLoading } = useSPCScorecard(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
    state.selectedPlant?.plant_id,
  )
  const { flowData, loading: flowLoading } = useSPCFlow(
    state.selectedMaterial?.material_id,
    state.dateFrom,
    state.dateTo,
  )

  const derivedKpis = useMemo(() => {
    if (!scorecard.length) {
      return { processHealth: 0, avgCpk: 0, oocPoints: 0, affectedBatches: 0 }
    }

    const capabilityValues = scorecard
      .map(row => row.cpk ?? row.ppk)
      .filter((value): value is number => value != null)

    const healthyCharacteristics = scorecard.filter(row => (
      (row.cpk ?? row.ppk ?? 0) >= 1.33 && (row.ooc_rate ?? 0) <= 0.02
    )).length

    const processHealth = Math.round((healthyCharacteristics / scorecard.length) * 100)
    const avgCpk = capabilityValues.length
      ? Number((capabilityValues.reduce((sum, value) => sum + value, 0) / capabilityValues.length).toFixed(2))
      : 0
    const oocPoints = scorecard.filter(row => (row.ooc_rate ?? 0) > 0).length
    const affectedBatches = scorecard.reduce((sum, row) => (
      sum + Math.max(0, Math.round((row.batch_count ?? 0) * (row.ooc_rate ?? 0)))
    ), 0)

    return { processHealth, avgCpk, oocPoints, affectedBatches }
  }, [scorecard])

  const derivedViolations = useMemo(() => {
    const flowViolations = (flowData?.nodes ?? [])
      .filter(node => {
        const inferredSignal = Boolean(node.last_ooc || node.has_ooc_signal)
        const weakCapability = typeof node.estimated_cpk === 'number' && node.estimated_cpk < 1
        const elevatedRejection = typeof node.rejection_rate_pct === 'number' && node.rejection_rate_pct >= 2
        return inferredSignal || weakCapability || elevatedRejection
      })
      .slice()
      .sort((a, b) => String(b.last_ooc ?? '').localeCompare(String(a.last_ooc ?? '')))
      .slice(0, 5)
      .map((node, index) => ({
        id: index + 1,
        time: node.last_ooc ? String(node.last_ooc) : 'In scope',
        rule: node.has_ooc_signal || node.last_ooc ? 'OOC signal present' : 'Capability below target',
        chart: node.material_name ?? node.material_id,
        value: typeof node.rejection_rate_pct === 'number'
          ? `${node.rejection_rate_pct.toFixed(1)}% rejection`
          : node.estimated_cpk != null
            ? `Cpk ${node.estimated_cpk.toFixed(2)}`
            : 'Review node details',
      }))

    if (flowViolations.length > 0) {
      return flowViolations
    }

    return scorecard
      .filter(row => (row.ooc_rate ?? 0) > 0 || (row.cpk ?? row.ppk ?? 999) < 1.33)
      .slice()
      .sort((a, b) => ((b.ooc_rate ?? 0) - (a.ooc_rate ?? 0)) || ((a.cpk ?? a.ppk ?? 999) - (b.cpk ?? b.ppk ?? 999)))
      .slice(0, 5)
      .map((row, index) => ({
        id: index + 1,
        time: `${row.batch_count} batches`,
        rule: (row.ooc_rate ?? 0) > 0.02 ? 'Elevated OOC rate' : 'Capability below target',
        chart: row.mic_name,
        value: (row.ooc_rate ?? 0) > 0
          ? `${((row.ooc_rate ?? 0) * 100).toFixed(1)}% OOC`
          : `Cpk ${(row.cpk ?? row.ppk ?? 0).toFixed(2)}`,
      }))
  }, [flowData?.nodes, scorecard])

  useEffect(() => {
    dispatch({ type: 'SET_LOADING', payload: hasScope && (scorecardLoading || flowLoading) })
  }, [dispatch, flowLoading, hasScope, scorecardLoading])

  useEffect(() => {
    if (!hasScope) {
      dispatch({ type: 'SET_KPIS', payload: { processHealth: 0, avgCpk: 0, oocPoints: 0, affectedBatches: 0 } })
      dispatch({ type: 'SET_RECENT_VIOLATIONS', payload: [] })
      return
    }

    dispatch({ type: 'SET_KPIS', payload: derivedKpis })
    dispatch({ type: 'SET_RECENT_VIOLATIONS', payload: derivedViolations })
  }, [derivedKpis, derivedViolations, dispatch, hasScope])

  const openFlow = () => {
    if (!hasScope) return
    dispatch({ type: 'SET_ACTIVE_TAB', payload: 'flow' })
  }

  if (state.isLoading) {
    return (
      <div className="space-y-8 p-5">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map(index => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800 lg:col-span-3" />
          <div className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800 lg:col-span-2" />
        </div>
      </div>
    )
  }

  if (hasScope && scorecard.length === 0 && state.recentViolations.length === 0) {
    return <EmptyState message="No process data available for the selected filters" />
  }

  return (
    <div className="space-y-8 p-5">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Process Health"
          value={hasScope ? `${state.kpis.processHealth}%` : '—'}
          status={hasScope ? (state.kpis.processHealth >= 85 ? 'good' : state.kpis.processHealth >= 65 ? 'warning' : 'bad') : 'neutral'}
          icon={TrendingUp}
        />
        <KPICard
          title="Avg Cpk"
          value={hasCharacteristic || hasScope ? (state.kpis.avgCpk || '—') : '—'}
          status={hasScope ? (state.kpis.avgCpk >= 1.33 ? 'good' : state.kpis.avgCpk >= 1 ? 'warning' : 'bad') : 'neutral'}
          icon={Target}
        />
        <KPICard
          title="Out of Control"
          value={hasScope ? state.kpis.oocPoints : '—'}
          unit={hasScope ? 'points' : undefined}
          status={hasScope ? (state.kpis.oocPoints > 0 ? 'warning' : 'good') : 'neutral'}
          icon={AlertCircle}
        />
        <KPICard
          title="Affected Batches"
          value={hasScope ? state.kpis.affectedBatches : '—'}
          status={hasScope ? (state.kpis.affectedBatches > 0 ? 'bad' : 'good') : 'neutral'}
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div
          role="button"
          tabIndex={hasScope ? 0 : -1}
          onClick={openFlow}
          onKeyDown={event => {
            if ((event.key === 'Enter' || event.key === ' ') && hasScope) {
              event.preventDefault()
              openFlow()
            }
          }}
          className="rounded-2xl border border-gray-200 bg-white p-6 transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900 lg:col-span-3"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Process Flow Overview</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Current scope: {materialLabel} {' • '} {plantLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation()
                openFlow()
              }}
              disabled={!hasScope}
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-blue-300 disabled:no-underline dark:text-blue-400 dark:disabled:text-blue-900/60"
            >
              Open Full Flow <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
            {hasScope ? (
              <div className="max-w-sm px-6 text-center">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Mini XYFlow Process Map
                </p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Click to open the full process map. The selected characteristic is {characteristicLabel.toLowerCase()}.
                </p>
              </div>
            ) : (
              <EmptyState message="Select a material from the filter bar to load KPI context, flow preview, and investigation shortcuts." />
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <RecentViolations />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charts' })}
          disabled={!hasCharacteristic}
          className="rounded-2xl bg-blue-600 py-4 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:hover:bg-blue-300 dark:disabled:bg-blue-900/50"
        >
          Investigate Latest OOC Signal
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'scorecard' })}
          disabled={!hasScope}
          className="rounded-2xl border border-gray-300 py-4 font-medium transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent dark:border-gray-700 dark:hover:bg-gray-900 dark:disabled:text-gray-500"
        >
          Generate Shift Report
        </button>
      </div>
    </div>
  )
}
