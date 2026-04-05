/**
 * CoACard — Certificate of Analysis (Master Inspection Characteristics)
 *
 * Displays MIC test results with Target, Tolerance, Actual Result, and Pass/Fail status.
 * Data sourced from dataset f7e8d9c0.
 *
 * @param {{ batchId: string, loading: boolean }} props
 */
/**
 * CoACard — Certificate of Analysis (Master Inspection Characteristics)
 *
 * Renders MIC test results from the coa_results array supplied by App.jsx.
 * Data is fetched centrally via /api/batch-details (Dataset f7e8d9c0) and
 * passed down as props. This component contains no internal fetch logic.
 *
 * @param {{ coaResults: Array|null, loading: boolean }} props
 */
export default function CoACard({ coaResults, loading }) {
  if (loading) {
    return (
      <div className="card coa-card">
        <h3 className="card-title">Certificate of Analysis (CoA)</h3>
        <p className="card-loading">Loading CoA…</p>
      </div>
    )
  }

  if (!coaResults) {
    return (
      <div className="card coa-card">
        <h3 className="card-title">Certificate of Analysis (CoA)</h3>
        <p className="card-empty">Select a batch to view test results.</p>
      </div>
    )
  }

  if (coaResults.length === 0) {
    return (
      <div className="card coa-card">
        <h3 className="card-title">Certificate of Analysis (CoA)</h3>
        <p className="card-empty">No CoA results available for this batch.</p>
      </div>
    )
  }

  return (
    <div className="card coa-card">
      <h3 className="card-title">Certificate of Analysis (CoA)</h3>
      <div className="coa-table-wrapper">
        <table className="coa-table">
          <thead>
            <tr>
              <th>Test</th>
              <th>Target</th>
              <th>Tolerance</th>
              <th>Actual</th>
              <th>Δ Target</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {coaResults.map((row) => {
              const isPass = row.result_status === 'Pass' || row.within_spec === true
              return (
                <tr key={row.mic_code}>
                  <td className="col-test">
                    <span className="test-code">{row.mic_code}</span>
                    {row.mic_name && (
                      <span className="test-desc">{row.mic_name}</span>
                    )}
                  </td>
                  <td>{row.target_value ?? '—'}</td>
                  <td>{row.tolerance_range ?? '—'}</td>
                  <td className="col-actual">{row.actual_result ?? '—'}</td>
                  <td className="col-deviation">
                    {row.deviation_from_target != null
                      ? `${row.deviation_from_target > 0 ? '+' : ''}${row.deviation_from_target}`
                      : '—'}
                  </td>
                  <td className={`col-status ${isPass ? 'pass' : 'fail'}`}>
                    {isPass ? '✓ Pass' : '✗ Fail'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
