import type { ElementType } from 'react'
import Analytics from '@carbon/icons-react/es/Analytics.js'
import Dashboard from '@carbon/icons-react/es/Dashboard.js'
import DataTable from '@carbon/icons-react/es/DataTable.js'
import Settings from '@carbon/icons-react/es/Settings.js'
import TreeView from '@carbon/icons-react/es/TreeView.js'

interface SidebarItem {
  icon: ElementType
  label: string
  id: string
}

interface SidebarProps {
  items?: SidebarItem[]
  activeItem?: string
  onSelectItem?: (id: string) => void
  isSideNavExpanded?: boolean
}

const defaultNavItems: SidebarItem[] = [
  { icon: Dashboard,  label: 'Dashboard',      id: 'dashboard'    },
  { icon: Analytics,  label: 'Control Charts', id: 'charts'       },
  { icon: DataTable,  label: 'Scorecard',       id: 'scorecard'    },
  { icon: TreeView,   label: 'Traceability',    id: 'traceability' },
  { icon: Settings,   label: 'Settings',        id: 'settings'     },
]

export function Sidebar({
  items = defaultNavItems,
  activeItem,
  onSelectItem,
  isSideNavExpanded = false,
}: SidebarProps) {
  if (!items.length) {
    return null
  }

  const resolvedActive = activeItem ?? items[0]?.id

  return (
    <aside
      aria-label="Side navigation"
      style={{
        width: isSideNavExpanded ? '15rem' : '3.5rem',
        borderRight: '1px solid var(--cds-border-subtle-01)',
        background: 'var(--cds-layer)',
        padding: '0.5rem 0',
        transition: 'width 160ms ease',
        overflow: 'hidden',
      }}
    >
      <nav style={{ display: 'grid', gap: '0.125rem' }}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectItem?.(item.id)}
            aria-current={resolvedActive === item.id ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              width: '100%',
              minHeight: '2.75rem',
              padding: isSideNavExpanded ? '0 1rem' : '0 0.75rem',
              border: 'none',
              background: resolvedActive === item.id ? 'var(--cds-layer-selected)' : 'transparent',
              color: 'var(--cds-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <item.icon />
            {isSideNavExpanded ? <span>{item.label}</span> : null}
          </button>
        ))}
      </nav>
    </aside>
  )
}
