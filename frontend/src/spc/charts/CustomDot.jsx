/**
 * Custom recharts dot for control chart Line components.
 * Renders an OOC (out-of-control) point as a filled red circle with a border.
 * Normal in-control points render as a small circle.
 */
export function CustomDot({ cx, cy, index, signals = [], value, excluded = false }) {
  if (cx === undefined || cy === undefined) return null

  // Is this index flagged by any Nelson rule?
  const isOOC = signals.some(s => s.rule === 1 && s.indices.includes(index))
  const isSignal = !isOOC && signals.some(s => s.indices.includes(index))

  if (excluded) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={5} fill="#fff" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 2" />
        <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy + 4} stroke="#9ca3af" strokeWidth="1.5" />
        <line x1={cx + 4} y1={cy - 4} x2={cx - 4} y2={cy + 4} stroke="#9ca3af" strokeWidth="1.5" />
      </g>
    )
  }

  if (isOOC) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="#fff" strokeWidth="1.5" />
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize="9" fill="#ef4444" fontWeight="700">!</text>
      </g>
    )
  }

  if (isSignal) {
    return (
      <circle cx={cx} cy={cy} r={5} fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
    )
  }

  return (
    <circle cx={cx} cy={cy} r={3} fill="var(--c-brand)" stroke="#fff" strokeWidth="1" />
  )
}

/**
 * Factory that returns a dot renderer bound to specific signals and excluded indices.
 * Usage: <Line dot={makeChartDot(signals, excludedSet)} />
 */
export function makeChartDot(signals = [], excludedIndices = new Set()) {
  return (props) => (
    <CustomDot
      {...props}
      signals={signals}
      excluded={excludedIndices.has(props.index)}
    />
  )
}
