import type { ReactElement } from 'react'

interface CustomTooltipEntry {
  color?: string
  name?: string
  value?: string | number | null
}

interface CustomTooltipProps {
  active?: boolean
  payload?: CustomTooltipEntry[]
  label?: string
}

export function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-2xl">
      {label ? <div className="mb-2 font-medium text-slate-900">{label}</div> : null}

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
    </div>
  )
}
