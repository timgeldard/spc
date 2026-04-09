import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('../src', import.meta.url)
const strict = process.argv.includes('--strict')
const files = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      if (entry === 'dist' || entry === 'node_modules') continue
      walk(fullPath)
      continue
    }

    if (!/\.(js|jsx|ts|tsx|css|scss)$/.test(entry)) continue
    files.push(fullPath)
  }
}

walk(root.pathname)

const checks = [
  {
    name: 'Radix imports',
    match: code => /@radix-ui\//.test(code),
  },
  {
    name: 'Custom UI kit imports',
    match: code => /components\/ui(\/|['"])/.test(code),
  },
  {
    name: 'Tailwind utility usage',
    match: code => /className\s*=\s*["'`{][^]*?\b(?:bg-|text-|border-|rounded|shadow|px-|py-|mx-|my-|flex|grid|gap-|justify-|items-|min-h-|h-\[|h-|w-\[|w-|dark:|sm:|md:|lg:|xl:|sticky|top-|left-|right-|bottom-)/m.test(code),
  },
]

const results = checks.map(check => ({
  ...check,
  files: files
    .filter(file => check.match(readFileSync(file, 'utf8')))
    .map(file => relative(join(root.pathname, '..'), file)),
}))

let violations = 0
for (const result of results) {
  console.log(`\n${result.name}: ${result.files.length}`)
  for (const file of result.files.slice(0, 20)) {
    console.log(`  - ${file}`)
  }
  if (result.files.length > 20) {
    console.log(`  ... ${result.files.length - 20} more`)
  }
  violations += result.files.length
}

if (strict && violations > 0) {
  process.exitCode = 1
}
