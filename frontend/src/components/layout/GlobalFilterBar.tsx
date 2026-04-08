import type { ReactNode } from 'react'
import { Button, MetadataLabel } from '../ui'

interface GlobalFilterBarProps {
  children?: ReactNode
}

export function GlobalFilterBar({ children }: GlobalFilterBarProps) {
  return (
    <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-4">
      {children ?? (
        <div className="flex flex-col gap-4 text-sm sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
          <div>
            <MetadataLabel>Material</MetadataLabel>
            <select aria-label="Material" className="mt-1 block w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400 dark:focus:border-slate-500">
              <option>All Materials</option>
              <option>Steel 304</option>
              <option>Aluminum 6061</option>
            </select>
          </div>

          <div>
            <MetadataLabel>Lot / Batch</MetadataLabel>
            <input
              type="text"
              aria-label="Lot or batch"
              placeholder="Enter lot number..."
              className="mt-1 block w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
            />
          </div>

          <div>
            <MetadataLabel>Date Range</MetadataLabel>
            <div className="mt-1 flex gap-2">
              <input aria-label="Start date" type="date" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white" />
              <span className="self-center text-slate-400 dark:text-slate-500">to</span>
              <input aria-label="End date" type="date" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white" />
            </div>
          </div>

          <div className="sm:ml-auto">
            <Button>Apply Filters</Button>
          </div>
        </div>
      )}
    </div>
  )
}
