import * as echarts from 'echarts'
import { SPC_ECHARTS_THEME } from './echartsTheme.js'

let registered = false

if (!registered) {
  echarts.registerTheme('spc', SPC_ECHARTS_THEME)
  registered = true
}

export {}
