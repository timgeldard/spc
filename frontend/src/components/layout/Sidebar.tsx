import { useEffect, useState, type ElementType } from 'react'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  LayoutDashboard,
  Settings,
  Table,
} from 'lucide-react'
import { Button } from '../ui'

interface SidebarItem {
  icon: ElementType
  label: string
  id: string
}

interface SidebarProps {
  items?: SidebarItem[]
  activeItem?: string
  onSelectItem?: (id: string) => void
}

const defaultNavItems: SidebarItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' },
  { icon: BarChart3, label: 'Control Charts', id: 'charts' },
  { icon: Table, label: 'Scorecard', id: 'scorecard' },
  { icon: GitBranch, label: 'Traceability', id: 'traceability' },
  { icon: Settings, label: 'Settings', id: 'settings' },
]

export function Sidebar({
  items = defaultNavItems,
  activeItem: controlledActiveItem,
  onSelectItem,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false))
  const [uncontrolledActiveItem, setUncontrolledActiveItem] = useState(items[0]?.id ?? 'charts')
  const activeItem = controlledActiveItem ?? uncontrolledActiveItem
  const effectiveCollapsed = isMobile ? true : collapsed

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (controlledActiveItem != null) return
    const itemIds = new Set(items.map(item => item.id))
    if (!itemIds.has(uncontrolledActiveItem)) {
      setUncontrolledActiveItem(items[0]?.id ?? 'charts')
    }
  }, [controlledActiveItem, items, uncontrolledActiveItem])

  const handleSelect = (id: string) => {
    setUncontrolledActiveItem(id)
    onSelectItem?.(id)
  }

  return (
    <div className={`bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 h-screen flex flex-col transition-all duration-300 ${effectiveCollapsed ? 'w-16' : 'w-64'}`}>
      <div className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-900 dark:bg-white rounded-xl flex items-center justify-center">
            <span className="text-white dark:text-slate-900 text-xl font-bold">S</span>
          </div>
          {!effectiveCollapsed && <span className="font-semibold text-slate-900 dark:text-white tracking-tight">SPC Studio</span>}
        </div>
      </div>

      <nav className="flex-1 py-6 px-3">
        <ul className="space-y-1">
          {items.map(item => {
            const Icon = item.icon
            const isActive = activeItem === item.id
            return (
              <li key={item.id}>
                <button
                  onClick={() => handleSelect(item.id)}
                  aria-label={item.label}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white border-l-4 border-slate-900 dark:border-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                  title={item.label}
                >
                  <Icon className="w-5 h-5" />
                  {!effectiveCollapsed && <span>{item.label}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        {!isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-full justify-center"
          >
            {effectiveCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        )}
      </div>
    </div>
  )
}
