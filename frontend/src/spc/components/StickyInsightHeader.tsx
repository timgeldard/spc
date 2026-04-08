import type { ReactNode } from 'react'
import type { StatusPillStatus } from './StatusPill'
import StatusPill from './StatusPill'

interface KPI {
  label: string
  value: ReactNode
}

interface StickyInsightHeaderProps {
  /** Context chips: material, MIC, plant, date window */
  contextLine?: string
  /** Combination status */
  status?: StatusPillStatus
  /** One-line reason explaining the status */
  statusReason?: string
  /** Up to 3 KPIs (OOC count, Cpk, latest shift etc.) */
  kpis?: KPI[]
  /** Primary actions: Acknowledge, Create Deviation */
  actions?: ReactNode
}

/**
 * Sticky insight header — answers "Is it OK? Why? What next?" on any tab.
 *
 * This is a SCAFFOLDING component. The full wiring (real status, KPIs from chart
 * data, Acknowledge + Deviation actions) is completed in PR 7 once the
 * ControlChartsView container refactor makes it safe to wire cleanly.
 *
 * For now it renders the structural shell so every tab has the same header shape,
 * and teams can validate placement / layout before the data layer lands.
 */
export default function StickyInsightHeader({
  contextLine,
  status,
  statusReason,
  kpis = [],
  actions,
}: StickyInsightHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius)] border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 shadow-[var(--shadow)]">
      <div className="flex min-w-0 flex-col gap-1.5">
        {contextLine && (
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--c-text-muted)]">
            {contextLine}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {status ? (
            <StatusPill status={status} />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-400">
              — No scope selected
            </span>
          )}
          {statusReason && (
            <span className="text-sm text-[var(--c-text-muted)]">{statusReason}</span>
          )}
        </div>
        {kpis.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {kpis.slice(0, 3).map(kpi => (
              <div key={kpi.label} className="flex items-baseline gap-1.5">
                <span className="text-base font-bold text-[var(--c-text)]">{kpi.value}</span>
                <span className="text-xs text-[var(--c-text-muted)]">{kpi.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}
