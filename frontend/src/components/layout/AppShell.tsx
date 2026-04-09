import type { ElementType, ReactNode } from 'react'
import { Content, HeaderContainer } from '~/lib/carbon-shell'
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

  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <>
          <SPCHeader
            dark={dark}
            onToggleDark={onToggleDark}
            showMenuButton={showSideNav}
            isSideNavExpanded={showSideNav ? isSideNavExpanded : false}
            onClickSideNavExpand={showSideNav ? onClickSideNavExpand : undefined}
          />
          {showSideNav && (
            <Sidebar
              items={sidebarItems}
              activeItem={activeItem}
              onSelectItem={onSelectItem}
              isSideNavExpanded={isSideNavExpanded}
            />
          )}
          <Content className="spc-app-shell__content">
            <GlobalFilterBar>{filterBar}</GlobalFilterBar>
            {children}
          </Content>
        </>
      )}
    />
  )
}
