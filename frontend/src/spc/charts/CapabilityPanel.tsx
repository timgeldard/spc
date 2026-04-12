import { useState } from 'react'
import CapabilityHistogram from './CapabilityHistogram'
import {
  CAPABILITY_TIERS,
  CapabilityPanel as IndustrialCapabilityPanel,
  getCapabilityTier,
} from '../../components/charts/CapabilityPanel'
import type { SPCComputationResult } from '../types'

interface StabilityWarningProps {
  signals?: SPCComputationResult['signals']
  mrSignals?: SPCComputationResult['mrSignals']
}

function StabilityWarning({ signals, mrSignals }: StabilityWarningProps) {
  const total = (signals?.length ?? 0) + (mrSignals?.length ?? 0)
  if (total === 0) return null
  return (
    <div style={{
      marginBottom: '0.75rem',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.5rem',
      borderRadius: 4,
      border: '1px solid var(--cds-support-warning)',
      background: 'var(--cds-notification-background-warning)',
      padding: '0.5rem 0.75rem',
      fontSize: '0.8125rem',
      lineHeight: 1.4,
      color: 'var(--cds-text-primary)',
    }}>
      <span style={{ marginTop: '0.05rem', flexShrink: 0, fontSize: '1rem' }}>⚠</span>
      <span>
        <strong>Process unstable</strong> — {total} rule violation{total !== 1 ? 's' : ''} detected.
        Cpk may be unreliable until the assignable cause is identified and removed.
      </span>
    </div>
  )
}

// Carbon-token tier styles
const TIER_STYLES = {
  healthy:  { color: 'var(--cds-support-success)', bg: 'var(--cds-notification-background-success)' },
  warning:  { color: 'var(--cds-support-warning)', bg: 'var(--cds-notification-background-warning)' },
  critical: { color: 'var(--cds-support-error)',   bg: 'var(--cds-notification-background-error)' },
} as const

type Tier = ReturnType<typeof getCapabilityTier>

function getTier(v: number | null | undefined): Tier | null {
  return getCapabilityTier(v)
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
  const tierStyle = t ? TIER_STYLES[t.status] : null
  const displayVal = value != null ? value.toFixed(2) : '—'
  return (
    <div style={{
      minWidth: 0,
      borderRadius: 4,
      padding: '0.75rem',
      background: tierStyle?.bg ?? 'var(--cds-layer)',
      border: `1px solid ${tierStyle ? tierStyle.color : 'var(--cds-border-subtle-01)'}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: tierStyle?.color ?? 'var(--cds-text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: tierStyle?.color ?? 'var(--cds-text-primary)' }}>
          {displayVal}
        </span>
        {subtitle && <span style={{ fontSize: '0.75rem', color: tierStyle?.color ?? 'var(--cds-text-secondary)' }}>{subtitle}</span>}
        {note && <span style={{ marginTop: 2, fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{note}</span>}
      </div>
    </div>
  )
}

interface CapabilityPanelProps {
  spc: SPCComputationResult | null | undefined
}

export default function CapabilityPanel({ spc }: CapabilityPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)

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
  const hasNoSpecification = spec_type === 'unspecified'
  const isUnilateral = spec_type === 'unilateral_upper' || spec_type === 'unilateral_lower'
  const cpkTier = getTier(cpk)
  const usesNonParametricCapability = capabilityMethod === 'non_parametric'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cds-text-secondary)' }}>
          Capability evidence
        </div>
        <div style={{ marginTop: 4, fontSize: '1rem', fontWeight: 700, color: 'var(--cds-text-primary)' }}>
          Process Capability
        </div>
      </div>
      <StabilityWarning signals={spc.signals} mrSignals={spc.mrSignals} />
      {hasNoSpecification && (
        <p style={{ borderRadius: 4, border: '1px solid var(--cds-border-subtle-01)', background: 'var(--cds-layer)', padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--cds-text-secondary)', margin: 0 }}>
          No specification data available — capability metrics cannot be calculated.
        </p>
      )}
      {normality?.is_normal === false && (
        <p style={{ borderRadius: 4, border: '1px solid var(--cds-support-warning)', background: 'var(--cds-notification-background-warning)', padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--cds-text-primary)', margin: 0 }}>
          Non-normal distribution — percentile-based capability applied.
          {normality?.p_value != null ? ` (Shapiro-Wilk p=${normality.p_value.toFixed(4)})` : ''}
        </p>
      )}
      {normalityWarning && normality?.is_normal !== false && (
        <p style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--cds-support-error)', margin: 0 }}>{normalityWarning}</p>
      )}
      {normality?.warning && normality?.is_normal == null && (
        <p style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: 0 }}>{normality.warning}</p>
      )}

      {/* Headline metric always visible */}
      <IndustrialCapabilityPanel
        cp={isUnilateral ? null : cp}
        cpk={cpk}
        pp={isUnilateral ? null : pp}
        ppk={ppk}
      />

      {/* Progressive disclosure for secondary stats */}
      <div style={{ borderTop: '1px solid var(--cds-border-subtle-01)', paddingTop: '0.5rem' }}>
        <button
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--cds-text-secondary)',
          }}
          type="button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen(v => !v)}
        >
          More capability stats
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ transition: 'transform 200ms', transform: detailsOpen ? 'rotate(180deg)' : 'none' }}
            aria-hidden="true"
          >
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {detailsOpen && (
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
              {cpkLower95 != null && cpkUpper95 != null && (
                <MetricCard
                  label="Cpk 95% CI"
                  value={cpk}
                  note={`[${cpkLower95.toFixed(2)}, ${cpkUpper95.toFixed(2)}]`}
                />
              )}
              {zScore != null && (
                <MetricCard label="Z (σ level)" value={zScore} tier={null} note="Process sigma" />
              )}
              {dpmo != null && (
                <div style={{ minWidth: 0, borderRadius: 4, border: '1px solid var(--cds-border-subtle-01)', background: 'var(--cds-layer)', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--cds-text-secondary)' }}>DPMO</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--cds-text-primary)' }}>{dpmo.toLocaleString()}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>1.5σ shift</span>
                  </div>
                </div>
              )}
            </div>

            {cpkTier && cp != null && cpk != null && Math.abs(cp - cpk) > 0.05 && !isUnilateral && (
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: 0 }}>
                Process is {cpk < cp ? 'off-centre' : 'centred'} — Cp {cp.toFixed(2)} vs Cpk {cpk.toFixed(2)}
              </p>
            )}
            {isUnilateral && (
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: 0 }}>Cp / Pp not defined for one-sided specification</p>
            )}
            {spc.capability?.specWarning && (
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: 0 }}>{spc.capability.specWarning}</p>
            )}

            {!hasNoSpecification && (usesNonParametricCapability ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cds-text-secondary)' }}>
                  Empirical percentile evidence
                </div>
                <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
                  <MetricCard label="P0.135" value={empiricalP00135} tier={null} note="Empirical lower tail" />
                  <MetricCard label="P50" value={empiricalP50} tier={null} note="Empirical median" />
                  <MetricCard label="P99.865" value={empiricalP99865} tier={null} note="Empirical upper tail" />
                </div>
              </div>
            ) : (
              <CapabilityHistogram spc={spc} />
            ))}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.75rem' }}>
              {CAPABILITY_TIERS.map((t, i) => (
                <span key={i} style={{ borderRadius: 999, background: 'var(--cds-layer)', padding: '2px 8px', color: TIER_STYLES[t.status].color }}>
                  {i < CAPABILITY_TIERS.length - 1 ? `≥ ${t.min.toFixed(2)} ${t.label}` : `< ${CAPABILITY_TIERS[i - 1]?.min.toFixed(2) ?? '1.33'} ${t.label}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
