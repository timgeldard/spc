import { Moon, Sun, Activity } from 'lucide-react'

export default function AppShell({ children, dark, onToggleDark }) {
  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--c-bg)' }}>
      <header
        className="h-14 flex items-center px-5 gap-3 sticky top-0 z-50"
        style={{
          background: 'var(--c-brand)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 1px 8px rgba(0,0,0,0.25)',
        }}
      >
        <Activity size={20} color="#fff" strokeWidth={2.5} />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9375rem', letterSpacing: '-0.02em' }}>
          SPC Platform
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onToggleDark}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: 'none',
              borderRadius: 6,
              padding: '5px 7px',
              cursor: 'pointer',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>
      <main style={{ flex: 1 }}>
        {children}
      </main>
    </div>
  )
}
