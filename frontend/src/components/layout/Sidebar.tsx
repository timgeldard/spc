import type { ElementType } from 'react'
import { SideNav, SideNavItems, SideNavLink } from '@carbon/react'
import { Analytics, Dashboard, DataTable, Settings, TreeView } from '@carbon/icons-react'

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
  const resolvedActive = activeItem ?? items[0]?.id

  return (
    // isPersistent: sidebar always occupies layout space on desktop (no overlay).
    // isRail: collapses to icon-only strip when expanded={false}, matching prior behaviour.
    // Carbon's responsive CSS automatically switches to overlay mode on small viewports.
    <SideNav
      aria-label="Side navigation"
      expanded={isSideNavExpanded}
      isPersistent
      isRail
    >
      <SideNavItems>
        {items.map((item) => (
          <SideNavLink
            key={item.id}
            renderIcon={item.icon as React.ComponentType}
            isActive={resolvedActive === item.id}
            href="#"
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault()
              onSelectItem?.(item.id)
            }}
          >
            {item.label}
          </SideNavLink>
        ))}
      </SideNavItems>
    </SideNav>
  )
}
