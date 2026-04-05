/**
 * Tiny inline SVG sparkline — no D3, no Recharts.
 * Shows the last N values as a line, with faint ±3σ guide bands.
 */
export default function SparklineMini({ values = [], width = 88, height = 32 }) {
  if (!values || values.length < 2) {
    return <svg width={width} height={height} className="sparkline-mini sparkline-mini--empty" />
  }

  const n = values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const mean = values.reduce((s, v) => s + v, 0) / n
  const sigma = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n)

  const PAD = 3
  const innerH = height - PAD * 2
  const innerW = width - PAD * 2

  // Scale value to y pixel (inverted — higher value = lower y)
  const scaleY = (v) => PAD + innerH - ((v - min) / range) * innerH
  const scaleX = (i) => PAD + (i / (n - 1)) * innerW

  // Line path
  const points = values.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(' ')

  // 3σ guide lines
  const ucl = mean + 3 * sigma
  const lcl = mean - 3 * sigma
  const uclY = scaleY(Math.min(max, ucl))
  const lclY = scaleY(Math.max(min, lcl))
  const clY  = scaleY(mean)

  // Determine if any points are OOC
  const hasOOC = values.some(v => v > ucl || v < lcl)

  return (
    <svg
      width={width}
      height={height}
      className={`sparkline-mini${hasOOC ? ' sparkline-mini--ooc' : ''}`}
      aria-hidden="true"
    >
      {/* Zone band between UCL/LCL */}
      <rect
        x={PAD} y={uclY}
        width={innerW} height={Math.max(0, lclY - uclY)}
        fill="rgba(16,185,129,0.07)"
      />
      {/* UCL guide */}
      <line x1={PAD} y1={uclY} x2={width - PAD} y2={uclY}
        stroke="rgba(239,68,68,0.4)" strokeWidth="1" strokeDasharray="2 2" />
      {/* LCL guide */}
      <line x1={PAD} y1={lclY} x2={width - PAD} y2={lclY}
        stroke="rgba(239,68,68,0.4)" strokeWidth="1" strokeDasharray="2 2" />
      {/* Centre line */}
      <line x1={PAD} y1={clY} x2={width - PAD} y2={clY}
        stroke="rgba(27,58,75,0.3)" strokeWidth="1" />
      {/* Data line */}
      <polyline
        points={points}
        fill="none"
        stroke="var(--c-brand)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* OOC dots */}
      {values.map((v, i) => {
        if (v <= ucl && v >= lcl) return null
        return (
          <circle
            key={i}
            cx={scaleX(i)}
            cy={scaleY(v)}
            r={2.5}
            fill="#ef4444"
          />
        )
      })}
      {/* Last value dot */}
      <circle
        cx={scaleX(n - 1)}
        cy={scaleY(values[n - 1])}
        r={2}
        fill="var(--c-brand)"
      />
    </svg>
  )
}
