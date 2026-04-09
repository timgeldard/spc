import { useState, type ReactNode } from 'react'
import { AlertTriangle, CircleHelp, Download, Edit3 } from 'lucide-react'
import PointExclusionModal from '../../components/Modals/PointExclusionModal'
import { Tooltip } from '../../components/ui'
import { cn } from '../../lib/utils'

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  cpk?: number | null
  note?: ReactNode
  onExcludePoint?: () => void
  onExport?: () => void
  onAnnotate?: () => void
  exportLabel?: string
  className?: string
  bodyClassName?: string
}

export default function ChartCard({
  title,
  subtitle,
  children,
  cpk = null,
  note,
  onExcludePoint,
  onExport,
  onAnnotate,
  exportLabel = 'Export',
  className,
  bodyClassName,
}: ChartCardProps) {
  const [showExclusionModal, setShowExclusionModal] = useState(false)

  const status = cpk != null
    ? cpk >= 1.33
      ? 'good'
      : cpk >= 1.0
        ? 'warning'
        : 'bad'
    : 'neutral'

  return (
    <>
      <div className={cn('overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900', className)}>
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 pb-4 pt-6 dark:border-gray-800">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>

        {cpk != null && (
          <div className="flex shrink-0 items-center gap-2">
            <div
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium',
                status === 'good' && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                status === 'warning' && 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
                status === 'bad' && 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
              )}
            >
              Cpk {cpk.toFixed(2)}
            </div>
            <Tooltip
              side="left"
              content="Cpk above 1.33 is generally healthy, 1.00 to 1.32 needs attention, and below 1.00 is high risk."
            >
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition hover:border-gray-300 hover:text-gray-600 dark:border-gray-700 dark:text-gray-500 dark:hover:border-gray-600 dark:hover:text-gray-300"
                aria-label="About capability index"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      <div className={cn('p-4', bodyClassName)}>{children}</div>

      {note && (
        <div className="border-t border-gray-100 px-6 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          {note}
        </div>
      )}

      <div className="flex flex-wrap gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setShowExclusionModal(true)}
          className="flex min-w-[150px] flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-300 py-2.5 text-sm font-medium transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <Edit3 className="h-4 w-4" />
          Exclude Point
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={!onExport}
          className="flex min-w-[150px] flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-300 py-2.5 text-sm font-medium transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <Download className="h-4 w-4" />
          {exportLabel}
        </button>
        <button
          type="button"
          onClick={onAnnotate}
          disabled={!onAnnotate}
          className="flex items-center justify-center gap-2 rounded-2xl border border-gray-300 px-5 py-2.5 text-sm font-medium transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          aria-label="Annotation action"
        >
          <AlertTriangle className="h-4 w-4" />
        </button>
      </div>
      </div>

      <PointExclusionModal
        isOpen={showExclusionModal}
        onClose={() => setShowExclusionModal(false)}
        chartTitle={title}
        onConfirm={() => onExcludePoint?.()}
      />
    </>
  )
}
