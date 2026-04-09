import { BookmarkPlus, CircleHelp, Download, Moon, Search, Sun, User } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useSPC } from '../../spc/SPCContext'
import { Button, Tooltip } from '../ui'

interface SPCHeaderProps {
  dark?: boolean
  onToggleDark?: () => void
}

export function SPCHeader({ dark = false, onToggleDark }: SPCHeaderProps) {
  const { state, dispatch } = useSPC()

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_GLOBAL_SEARCH', payload: event.target.value })
  }

  const handleSaveView = () => {
    const timestamp = new Date()
    const baseLabel = state.selectedMaterial?.material_name || state.selectedMaterial?.material_id || 'SPC view'
    const timeLabel = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    dispatch({
      type: 'ADD_SAVED_VIEW',
      payload: {
        id: `view-${timestamp.getTime()}`,
        name: `${baseLabel} ${timeLabel}`,
        savedAt: timestamp.toISOString(),
        activeTab: state.activeTab,
        globalSearch: state.globalSearch,
        selectedMaterial: state.selectedMaterial,
        selectedPlant: state.selectedPlant,
        selectedMIC: state.selectedMIC,
        dateFrom: state.dateFrom,
        dateTo: state.dateTo,
        stratifyBy: state.stratifyBy,
      },
    })
  }

  const handleApplySavedView = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedId = event.target.value
    if (!selectedId) return
    const savedView = state.savedViews.find(view => view.id === selectedId)
    if (savedView) {
      dispatch({ type: 'APPLY_SAVED_VIEW', payload: savedView })
    }
    event.target.value = ''
  }

  const nextRoleMode = state.roleMode === 'engineer' ? 'operator' : 'engineer'

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex min-h-16 w-full max-w-screen-2xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white dark:bg-white dark:text-slate-900">
            S
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg">
              SPC App
            </h1>
            <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
              Statistical Process Control
            </p>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 md:block">
          <div className="relative mx-auto max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={state.globalSearch}
              onChange={handleSearchChange}
              placeholder="Search by batch, lot, or material..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100 pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500"
              aria-label="Global search"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 lg:flex">
            <Tooltip
              content="Saved views snapshot your current scope, dates, tab, search text, and stratification so teams can return to the same investigation quickly."
            >
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:text-slate-600 dark:border-slate-700 dark:text-slate-500 dark:hover:border-slate-600 dark:hover:text-slate-300"
                aria-label="About saved views"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            </Tooltip>
            <select
              defaultValue=""
              onChange={handleApplySavedView}
              disabled={state.savedViews.length === 0}
              className="h-10 min-w-[170px] rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-slate-500"
              aria-label="Apply saved view"
            >
              <option value="">Saved views</option>
              {state.savedViews.map(view => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={handleSaveView}
              className="hidden lg:inline-flex"
              aria-label="Save current view"
            >
              <BookmarkPlus className="h-4 w-4" />
              Save View
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="hidden sm:inline-flex"
            aria-label="Export report"
            title="Export workflow hooks in next phase"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>

          {onToggleDark && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onToggleDark}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}

          <div className="hidden items-center gap-3 border-l border-slate-200 pl-3 dark:border-slate-800 lg:flex">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Mode
              </span>
              <Tooltip
                content="Operator mode keeps the workspace focused on core monitoring. Engineer mode unlocks advanced analysis modules and chart controls."
              >
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_ROLE_MODE', payload: nextRoleMode })}
                  aria-pressed={state.roleMode === 'engineer'}
                  className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-200 dark:bg-blue-900/60 dark:text-blue-300 dark:hover:bg-blue-900"
                >
                  {state.roleMode === 'engineer' ? 'Engineer' : 'Operator'}
                </button>
              </Tooltip>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900 dark:text-white">John Doe</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {state.roleMode === 'engineer' ? 'Quality Engineer' : 'Line Operator'}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <User className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
