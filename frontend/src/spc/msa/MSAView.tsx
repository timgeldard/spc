import { useState } from 'react'
import { useSPC } from '../SPCContext'
import { computeGRR, computeGRR_ANOVA } from './msaCalculations.js'
import type { MSAResult } from '../types'
import {
  buttonBaseClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonSmClass,
  chartHintClass,
  inputBaseClass,
  inputSmClass,
  msaDataClass,
  msaNdcClass,
  msaResultsClass,
  msaSetupClass,
  msaSetupRowClass,
  msaTableClass,
  msaTextareaClass,
  msaVerdictClass,
  msaViewClass,
  sectionTitleClass,
} from '../uiClasses.js'

type MSADataCube = Array<Array<Array<number | null>>>

function parseCSVData(text: string, nOperators: number, nParts: number, nReplicates: number): MSADataCube | null {
  const lines = text.trim().split(/\r?\n/).map(l => l.split(/[,\t]/).map(s => s.trim()))
  if (!lines.length) return null

  const data: MSADataCube = Array.from({ length: nOperators }, () =>
    Array.from({ length: nParts }, () => Array<number | null>(nReplicates).fill(null)),
  )

  if (lines[0].length >= 4) {
    const hasHeader = Number.isNaN(parseFloat(lines[0][3]))
    const rows = hasHeader ? lines.slice(1) : lines
    for (const row of rows) {
      const op = parseInt(row[0], 10) - 1
      const pt = parseInt(row[1], 10) - 1
      const rep = parseInt(row[2], 10) - 1
      const val = parseFloat(row[3])
      if (op >= 0 && op < nOperators && pt >= 0 && pt < nParts && rep >= 0 && rep < nReplicates) {
        data[op][pt][rep] = val
      }
    }
    return data
  }

  return null
}

interface GRRResultProps {
  result: MSAResult | null
  onSave: () => Promise<void>
  saving: boolean
}

function GRRResult({ result, onSave, saving }: GRRResultProps) {
  if (!result) return null
  if (result.error) return <div className="banner banner--error">{result.error}</div>

  const {
    grrPct,
    grrPctTol,
    ndc,
    ev,
    av,
    grr,
    pv,
    tv,
    method,
    interactionVariation,
    interactionPValue,
    modelWarning,
    systemStabilityWarning,
  } = result
  const pctColor = grrPct == null ? '#9ca3af' : grrPct < 10 ? '#059669' : grrPct < 30 ? '#d97706' : '#dc2626'
  const verdict = grrPct == null ? 'Unknown' : grrPct < 10 ? 'Acceptable' : grrPct < 30 ? 'Conditionally Acceptable' : 'Not Acceptable'

  return (
    <div className={msaResultsClass}>
      <div className={chartHintClass} style={{ marginBottom: '0.5rem' }}>
        Method: <strong>{method === 'anova' ? 'ANOVA Gauge R&R' : 'Average & Range'}</strong>
        {method === 'anova' && interactionPValue != null && ` · interaction p = ${interactionPValue.toFixed(4)}`}
      </div>
      {modelWarning && <div className="banner banner--warning">{modelWarning}</div>}
      {systemStabilityWarning && <div className="banner banner--warning">{systemStabilityWarning}</div>}

      <div className={msaVerdictClass} style={{ color: pctColor }}>
        <span>{grrPct?.toFixed(1) ?? '—'}% GRR</span>
        <span>{verdict}</span>
        {grrPctTol != null && <span className="text-sm font-normal">({grrPctTol.toFixed(1)}% of tolerance)</span>}
      </div>

      <table className={msaTableClass}>
        <thead><tr><th>Source</th><th>σ</th><th>% Contribution</th></tr></thead>
        <tbody>
          <tr><td>Repeatability (EV)</td><td>{ev?.toFixed(4)}</td><td>{tv && tv > 0 && ev != null ? ((ev / tv) * 100).toFixed(1) : '—'}%</td></tr>
          <tr><td>Reproducibility (AV)</td><td>{av?.toFixed(4)}</td><td>{tv && tv > 0 && av != null ? ((av / tv) * 100).toFixed(1) : '—'}%</td></tr>
          {method === 'anova' && <tr><td>Op × Part Interaction</td><td>{interactionVariation?.toFixed(4)}</td><td>{tv && tv > 0 ? (((interactionVariation ?? 0) / tv) * 100).toFixed(1) : '—'}%</td></tr>}
          <tr><td>GRR</td><td>{grr?.toFixed(4)}</td><td>{grrPct?.toFixed(1)}%</td></tr>
          <tr><td>Part Variation (PV)</td><td>{pv?.toFixed(4)}</td><td>{tv && tv > 0 && pv != null ? ((pv / tv) * 100).toFixed(1) : '—'}%</td></tr>
          <tr><td><strong>Total Variation (TV)</strong></td><td><strong>{tv?.toFixed(4)}</strong></td><td>100%</td></tr>
        </tbody>
      </table>

      <div className={msaNdcClass}>
        NDC (Number of Distinct Categories): <strong>{ndc ?? '—'}</strong>
        {ndc != null && ndc < 5 && (
          <span className="text-amber-600"> ⚠ NDC &lt; 5 — gauge cannot discriminate between parts</span>
        )}
      </div>

      <button className={`${buttonBaseClass} ${buttonPrimaryClass}`} onClick={() => { void onSave() }} disabled={saving}>
        {saving ? 'Saving…' : 'Save Session'}
      </button>
    </div>
  )
}

function generateSampleData(nOp: number, nPt: number, nRep: number): string {
  const rows: string[] = []
  const base = 10.0
  const noise = 0.15
  const rnd = (op: number, pt: number, rep: number) => {
    const x = Math.sin(op * 127 + pt * 31 + rep * 7) * 43758.5453
    return (x - Math.floor(x)) * 2 - 1
  }
  for (let op = 1; op <= nOp; op++) {
    for (let pt = 1; pt <= nPt; pt++) {
      const partOffset = rnd(0, pt, 0) * 0.5
      for (let rep = 1; rep <= nRep; rep++) {
        const val = (base + partOffset + rnd(op, pt, rep) * noise).toFixed(3)
        rows.push(`${op},${pt},${rep},${val}`)
      }
    }
  }
  return rows.join('\n')
}

export default function MSAView() {
  const { state } = useSPC()
  const [method, setMethod] = useState<'average_range' | 'anova'>('average_range')
  const [nOperators, setNOperators] = useState(3)
  const [nParts, setNParts] = useState(10)
  const [nReplicates, setNReplicates] = useState(2)
  const [tolerance, setTolerance] = useState('')
  const [csvText, setCsvText] = useState<string>(() => generateSampleData(3, 10, 2))
  const [result, setResult] = useState<MSAResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleCalculate = () => {
    const data = parseCSVData(csvText, nOperators, nParts, nReplicates)
    if (!data) {
      setResult({ error: 'Could not parse data. Expected format: operator,part,replicate,value (one per row).' })
      return
    }
    const tol = parseFloat(tolerance) || 0
    setResult((method === 'anova' ? computeGRR_ANOVA(data, tol) : computeGRR(data, tol)) as MSAResult)
  }

  const handleSave = async () => {
    if (!result || result.error || !state.selectedMaterial || !state.selectedMIC) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/spc/msa/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_id: state.selectedMaterial.material_id,
          mic_id: state.selectedMIC.mic_id,
          n_operators: nOperators,
          n_parts: nParts,
          n_replicates: nReplicates,
          grr_pct: result.grrPct ?? 0,
          repeatability: result.repeatability ?? 0,
          reproducibility: result.reproducibility ?? 0,
          ndc: result.ndc ?? 0,
          results_json: JSON.stringify(result),
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.detail ?? `Save failed (${res.status})`)
      }
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={msaViewClass}>
      <h3 className={sectionTitleClass}>Gauge R&amp;R</h3>
      {!state.selectedMIC && (
        <div className="banner banner--warning">
          Select a characteristic in the Charts tab first to associate this study with a specific MIC.
        </div>
      )}

      <div className={msaSetupClass}>
        <div className={msaSetupRowClass}>
          <label>Method:</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className={`${buttonBaseClass} ${buttonSmClass} ${method === 'average_range' ? buttonPrimaryClass : buttonSecondaryClass}`}
              onClick={() => setMethod('average_range')}
            >
              Average &amp; Range
            </button>
            <button
              type="button"
              className={`${buttonBaseClass} ${buttonSmClass} ${method === 'anova' ? buttonPrimaryClass : buttonSecondaryClass}`}
              onClick={() => setMethod('anova')}
            >
              ANOVA
            </button>
          </div>
        </div>
        <div className={msaSetupRowClass}>
          <label>Operators:</label>
          <input type="number" className={`${inputBaseClass} ${inputSmClass} w-24`} min={2} max={5} value={nOperators}
            onChange={e => setNOperators(Math.max(2, Math.min(5, Number(e.target.value))))} />
        </div>
        <div className={msaSetupRowClass}>
          <label>Parts:</label>
          <input type="number" className={`${inputBaseClass} ${inputSmClass} w-24`} min={2} max={10} value={nParts}
            onChange={e => setNParts(Math.max(2, Math.min(10, Number(e.target.value))))} />
        </div>
        <div className={msaSetupRowClass}>
          <label>Replicates:</label>
          <input type="number" className={`${inputBaseClass} ${inputSmClass} w-24`} min={2} max={5} value={nReplicates}
            onChange={e => setNReplicates(Math.max(2, Math.min(5, Number(e.target.value))))} />
        </div>
        <div className={msaSetupRowClass}>
          <label>Tolerance (USL−LSL):</label>
          <input type="number" className={`${inputBaseClass} ${inputSmClass} w-32`} step="any" value={tolerance}
            onChange={e => setTolerance(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <div className={msaDataClass}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.25rem' }}>
          <label className="text-sm font-medium text-[var(--c-text)]" style={{ margin: 0 }}>
            Measurement data (CSV / TSV: operator, part, replicate, value)
          </label>
          <button
            className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
            type="button"
            onClick={() => setCsvText(generateSampleData(nOperators, nParts, nReplicates))}
          >
            Fill sample data
          </button>
        </div>
        <textarea
          className={msaTextareaClass}
          rows={10}
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          placeholder={'1,1,1,10.2\n1,1,2,10.3\n1,2,1,10.5\n…'}
        />
      </div>

      <button className={`${buttonBaseClass} ${buttonPrimaryClass}`} onClick={handleCalculate}>
        Calculate GRR
      </button>

      {saveError && <div className="banner banner--error">{saveError}</div>}
      <GRRResult result={result} onSave={handleSave} saving={saving} />
    </div>
  )
}
