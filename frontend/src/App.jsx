import { useEffect, useState } from 'react'
import * as echarts from 'echarts'
import { SPC_ECHARTS_THEME } from './spc/charts/echartsTheme.js'
import AppShell from './AppShell'
import SPCPage from './spc/SPCPage'
import '@xyflow/react/dist/style.css'
import './spc.css'

echarts.registerTheme('spc', SPC_ECHARTS_THEME)

export default function App() {
  const [dark, setDark] = useState(
    () => localStorage.getItem('theme') === 'dark'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <AppShell dark={dark} onToggleDark={() => setDark(d => !d)}>
      <SPCPage />
    </AppShell>
  )
}
