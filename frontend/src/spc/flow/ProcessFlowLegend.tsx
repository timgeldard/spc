import { cn } from '../../lib/utils'

const items = [
  { label: 'Healthy (< 2% rejection)', color: 'bg-green-500' },
  { label: 'Warning (2-10% rejection)', color: 'bg-amber-500' },
  { label: 'Critical (>= 10% rejection)', color: 'bg-red-500' },
  { label: 'OOC Signal Present', color: 'bg-violet-500' },
]

export default function ProcessFlowLegend() {
  return (
    <div className="absolute bottom-4 right-4 z-10 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
      <p className="mb-3 text-xs font-medium text-gray-500 dark:text-gray-400">NODE HEALTH</p>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
            <div className={cn('h-4 w-4 rounded', item.color)} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
