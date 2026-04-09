import type { ReactElement } from 'react'

interface CustomTooltipEntry {
  color?: string
  name?: string
  value?: string | number | null
  payload?: Record<string, unknown>
}

interface CustomTooltipProps {
  active?: boolean
  payload?: CustomTooltipEntry[]
  label?: string
}

export function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const pointPayload = payload[0]?.payload ?? {}
  const signalSummary = typeof pointPayload.signalSummary === 'string' ? pointPayload.signalSummary : null
  const detailSummary = typeof pointPayload.detailSummary === 'string' ? pointPayload.detailSummary : null
  const batchId = typeof pointPayload.batchId === 'string' ? pointPayload.batchId : null

  return (
    <div className="min-w-[220px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      {label ? <div className="mb-2 font-medium text-slate-900">{label}</div> : null}
      {batchId ? <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{batchId}</div> : null}

      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4 py-1">
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color ?? '#0f172a' }}
            />
            <span className="text-slate-600">{entry.name}</span>
          </div>
          <span className="tabular-nums font-medium text-slate-900">
            {entry.value == null ? '—' : entry.value}
          </span>
        </div>
      ))}

      {detailSummary ? (
        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {detailSummary}
        </div>
      ) : null}

      {signalSummary ? (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {signalSummary}
        </div>
      ) : null}
    </div>
  )
}
