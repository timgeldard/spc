import { useState } from 'react'
import type { ElementType, ReactNode } from 'react'
import { GlobalFilterBar } from './GlobalFilterBar'
import { SPCHeader } from './SPCHeader'
import { Sidebar } from './Sidebar'

interface SidebarItem {
  icon: ElementType
  label: string
  id: string
}

interface AppShellProps {
  children: ReactNode
  dark?: boolean
  onToggleDark?: () => void
  sidebarItems?: SidebarItem[]
  activeItem?: string
  onSelectItem?: (id: string) => void
  filterBar?: ReactNode
}

export function AppShell({
  children,
  dark = false,
  onToggleDark,
  sidebarItems,
  activeItem,
  onSelectItem,
  filterBar,
}: AppShellProps) {
  const showSideNav = Boolean(sidebarItems && sidebarItems.length > 0)
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false)

  return (
    <>
      <SPCHeader
        dark={dark}
        onToggleDark={onToggleDark}
        showMenuButton={showSideNav}
        isSideNavExpanded={showSideNav ? isSideNavExpanded : false}
        onClickSideNavExpand={showSideNav ? () => setIsSideNavExpanded(prev => !prev) : undefined}
      />
      {showSideNav && (
        <Sidebar
          items={sidebarItems}
          activeItem={activeItem}
          onSelectItem={onSelectItem}
          isSideNavExpanded={isSideNavExpanded}
        />
      )}
      <div className="spc-app-shell__content">
        <GlobalFilterBar>{filterBar}</GlobalFilterBar>
        {children}
      </div>
    </>
  )
}
