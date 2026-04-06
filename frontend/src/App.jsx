import { useEffect, useState } from 'react'
import AppShell from './AppShell'
import SPCPage from './spc/SPCPage'
import '@xyflow/react/dist/style.css'

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
