export default function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="text-gray-300">
        {icon ?? (
          <svg width="80" height="60" viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="78" height="58" rx="5" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4"/>
            <line x1="1" y1="45" x2="79" y2="45" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3"/>
            <circle cx="20" cy="32" r="3" fill="currentColor"/>
            <circle cx="35" cy="24" r="3" fill="currentColor"/>
            <circle cx="50" cy="28" r="3" fill="currentColor"/>
            <circle cx="65" cy="18" r="3" fill="currentColor"/>
            <polyline points="20,32 35,24 50,28 65,18" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          </svg>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 max-w-xs">{subtitle}</p>}
      </div>
    </div>
  )
}
