import { cn } from '../../lib/utils'

// Colours mirror ProcessNode STATUS — Kerry Jade / Sunrise / Sunset palette
const items = [
  { label: 'Healthy (< 2% rejection)',   color: '#44CF93' },
  { label: 'Warning (2–10% rejection)',  color: '#F9C20A' },
  { label: 'Critical (≥ 10% rejection)', color: '#F24A00' },
  { label: 'OOC Signal Present',         color: '#F56E33' },
]

export default function ProcessFlowLegend() {
  return (
    <div className="absolute bottom-4 right-4 z-10 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
      <p className="mb-3 text-xs font-medium text-gray-500 dark:text-gray-400">NODE HEALTH</p>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
            <div className={cn('h-4 w-4 rounded')} style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
