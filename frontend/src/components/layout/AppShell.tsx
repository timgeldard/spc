import type { ElementType, ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { GlobalFilterBar } from './GlobalFilterBar'

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex overflow-hidden">
      <Sidebar items={sidebarItems} activeItem={activeItem} onSelectItem={onSelectItem} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header dark={dark} onToggleDark={onToggleDark} />
        <GlobalFilterBar>{filterBar}</GlobalFilterBar>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
