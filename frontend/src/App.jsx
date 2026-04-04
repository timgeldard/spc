import AppShell from './AppShell'
import SPCPage from './spc/SPCPage'
import '@xyflow/react/dist/style.css'
import './spc.css'

export default function App() {
  return (
    <AppShell>
      <SPCPage />
    </AppShell>
  )
}
