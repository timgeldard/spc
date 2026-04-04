import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import SparklineMini from './SparklineMini.jsx'

const STATUS = {
  green: { dot: '#10b981', text: '#059669', bg: '#f0fdf4', border: '#bbf7d0', label: 'Capable' },
  amber: { dot: '#f59e0b', text: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Marginal' },
  red: { dot: '#ef4444', text: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'Incapable' },
  grey: { dot: '#9ca3af', text: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', label: 'No Data' },
}

function ProcessNode({ data, selected }) {
  const s = STATUS[data.status ?? 'grey']

  const shortName = data.material_name && data.material_name.length > 22
    ? data.material_name.substring(0, 21) + '…'
    : (data.material_name || data.material_id)

  return (
    <div
      style={{
        background: s.bg,
        border: `1.5px solid ${selected ? s.dot : s.border}`,
        borderRadius: 10,
        width: 160,
        boxShadow: selected ? `0 0 0 3px ${s.dot}40` : '0 1px 4px rgba(0,0,0,0.08)',
        position: 'relative',
        padding: '10px 12px 8px',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: s.dot }} />

      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: s.dot,
        boxShadow: `0 0 0 2px ${s.dot}30`,
      }} title={s.label} />

      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#111827', paddingRight: 14, lineHeight: 1.3 }}
        title={data.material_name || data.material_id}>
        {shortName}
      </div>

      {data.plant_name && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          marginTop: 3,
          background: 'rgba(0,0,0,0.05)',
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: '0.625rem',
          fontWeight: 500,
          color: '#6b7280',
          letterSpacing: '0.02em',
        }}>
          {data.plant_name}
        </div>
      )}

      {data.is_root && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          marginLeft: data.plant_name ? 4 : 0,
          marginTop: 3,
          background: '#1B3A4B',
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: '0.625rem',
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '0.04em',
        }}>
          ROOT
        </div>
      )}

      <div style={{ margin: '6px 0 4px' }}>
        <SparklineMini values={data.sparkline_values ?? []} width={136} height={28} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        {data.estimated_cpk != null && (
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: s.text,
            background: `${s.dot}18`,
            borderRadius: 4,
            padding: '1px 5px',
          }}>
            Cpk {data.estimated_cpk.toFixed(2)}
          </span>
        )}
        <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginLeft: 'auto' }}>
          {data.total_batches ?? 0}b
          {data.rejected_batches > 0 && (
            <span style={{ color: '#ef4444', marginLeft: 3 }}>·{data.rejected_batches}r</span>
          )}
        </span>
      </div>

      <Handle type="source" position={Position.Right} style={{ background: s.dot }} />
    </div>
  )
}

export default memo(ProcessNode)
