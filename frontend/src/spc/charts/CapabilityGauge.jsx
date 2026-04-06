/**
 * SVG semi-circle gauge for a single capability index (Cp, Cpk, Pp, Ppk).
 * Scale: 0 to 2.0. Zones: red < 1.0, amber 1.0–1.33, green ≥ 1.33.
 *
 * @param {string} label
 * @param {number|null} value
 * @param {number} [maxValue=2.0]
 * @param {number|null} [lower95]  lower 95% CI bound (Cpk/Ppk only)
 * @param {number|null} [upper95]  upper 95% CI bound (Cpk/Ppk only)
 */
export default function CapabilityGauge({ label, value, maxValue = 2.0, lower95 = null, upper95 = null }) {
  const W = 120
  const H = 70
  const CX = W / 2
  const CY = H - 10
  const R = 50
  const STROKE = 10

  const MIN_ANGLE = -180
  const MAX_ANGLE = 0

  function valueToAngle(v) {
    if (v === null || v === undefined) return MIN_ANGLE
    const clamped = Math.max(0, Math.min(maxValue, v))
    return MIN_ANGLE + (clamped / maxValue) * (MAX_ANGLE - MIN_ANGLE)
  }

  function polarToXY(angleDeg, r) {
    const rad = (angleDeg * Math.PI) / 180
    return {
      x: CX + r * Math.cos(rad),
      y: CY + r * Math.sin(rad),
    }
  }

  function arc(startDeg, endDeg, r, stroke) {
    const s = polarToXY(startDeg, r)
    const e = polarToXY(endDeg, r)
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
  }

  const needleAngle = valueToAngle(value)
  const needleTip = polarToXY(needleAngle, R - STROKE / 2 - 2)
  const needleBase1 = polarToXY(needleAngle - 90, 6)
  const needleBase2 = polarToXY(needleAngle + 90, 6)

  const color =
    value === null ? '#9ca3af' :
    value >= 1.33  ? '#10b981' :
    value >= 1.00  ? '#f59e0b' :
                     '#ef4444'

  const label1_00 = polarToXY(valueToAngle(1.00), R + 14)
  const label1_33 = polarToXY(valueToAngle(1.33), R + 14)
  const label1_67 = polarToXY(valueToAngle(1.67), R + 14)

  const ciTitle = (lower95 != null && upper95 != null)
    ? `${label}: ${value?.toFixed(2) ?? '—'}\n95% CI: [${lower95.toFixed(2)}, ${upper95.toFixed(2)}]`
    : undefined

  return (
    <div className="flex flex-col items-center gap-1 text-center" title={ciTitle}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Background track */}
        <path d={arc(-180, 0, R, STROKE)} fill="none" stroke="#e5e7eb" strokeWidth={STROKE} strokeLinecap="butt" />

        {/* Value arc — coloured only up to the needle */}
        {value !== null && (
          <path
            d={arc(-180, needleAngle, R, STROKE)}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="butt"
          />
        )}

        {/* Tick marks at 1.00, 1.33, 1.67 */}
        {[1.00, 1.33, 1.67].map(v => {
          const inner = polarToXY(valueToAngle(v), R - STROKE / 2 - 3)
          const outer = polarToXY(valueToAngle(v), R + STROKE / 2 + 2)
          return <line key={v} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#fff" strokeWidth="1.5" />
        })}

        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={color}
        />
        <circle cx={CX} cy={CY} r={5} fill={color} />

        {/* Value text */}
        <text x={CX} y={CY - 16} textAnchor="middle" fontSize="15" fontWeight="700" fill={color}>
          {value !== null ? value.toFixed(2) : '—'}
        </text>

        {/* Label */}
        <text x={CX} y={CY - 2} textAnchor="middle" fontSize="10" fill="#6b7280">{label}</text>
      </svg>
      {lower95 != null && upper95 != null && (
        <div className="text-[0.7rem] text-[var(--c-text-muted)]">[{lower95.toFixed(2)}, {upper95.toFixed(2)}]</div>
      )}
    </div>
  )
}
