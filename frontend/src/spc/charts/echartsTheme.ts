// Kerry multi-series palette — §4.6 Charts: color system
export const SPC_ECHARTS_THEME = {
  color: [
    '#005776', // Slate
    '#289BA2', // Sage
    '#44CF93', // Jade
    '#FFC2B3', // Amaranth
    '#435F33', // Forest 80
    '#669AAD', // Slate 60
    '#7EC3C7', // Sage 60
    '#8FE2BE', // Jade 60
  ],
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: "'Noto Sans', -apple-system, system-ui",
    fontSize: 11,
    color: '#4E7080',
  },
  line: { itemStyle: { borderWidth: 2 } },
  scatter: { itemStyle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' } },
  axisPointer: { lineStyle: { color: 'rgba(0,87,118,0.15)' } },
}

/** Shared grid padding — use in every chart's option object */
export const CHART_GRID = { top: 16, right: 120, bottom: 32, left: 64 }
