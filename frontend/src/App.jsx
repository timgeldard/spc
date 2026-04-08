import { useEffect, useState } from 'react'
import SPCPage from './spc/SPCPage'
import '@xyflow/react/dist/style.css'

export default function App() {
  const [dark, setDark] = useState(
    () => localStorage.getItem('theme') === 'dark'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <SPCPage dark={dark} onToggleDark={() => setDark(d => !d)} />
  )
}
