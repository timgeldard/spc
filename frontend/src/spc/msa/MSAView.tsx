import { useState } from 'react'
import { useSPC } from '../SPCContext'
import { computeGRR, computeGRR_ANOVA } from './msaCalculations'
import { useMSASave } from '../hooks/useMSASave'
import type { MSAResult } from '../types'
import {
  buttonBaseClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonSmClass,
  cardSubClass,
  cardTitleClass,
  chartHintClass,
  heroCardDenseClass,
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
  moduleEyebrowClass,
  moduleHeaderCardClass,
  splitPanelClass,
  surfacePanelClass,
} from '../uiClasses'
import FieldHelp from '../components/FieldHelp'
import InfoBanner from '../components/InfoBanner'
import { grrStatusClass } from '../components/StatusPill'

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
  if (result.error) return <InfoBanner variant="error">{result.error}</InfoBanner>

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
  const { colorStyle, verdict } = grrStatusClass(grrPct)

  return (
    <div className={msaResultsClass}>
      <div className={`${chartHintClass} mb-2`}>
        Method: <strong>{method === 'anova' ? 'ANOVA Gauge R&R' : 'Average & Range'}</strong>
        {method === 'anova' && interactionPValue != null && ` · interaction p = ${interactionPValue.toFixed(4)}`}
      </div>
      {modelWarning && <InfoBanner variant="warn">{modelWarning}</InfoBanner>}
      {systemStabilityWarning && <InfoBanner variant="warn">{systemStabilityWarning}</InfoBanner>}

      <div className={msaVerdictClass} style={{ color: colorStyle }}>
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
          <span className="text-[#005776]"> ⚠ NDC &lt; 5 — gauge cannot discriminate between parts</span>
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
  const { saving, error: saveError, save } = useMSASave()

  const handleCalculate = () => {
    const data = parseCSVData(csvText, nOperators, nParts, nReplicates)
    if (!data) {
      setResult({ error: 'Could not parse data. Expected format: operator,part,replicate,value (one row per measurement).' })
      return
    }
    const tol = parseFloat(tolerance) || 0
    setResult((method === 'anova' ? computeGRR_ANOVA(data, tol) : computeGRR(data, tol)) as MSAResult)
  }

  const handleSave = async () => {
    if (!result || result.error || !state.selectedMaterial || !state.selectedMIC) return
    await save({
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
    })
  }

  return (
    <div className={msaViewClass}>
      {/* Header */}
      <div className={moduleHeaderCardClass}>
        <div className={moduleEyebrowClass}>Measurement system validation</div>
        <h3 className={cardTitleClass}>Gauge R&amp;R</h3>
        <p className={cardSubClass}>
          Assess whether the measurement system can reliably distinguish part-to-part variation from
          gauge noise (repeatability and reproducibility).
        </p>
      </div>

      {/* Getting started guidance */}
      <div className={`${surfacePanelClass} space-y-3`}>
        <div className={moduleEyebrowClass}>Getting started</div>
        <ol className="grid gap-2 text-sm text-[var(--c-text-muted)] sm:grid-cols-2 xl:grid-cols-4">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--c-brand)] text-[0.65rem] font-bold text-white">1</span>
            <span>Select a characteristic in the <strong>Charts</strong> tab to associate the study with a specific MIC.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--c-brand)] text-[0.65rem] font-bold text-white">2</span>
            <span>Set the study parameters below: how many operators, representative parts, and replicates.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--c-brand)] text-[0.65rem] font-bold text-white">3</span>
            <span>Collect measurements: each operator measures each part the required number of times.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--c-brand)] text-[0.65rem] font-bold text-white">4</span>
            <span>Enter the data in the table below and press <strong>Calculate GRR</strong>.</span>
          </li>
        </ol>
      </div>

      {/* MIC association warning */}
      {!state.selectedMIC && (
        <InfoBanner variant="warn">
          No characteristic selected. Go to the <strong>Charts</strong> tab, select a MIC, then return here to
          associate this study with that characteristic. Results can still be calculated without this link,
          but cannot be saved to the audit trail.
        </InfoBanner>
      )}

      <div className={splitPanelClass}>
        <div className="flex flex-col gap-4">

          {/* Study setup */}
          <fieldset className={msaSetupClass}>
            <legend className="sr-only">Study parameters</legend>
            <div className={msaSetupRowClass}>
              <label>Method:</label>
              <div className="flex gap-2" role="group" aria-label="GRR calculation method">
                <button
                  type="button"
                  className={`${buttonBaseClass} ${buttonSmClass} ${method === 'average_range' ? buttonPrimaryClass : buttonSecondaryClass}`}
                  onClick={() => setMethod('average_range')}
                  aria-pressed={method === 'average_range'}
                >
                  Average &amp; Range
                </button>
                <button
                  type="button"
                  className={`${buttonBaseClass} ${buttonSmClass} ${method === 'anova' ? buttonPrimaryClass : buttonSecondaryClass}`}
                  onClick={() => setMethod('anova')}
                  aria-pressed={method === 'anova'}
                >
                  ANOVA
                </button>
              </div>
            </div>
            <FieldHelp>
              Average &amp; Range is simpler and widely accepted. Use ANOVA when you have ≥ 3 replicates and
              want to detect operator-by-part interaction effects.
            </FieldHelp>

            <div className={msaSetupRowClass}>
              <label htmlFor="msa-operators">Operators:</label>
              <input
                id="msa-operators"
                type="number"
                className={`${inputBaseClass} ${inputSmClass} w-24`}
                min={2} max={5}
                value={nOperators}
                aria-describedby="msa-operators-help"
                onChange={e => setNOperators(Math.max(2, Math.min(5, Number(e.target.value))))}
              />
            </div>
            <FieldHelp id="msa-operators-help">2–5. Typically 3 operators for a standard study.</FieldHelp>

            <div className={msaSetupRowClass}>
              <label htmlFor="msa-parts">Parts:</label>
              <input
                id="msa-parts"
                type="number"
                className={`${inputBaseClass} ${inputSmClass} w-24`}
                min={2} max={10}
                value={nParts}
                aria-describedby="msa-parts-help"
                onChange={e => setNParts(Math.max(2, Math.min(10, Number(e.target.value))))}
              />
            </div>
            <FieldHelp id="msa-parts-help">2–10. Use 10 parts spanning the expected production range (not just good parts).</FieldHelp>

            <div className={msaSetupRowClass}>
              <label htmlFor="msa-replicates">Replicates:</label>
              <input
                id="msa-replicates"
                type="number"
                className={`${inputBaseClass} ${inputSmClass} w-24`}
                min={2} max={5}
                value={nReplicates}
                aria-describedby="msa-replicates-help"
                onChange={e => setNReplicates(Math.max(2, Math.min(5, Number(e.target.value))))}
              />
            </div>
            <FieldHelp id="msa-replicates-help">2–5. Each operator measures each part this many times (blind, random order).</FieldHelp>

            <div className={msaSetupRowClass}>
              <label htmlFor="msa-tolerance">Tolerance (USL−LSL):</label>
              <input
                id="msa-tolerance"
                type="number"
                className={`${inputBaseClass} ${inputSmClass} w-32`}
                step="any"
                value={tolerance}
                aria-describedby="msa-tolerance-help"
                onChange={e => setTolerance(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <FieldHelp id="msa-tolerance-help">
              Optional. If provided, % GRR of tolerance is calculated in addition to % of total variation.
            </FieldHelp>
          </fieldset>

          {/* Data entry */}
          <div className={msaDataClass}>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <label className="text-sm font-medium text-[var(--c-text)]" htmlFor="msa-data">
                Measurement data
              </label>
              <button
                className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
                type="button"
                onClick={() => setCsvText(generateSampleData(nOperators, nParts, nReplicates))}
                aria-label="Fill textarea with generated sample data matching current parameters"
              >
                Fill sample data
              </button>
            </div>
            <p className="mb-1.5 text-xs text-[var(--c-text-muted)]">
              One measurement per line. Columns: <code className="rounded bg-slate-100 px-1 font-mono text-[0.7rem]">operator, part, replicate, value</code>
              <br />
              Example (3 operators, 2 parts, 2 replicates):
            </p>
            <pre className="mb-2 overflow-x-auto rounded border border-[var(--c-border)] bg-slate-50 px-3 py-2 text-[0.7rem] leading-relaxed text-[var(--c-text-muted)]">{`1,1,1,10.25
1,1,2,10.30
1,2,1,10.52
1,2,2,10.48
2,1,1,10.21  ← operator 2, part 1, replicate 1
2,1,2,10.27
…`}</pre>
            <textarea
              id="msa-data"
              className={msaTextareaClass}
              rows={10}
              value={csvText}
              aria-label="Measurement data in CSV format: operator, part, replicate, value"
              onChange={e => setCsvText(e.target.value)}
            />
          </div>

          <button
            className={`${buttonBaseClass} ${buttonPrimaryClass} w-fit`}
            onClick={handleCalculate}
            aria-label="Calculate Gauge R&R from entered data"
          >
            Calculate GRR
          </button>
        </div>

        {/* Interpretation guide */}
        <aside className={`${heroCardDenseClass} space-y-4`}>
          <div className={moduleEyebrowClass}>Interpretation guide</div>
          <p className="text-sm text-[var(--c-text-muted)]">
            GRR tells you what fraction of your observed variation comes from the measurement system itself
            rather than genuine part-to-part differences.
          </p>
          <div className="space-y-2 text-sm">
            <div className="rounded-md border border-[#8FE2BE] bg-[#DAF5E9] p-2.5">
              <p className="font-semibold text-[#143700]">✓ &lt; 10% GRR</p>
              <p className="mt-0.5 text-xs text-[#143700]">Acceptable. Gauge is suitable for production use.</p>
            </div>
            <div className="rounded-md border border-[#FDE79D] bg-[#FEF3CE] p-2.5">
              <p className="font-semibold text-[#005776]">⚠ 10–30% GRR</p>
              <p className="mt-0.5 text-xs text-[#005776]">Conditionally acceptable. May be OK depending on process risk and context.</p>
            </div>
            <div className="rounded-md border border-[#FAB799] bg-[#FCDBCC] p-2.5">
              <p className="font-semibold text-[#F24A00]">✕ &gt; 30% GRR</p>
              <p className="mt-0.5 text-xs text-[#F24A00]">Not acceptable. The measurement system is a major source of variability.</p>
            </div>
          </div>
          <div className="border-t border-[var(--c-border)] pt-3 text-xs text-[var(--c-text-muted)]">
            <p className="font-semibold">NDC (Number of Distinct Categories)</p>
            <p className="mt-1">NDC ≥ 5 means the gauge can resolve at least 5 distinct levels of part quality. If NDC &lt; 5, the system cannot reliably classify parts.</p>
          </div>
        </aside>
      </div>

      {saveError && <InfoBanner variant="error">{saveError}</InfoBanner>}
      <GRRResult result={result} onSave={handleSave} saving={saving} />
    </div>
  )
}
