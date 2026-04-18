import fs from 'node:fs'
import path from 'node:path'

const assetsDir = path.resolve(process.cwd(), 'dist/assets')

const budgets = [
  { label: 'SPC shell entry', pattern: /^SPCPage-.*\.js$/, maxKb: 25, required: true },
  { label: 'Genie view wrapper', pattern: /^GenieView-.*\.js$/, maxKb: 10, required: true },
  // ControlChartsView carries the Shewhart/WECO/Nelson/capability/EWMA/CUSUM math plus
  // stability guard + autocorrelation + data-quality wiring. Budget was 80KB pre-Phase 1;
  // raised to 95KB to accommodate the Phase 1/4.3 additions with headroom.
  { label: 'Control charts view', pattern: /^ControlChartsView-.*\.js$/, maxKb: 95, required: true },
  { label: 'Data quality panel', pattern: /^DataQualityPanel-.*\.js$/, maxKb: 10, required: false },
  { label: 'Carbon layout runtime', pattern: /^carbon-layout-react-.*\.js$/, maxKb: 30, required: true },
  { label: 'Carbon date runtime', pattern: /^carbon-date-.*\.js$/, maxKb: 250, required: true },
  { label: 'Carbon flow icons', pattern: /^carbon-icons-flow-.*\.js$/, maxKb: 80, required: false },
  { label: 'Carbon status icons', pattern: /^carbon-icons-status-.*\.js$/, maxKb: 80, required: true },
  { label: 'Carbon page icons', pattern: /^carbon-icons-page-.*\.js$/, maxKb: 60, required: true },
  { label: 'Carbon chart icons', pattern: /^carbon-icons-chart-.*\.js$/, maxKb: 40, required: false },
  { label: 'Carbon table runtime', pattern: /^carbon-table-.*\.js$/, maxKb: 60, required: true },
  { label: 'Carbon app runtime', pattern: /^carbon-app-.*\.js$/, maxKb: 950, required: true },
  { label: 'Main stylesheet', pattern: /^index-.*\.css$/, maxKb: 500, required: true },
]

if (!fs.existsSync(assetsDir)) {
  console.error(`Bundle assets not found at ${assetsDir}. Run "npm run build" first.`)
  process.exit(1)
}

const files = fs.readdirSync(assetsDir)
const failures = []

console.log('Bundle budget report:')

for (const budget of budgets) {
  const match = files.find(file => budget.pattern.test(file))
  if (!match) {
    const message = `${budget.label}: missing asset matching ${budget.pattern}`
    if (budget.required) failures.push(message)
    console.log(`- ${budget.label}: missing`)
    continue
  }

  const filePath = path.join(assetsDir, match)
  const sizeKb = fs.statSync(filePath).size / 1024
  const status = sizeKb <= budget.maxKb ? 'OK' : 'OVER'
  console.log(`- ${budget.label}: ${match} ${sizeKb.toFixed(2)} kB / budget ${budget.maxKb} kB [${status}]`)

  if (status === 'OVER') {
    failures.push(`${budget.label} exceeded budget (${sizeKb.toFixed(2)} kB > ${budget.maxKb} kB)`)
  }
}

if (failures.length > 0) {
  console.error('\nBundle budget check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('\nBundle budgets passed.')
