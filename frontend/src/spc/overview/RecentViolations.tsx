import { AlertTriangle, ArrowRight } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { useSPC } from '../SPCContext'

export default function RecentViolations() {
  const { state, dispatch } = useSPC()

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Recent Violations
        </h3>
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charts' })}
          className="flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          View All <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {state.selectedMaterial && state.recentViolations.length > 0 ? (
        <div className="space-y-4">
          {state.recentViolations.map(violation => (
            <div
              key={violation.id}
              className="flex items-center justify-between border-b border-gray-100 py-3 last:border-0 dark:border-gray-800"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{violation.rule}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {violation.chart} {' • '} {violation.value}
                </p>
              </div>
              <div className="text-right text-xs text-gray-500 dark:text-gray-400">{violation.time}</div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="Recent SPC violations will appear here once signals are available for the selected scope." />
      )}
    </div>
  )
}
