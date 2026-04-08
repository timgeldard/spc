import { Bell, Moon, Settings, Sun } from 'lucide-react'
import { Button } from '../ui'

interface HeaderProps {
  dark?: boolean
  onToggleDark?: () => void
}

export function Header({ dark = false, onToggleDark }: HeaderProps) {
  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-slate-900 dark:text-white text-2xl font-semibold tracking-tight">Statistical Process Control</h1>
        <div className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-md">v2.0</div>
      </div>

      <div className="flex items-center gap-4">
        {onToggleDark && (
          <Button variant="ghost" size="sm" onClick={onToggleDark} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        )}
        <Button variant="ghost" size="sm" aria-label="Notifications">
          <Bell className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Settings">
          <Settings className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-700">
          <div className="text-right">
            <div className="text-sm font-medium text-slate-900 dark:text-white">John Doe</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Quality Engineer</div>
          </div>
          <div className="w-8 h-8 bg-slate-900 dark:bg-white dark:text-slate-900 rounded-full flex items-center justify-center text-white text-sm font-medium">JD</div>
        </div>
      </div>
    </header>
  )
}
