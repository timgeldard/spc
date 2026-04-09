import { Suspense, lazy, useEffect, useState } from 'react'
import { GlobalTheme, Theme } from '~/lib/carbon-theme'
import '@xyflow/react/dist/style.css'

const SPCPage = lazy(() => import('./spc/SPCPage'))

function AppLoadingState() {
  return (
    <div className="spc-page-shell__loading">
      Loading SPC workspace…
    </div>
  )
}

export default function App() {
  const [dark, setDark] = useState(
    () => localStorage.getItem('theme') === 'dark'
  )
  const carbonTheme = dark ? 'g100' : 'white'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    document.documentElement.setAttribute('data-carbon-theme', carbonTheme)
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [carbonTheme, dark])

  return (
    <GlobalTheme theme={carbonTheme}>
      <Theme as="div" theme={carbonTheme} className="spc-carbon-app">
        <Suspense fallback={<AppLoadingState />}>
          <SPCPage dark={dark} onToggleDark={() => setDark(d => !d)} />
        </Suspense>
      </Theme>
    </GlobalTheme>
  )
}
