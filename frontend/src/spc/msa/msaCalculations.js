/**
 * AIAG Average & Range Gauge R&R method.
 *
 * Input `data`: 2D array [operator][part][replicate] = measurement value
 * `tolerance`: USL - LSL (for %GRR/tolerance calculation)
 *
 * Returns: { ev, av, grr, pv, tv, grrPct, grrPctTol, ndc, repeatability, reproducibility, error? }
 */

// AIAG K1 table: d2* by number of replicates
const K1_TABLE = { 2: 0.8862, 3: 0.5908, 4: 0.4857, 5: 0.4299 }

// AIAG K2 table: d2* by number of operators
const K2_TABLE = { 2: 0.7071, 3: 0.5231, 4: 0.4467, 5: 0.4030 }

// AIAG K3 table: d2* by number of parts
const K3_TABLE = {
  2: 0.7071, 3: 0.5231, 4: 0.4467, 5: 0.4030,
  6: 0.3742, 7: 0.3534, 8: 0.3375, 9: 0.3249, 10: 0.3146,
}

export function computeGRR(data, tolerance) {
  const nOperators   = data.length
  const nParts       = data[0]?.length ?? 0
  const nReplicates  = data[0]?.[0]?.length ?? 0

  if (nOperators < 2 || nParts < 2 || nReplicates < 2) {
    return { error: 'Minimum: 2 operators, 2 parts, 2 replicates' }
  }

  const k1 = K1_TABLE[nReplicates]
  const k2 = K2_TABLE[nOperators]
  const k3 = K3_TABLE[nParts]

  if (!k1 || !k2 || !k3) {
    return { error: `Unsupported dimensions: ${nOperators} ops × ${nParts} parts × ${nReplicates} reps` }
  }

  // R̄ per operator (average range across parts)
  const operatorRanges = data.map(opData =>
    opData.map(partData => {
      const vals = partData.filter(v => v != null && !isNaN(v))
      if (!vals.length) return null
      return Math.max(...vals) - Math.min(...vals)
    }).filter(r => r != null)
  )
  const rBarsByOp = operatorRanges.map(rs => rs.reduce((s, r) => s + r, 0) / rs.length)
  const rBarBar   = rBarsByOp.reduce((s, r) => s + r, 0) / nOperators

  // EV (Equipment Variation = Repeatability)
  // K constants store 1/d2* (AIAG MSA 4th ed. Appendix B), so multiply to get sigma
  const ev = rBarBar * k1

  // X̄ per operator
  const opMeans = data.map(opData => {
    const vals = opData.flatMap(pd => pd.filter(v => v != null && !isNaN(v)))
    return vals.reduce((s, v) => s + v, 0) / (vals.length || 1)
  })
  const xBarDiff = Math.max(...opMeans) - Math.min(...opMeans)

  // AV (Appraiser Variation = Reproducibility)
  const avRaw = (xBarDiff * k2) ** 2 - (ev ** 2) / (nParts * nReplicates)
  const av    = Math.sqrt(Math.max(0, avRaw))

  // GRR
  const grr = Math.sqrt(ev ** 2 + av ** 2)

  // PV (Part Variation)
  const allPartMeans = Array.from({ length: nParts }, (_, pi) => {
    const vals = data.flatMap(op => op[pi] ?? []).filter(v => v != null && !isNaN(v))
    return vals.reduce((s, v) => s + v, 0) / (vals.length || 1)
  })
  const rParts = Math.max(...allPartMeans) - Math.min(...allPartMeans)
  const pv     = rParts * k3

  // TV (Total Variation)
  const tv = Math.sqrt(grr ** 2 + pv ** 2)

  const grrPct    = tv > 0 ? round(100 * grr / tv, 1) : null
  const grrPctTol = tolerance > 0 ? round(100 * (grr * 5.15) / tolerance, 1) : null
  const ndc       = pv > 0 && grr > 0 ? Math.floor(1.41 * (pv / grr)) : null

  return {
    ev:   round(ev, 4),
    av:   round(av, 4),
    grr:  round(grr, 4),
    pv:   round(pv, 4),
    tv:   round(tv, 4),
    repeatability:   round(ev, 4),
    reproducibility: round(av, 4),
    grrPct,
    grrPctTol,
    ndc,
    rBarBar: round(rBarBar, 4),
    xBarDiff: round(xBarDiff, 4),
  }
}

function round(v, d) {
  const factor = 10 ** d
  return Math.round(v * factor) / factor
}
