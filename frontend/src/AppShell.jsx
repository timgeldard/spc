export default function AppShell({ children }) {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Statistical Process Control</h1>
        <p>Process capability &amp; control charting · powered by Databricks</p>
      </header>
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}
