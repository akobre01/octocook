// Parity check: run the offline TS scheduler on the same sample meals as the
// Python fixtures (scripts/gen_parity_fixtures.py) and print a comparison table.
//
//   node scripts/check_parity.mjs   (or: cd web && npm run check-parity)
//
// Node 24+ imports the .ts scheduler directly (type-stripping).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scheduleRecipes, validateSchedule } from '../web/src/lib/scheduler.ts'
import { getKitchen } from '../web/src/lib/kitchens.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RECIPES_DIR = path.join(ROOT, 'web/src/recipes')
const FIX_DIR = path.join(ROOT, 'web/src/lib/__fixtures__/parity')

const byName = {}
for (const f of fs.readdirSync(RECIPES_DIR).filter((f) => f.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(path.join(RECIPES_DIR, f), 'utf8'))
  byName[r.name] = r
}

const kitchen = getKitchen('default')
const rows = []
let worstDelta = 0
let anyInfeasible = false

for (const f of fs.readdirSync(FIX_DIR).filter((f) => f.endsWith('.json'))) {
  const fix = JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), 'utf8'))
  const recipes = fix.recipes.map((n) => byName[n])
  if (recipes.some((r) => !r)) continue
  const ts = scheduleRecipes(recipes, kitchen, 1)
  const py = fix.schedule.makespan_min
  const delta = ts.makespan_min - py
  const problems = validateSchedule(ts, kitchen, 1)
  worstDelta = Math.max(worstDelta, Math.abs(delta))
  if (problems.length) anyInfeasible = true
  rows.push({
    meal: f.replace('.json', ''),
    py,
    ts: ts.makespan_min,
    delta,
    feasible: problems.length === 0 ? '✓' : `✗ ${problems[0]}`,
    steps: `${ts.steps.length}/${fix.schedule.steps.length}`,
  })
}

const pad = (s, n) => String(s).padEnd(n)
console.log(
  pad('meal', 28) + pad('python', 9) + pad('ts', 7) + pad('Δ', 7) + pad('steps', 9) + 'feasible',
)
console.log('-'.repeat(78))
for (const r of rows) {
  console.log(
    pad(r.meal, 28) +
      pad(r.py + 'm', 9) +
      pad(r.ts + 'm', 7) +
      pad((r.delta >= 0 ? '+' : '') + r.delta + 'm', 7) +
      pad(r.steps, 9) +
      r.feasible,
  )
}
console.log('-'.repeat(78))
console.log(`worst |Δmakespan| = ${worstDelta}m · all feasible: ${anyInfeasible ? 'NO' : 'yes'}`)
process.exit(anyInfeasible ? 1 : 0)
