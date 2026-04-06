export const SPC_ECHARTS_THEME = {
  color: ['#1B3A4B', '#10b981', '#7c3aed', '#f59e0b', '#ef4444'],
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: "'Inter', -apple-system, system-ui",
    fontSize: 11,
    color: '#6b7280',
  },
  line: { itemStyle: { borderWidth: 2 } },
  scatter: { itemStyle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' } },
  axisPointer: { lineStyle: { color: 'rgba(27,58,75,0.15)' } },
}

/** Shared grid padding — use in every chart's option object */
export const CHART_GRID = { top: 16, right: 120, bottom: 32, left: 64 }
