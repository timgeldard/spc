import CapabilityHistogram from './CapabilityHistogram'
import type { SPCComputationResult } from '../types'
import { surfacePanelClass } from '../uiClasses'

interface StabilityWarningProps {
  signals?: SPCComputationResult['signals']
  mrSignals?: SPCComputationResult['mrSignals']
}

function StabilityWarning({ signals, mrSignals }: StabilityWarningProps) {
  const total = (signals?.length ?? 0) + (mrSignals?.length ?? 0)
  if (total === 0) return null
  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-600 bg-amber-50 px-3 py-2 text-[0.82rem] leading-[1.4] text-amber-800">
      <span className="mt-[0.05rem] shrink-0 text-base">⚠</span>
      <span>
        <strong>Process unstable</strong> — {total} rule violation{total !== 1 ? 's' : ''} detected.
        Cpk may be unreliable until the assignable cause is identified and removed.
      </span>
    </div>
  )
}

const TIERS = [
  { min: 1.67, label: 'Highly Capable', color: '#059669', bg: '#d1fae5' },
  { min: 1.33, label: 'Capable', color: '#10b981', bg: '#ecfdf5' },
  { min: 1.0, label: 'Marginally Capable', color: '#d97706', bg: '#fffbeb' },
  { min: 0, label: 'Not Capable', color: '#dc2626', bg: '#fef2f2' },
] as const

type Tier = (typeof TIERS)[number]

function getTier(v: number | null | undefined): Tier | null {
  if (v == null) return null
  for (const t of TIERS) {
    if (v >= t.min) return t
  }
  return TIERS[TIERS.length - 1]
}

interface MetricCardProps {
  label: string
  value: number | null | undefined
  tier?: Tier | null
  subtitle?: string
  note?: string
}

function MetricCard({ label, value, tier, subtitle, note }: MetricCardProps) {
  const t = tier ?? getTier(value)
  const displayVal = value != null ? value.toFixed(2) : '—'
  return (
    <div
      className="min-w-0 rounded-lg p-3"
      style={{ background: t?.bg ?? '#f9fafb', border: `1px solid ${t?.color ?? '#e5e7eb'}20` }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium" style={{ color: t?.color ?? '#6b7280' }}>{label}</span>
        <span className="text-2xl font-bold leading-none tabular-nums" style={{ color: t?.color ?? '#111827' }}>
          {displayVal}
        </span>
        {subtitle && <span className="text-xs" style={{ color: t?.color ?? '#6b7280' }}>{subtitle}</span>}
        {note && <span className="mt-0.5 text-xs text-gray-400">{note}</span>}
      </div>
    </div>
  )
}

interface CapabilityPanelProps {
  spc: SPCComputationResult | null | undefined
}

export default function CapabilityPanel({ spc }: CapabilityPanelProps) {
  if (!spc?.capability) return null

  const {
    cp,
    cpk,
    pp,
    ppk,
    cpkLower95,
    cpkUpper95,
    zScore,
    dpmo,
    spec_type,
    normality,
    normalityWarning,
    capabilityMethod,
    empiricalP00135,
    empiricalP50,
    empiricalP99865,
  } = spc.capability
  const isUnilateral = spec_type === 'unilateral_upper' || spec_type === 'unilateral_lower'
  const cpkTier = getTier(cpk)
  const usesNonParametricCapability = capabilityMethod === 'non_parametric'

  return (
    <div className={surfacePanelClass}>
      <div className="mb-3 text-sm font-bold text-[var(--c-text)]">Process Capability</div>
      <StabilityWarning signals={spc.signals} mrSignals={spc.mrSignals} />
      {normality?.is_normal === false && (
        <p className="mb-2 text-xs text-red-700">
          Distribution is non-normal. Non-parametric capability calculations (P50, P99.8, P0.1) applied.
          {normality?.p_value != null ? ` (Shapiro-Wilk p=${normality.p_value.toFixed(4)})` : ''}
        </p>
      )}
      {normalityWarning && normality?.is_normal !== false && (
        <p className="mb-2 text-xs text-red-700">{normalityWarning}</p>
      )}
      {normality?.warning && normality?.is_normal == null && (
        <p className="mb-2 text-xs text-amber-700">{normality.warning}</p>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        {!isUnilateral && <MetricCard label="Cp" value={cp} note="Short-term" />}
        <MetricCard
          label="Cpk"
          value={cpk}
          note={cpkLower95 != null && cpkUpper95 != null ? `95% CI [${cpkLower95.toFixed(2)}, ${cpkUpper95.toFixed(2)}]` : 'Short-term'}
        />
        {!isUnilateral && <MetricCard label="Pp" value={pp} note="Long-term" />}
        <MetricCard label="Ppk" value={ppk} note="Long-term" />
        {zScore != null && (
          <MetricCard label="Z (σ level)" value={zScore} tier={null} note="Process sigma" />
        )}
        {dpmo != null && (
          <div className="min-w-0 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-gray-500">DPMO</span>
              <span className="text-2xl font-bold leading-none tabular-nums text-gray-800">{dpmo.toLocaleString()}</span>
              <span className="text-xs text-gray-400">1.5σ shift</span>
            </div>
          </div>
        )}
      </div>

      {cpkTier && cp != null && cpk != null && Math.abs(cp - cpk) > 0.05 && (
        <p className="mb-2 text-xs text-gray-500">
          Process is {cpk < cp ? 'off-centre' : 'centred'} — Cp {cp.toFixed(2)} vs Cpk {cpk.toFixed(2)}
        </p>
      )}
      {isUnilateral && (
        <p className="mb-2 text-xs text-gray-400">Cp / Pp not defined for one-sided specification</p>
      )}
      {spc.capability?.specWarning && (
        <p className="mb-2 text-xs text-amber-700">{spc.capability.specWarning}</p>
      )}

      {usesNonParametricCapability ? (
        <div className="mb-3 grid grid-cols-3 gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
          <MetricCard label="P0.135" value={empiricalP00135} tier={null} note="Empirical lower tail" />
          <MetricCard label="P50" value={empiricalP50} tier={null} note="Empirical median" />
          <MetricCard label="P99.865" value={empiricalP99865} tier={null} note="Empirical upper tail" />
        </div>
      ) : (
        <CapabilityHistogram spc={spc} />
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {TIERS.map((t, i) => (
          <span key={i} style={{ color: t.color }}>
            {i < TIERS.length - 1 ? `≥ ${t.min.toFixed(2)} ${t.label}` : `< 1.00 ${t.label}`}
          </span>
        ))}
      </div>
    </div>
  )
}
