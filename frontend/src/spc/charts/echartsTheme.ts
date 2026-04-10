// IBM Carbon Design Language multi-series palette
// Source: IBM Design Language color system (Carbon v11 white theme)
export const SPC_ECHARTS_THEME = {
  color: [
    '#0f62fe', // IBM Blue 60 (interactive)
    '#33b1ff', // IBM Cyan 40
    '#08bdba', // IBM Teal 40
    '#42be65', // IBM Green 40
    '#a56eff', // IBM Purple 50
    '#ff7eb6', // IBM Magenta 40
    '#ff832b', // IBM Orange 40
    '#fdd13a', // IBM Yellow 30
  ],
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: "'IBM Plex Sans', 'Noto Sans', -apple-system, system-ui",
    fontSize: 11,
    color: '#525252', // Carbon cool gray 60
  },
  line: { itemStyle: { borderWidth: 2 } },
  scatter: { itemStyle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' } },
  axisPointer: { lineStyle: { color: 'rgba(15,98,254,0.15)' } },
}

/** Shared grid padding — use in every chart's option object */
export const CHART_GRID = { top: 16, right: 120, bottom: 32, left: 64 }
