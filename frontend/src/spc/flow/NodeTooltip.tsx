import { AlertTriangle, Activity, Factory } from 'lucide-react'
import { cn } from '../../lib/utils'

interface NodeTooltipProps {
  label: string
  plantName?: string | null
  rejectionRate?: number | null
  cpk?: number | null
  totalBatches?: number | null
  rejectedBatches?: number | null
  lastOoc?: string | null
  hasSignal?: boolean | null
}

export default function NodeTooltip({
  label,
  plantName,
  rejectionRate,
  cpk,
  totalBatches,
  rejectedBatches,
  lastOoc,
  hasSignal,
}: NodeTooltipProps) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 hidden w-64 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/98 p-4 text-left shadow-xl ring-1 ring-slate-950/5 group-hover:block dark:border-slate-700 dark:bg-slate-950/98 dark:ring-white/10">
      <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
      {plantName && (
        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Factory className="h-3.5 w-3.5" />
          {plantName}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div>
          <div className="font-semibold uppercase tracking-[0.08em]">Rejection</div>
          <div className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
            {rejectionRate != null ? `${rejectionRate.toFixed(1)}%` : 'Unavailable'}
          </div>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-[0.08em]">Cpk</div>
          <div className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
            {cpk != null ? cpk.toFixed(2) : 'Unavailable'}
          </div>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-[0.08em]">Batches</div>
          <div className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
            {totalBatches ?? 0}
          </div>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-[0.08em]">Rejected</div>
          <div className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
            {rejectedBatches ?? 0}
          </div>
        </div>
      </div>

      {(hasSignal || lastOoc) && (
        <div
          className={cn(
            'mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
            'bg-[#FCDBCC] text-[#F24A00] dark:bg-[#3D1200] dark:text-[#F56E33]',  // Kerry Sunset
          )}
        >
          {lastOoc ? <AlertTriangle className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
          {lastOoc ? `Latest OOC ${lastOoc}` : 'OOC attention signal inferred'}
        </div>
      )}
    </div>
  )
}
