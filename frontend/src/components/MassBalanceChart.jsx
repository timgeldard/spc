/**
 * MassBalanceChart — Inventory Timeline with recharts
 *
 * Displays inventory level trends over time using a line chart.
 * Data sourced from gold_batch_quality_summary_v (dataset 35d26cb5).
 * Supports timeline visualization of Produced → Shipped → Current Stock.
 *
 * @param {{ batchId: string, loading: boolean }} props
 */
/**
 * MassBalanceChart — Inventory Trajectory (recharts)
 *
 * Renders a step-after line chart from movement_history rows delivered by
 * App.jsx via /api/batch-details (Dataset 35d26cb5 running-balance logic).
 * Contains no internal fetch logic — all data arrives as props.
 *
 * @param {{
 *   movementHistory: Array<{POSTING_DATE: string, inventory_level: number}>|null,
 *   summary: object|null,
 *   loading: boolean
 * }} props
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

export default function MassBalanceChart({ movementHistory, summary, loading }) {
  if (loading) {
    return (
      <div className="card chart-card">
        <h3 className="card-title">Inventory Trajectory</h3>
        <p className="card-loading">Loading inventory timeline…</p>
      </div>
    )
  }

  if (!movementHistory) {
    return (
      <div className="card chart-card">
        <h3 className="card-title">Inventory Trajectory</h3>
        <p className="card-empty">Select a batch to view inventory timeline.</p>
      </div>
    )
  }

  if (movementHistory.length === 0) {
    return (
      <div className="card chart-card">
        <h3 className="card-title">Inventory Trajectory</h3>
        <p className="card-empty">No movement history available for this batch.</p>
      </div>
    )
  }

  return (
    <div className="card chart-card">
      <h3 className="card-title">Inventory Trajectory</h3>
      {summary && (
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-label">Produced:</span>
            <span className="stat-value">{(summary.total_produced ?? 0).toFixed(2)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Shipped:</span>
            <span className="stat-value">{(summary.total_shipped ?? 0).toFixed(2)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Current:</span>
            <span className="stat-value">
              {((summary.current_stock_unrestricted ?? 0) + (summary.current_stock_blocked ?? 0)).toFixed(2)}
            </span>
          </div>
          <div className={`stat variance ${(summary.mass_balance_variance ?? 0) >= 0 ? 'positive' : 'negative'}`}>
            <span className="stat-label">Variance:</span>
            <span className="stat-value">
              {(summary.mass_balance_variance ?? 0) >= 0 ? '+' : ''}
              {(summary.mass_balance_variance ?? 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={movementHistory}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis
              dataKey="POSTING_DATE"
              tick={{ fontSize: 10 }}
              tickFormatter={(str) => {
                try {
                  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                } catch {
                  return str
                }
              }}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              label={{ value: 'KG', angle: -90, position: 'insideLeft', offset: 10 }}
            />
            <Tooltip
              labelFormatter={(val) => `Date: ${val}`}
              contentStyle={{
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                padding: '12px',
              }}
              formatter={(value) => value.toFixed(2)}
            />
            <Legend verticalAlign="top" height={36} />
            <Line
              name="Physical Stock (KG)"
              type="stepAfter"
              dataKey="inventory_level"
              stroke="#1B3A4B"
              strokeWidth={3}
              dot={{ r: 4, fill: '#1B3A4B' }}
              activeDot={{ r: 6, fill: '#FF3621' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
