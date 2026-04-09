import type { ElementType, ReactNode } from 'react'
import { Content, HeaderContainer } from '@carbon/react'
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
  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <>
          <SPCHeader
            dark={dark}
            onToggleDark={onToggleDark}
            isSideNavExpanded={isSideNavExpanded}
            onClickSideNavExpand={onClickSideNavExpand}
          />
          <Sidebar
            items={sidebarItems}
            activeItem={activeItem}
            onSelectItem={onSelectItem}
            isSideNavExpanded={isSideNavExpanded}
          />
          <Content>
            {/* GlobalFilterBar: migrate to Carbon Select/TextInput/DatePicker in Phase 2 */}
            <GlobalFilterBar>{filterBar}</GlobalFilterBar>
            {children}
          </Content>
        </>
      )}
    />
  )
}
