#!/usr/bin/env node
/**
 * Model Validation Script
 *
 * Validates model integrity before commits:
 * - Checks for circular dependencies
 * - Validates all R-references exist
 * - Validates formula syntax
 * - Checks for duplicate IDs
 * - Validates input references
 *
 * Run: node scripts/validate-model.js
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'data')

let hasErrors = false
let warningCount = 0

function error(message) {
  console.error(`❌ ERROR: ${message}`)
  hasErrors = true
}

function warn(message) {
  console.warn(`⚠️  WARNING: ${message}`)
  warningCount++
}

function info(message) {
  console.log(`ℹ️  ${message}`)
}

function success(message) {
  console.log(`✅ ${message}`)
}

// Load data files
let calculations, inputs

try {
  const calcData = JSON.parse(
    readFileSync(join(dataDir, 'model-calculations.json'), 'utf-8')
  )
  // Calculations are nested under the 'calculations' property
  calculations = calcData.calculations || []
  success(`Loaded ${calculations.length} calculations`)
} catch (e) {
  error(`Failed to load model-calculations.json: ${e.message}`)
  process.exit(1)
}

try {
  inputs = JSON.parse(
    readFileSync(join(dataDir, 'model-inputs.json'), 'utf-8')
  )
  success('Loaded model-inputs.json')
} catch (e) {
  error(`Failed to load model-inputs.json: ${e.message}`)
  process.exit(1)
}

console.log('\n--- Validation Checks ---\n')

// 1. Check for duplicate IDs
const calcIds = calculations.map(c => c.id)
const uniqueIds = new Set(calcIds)
if (uniqueIds.size !== calcIds.length) {
  const duplicates = calcIds.filter((id, idx) => calcIds.indexOf(id) !== idx)
  error(`Duplicate calculation IDs found: ${[...new Set(duplicates)].join(', ')}`)
} else {
  success(`All ${calcIds.length} calculation IDs are unique`)
}

// 2. Validate R-references
const missingRefs = []
for (const calc of calculations) {
  if (!calc.formula) continue

  const refs = calc.formula.match(/R(\d+)/g) || []
  for (const ref of refs) {
    const refId = parseInt(ref.slice(1))
    if (!uniqueIds.has(refId)) {
      missingRefs.push({ calcId: calc.id, calcName: calc.name, missingRef: ref })
    }
  }
}

if (missingRefs.length > 0) {
  error(`Missing R-references found:`)
  missingRefs.slice(0, 10).forEach(r => {
    console.log(`   - ${r.missingRef} in calculation "${r.calcName}" (ID: ${r.calcId})`)
  })
  if (missingRefs.length > 10) {
    console.log(`   ... and ${missingRefs.length - 10} more`)
  }
} else {
  success('All R-references point to existing calculations')
}

// 3. Check for circular dependencies
function detectCycles(calculations) {
  const calcMap = new Map(calculations.map(c => [c.id, c]))
  const visiting = new Set()
  const visited = new Set()
  const cycles = []

  function getDeps(formula) {
    if (!formula) return []
    // Exclude SHIFT references from dependency check (they're lagged, not creating cycles)
    // Also need to handle nested SHIFT functions
    let cleanFormula = formula
    // Remove all SHIFT(...) calls recursively
    let prevFormula = ''
    while (prevFormula !== cleanFormula) {
      prevFormula = cleanFormula
      cleanFormula = cleanFormula.replace(/SHIFT\s*\([^()]*\)/gi, '')
    }
    const matches = cleanFormula.match(/R(\d+)/g) || []
    return [...new Set(matches.map(m => parseInt(m.slice(1))))]
  }

  function dfs(id, path) {
    if (visiting.has(id)) {
      const cycleStart = path.indexOf(id)
      cycles.push(path.slice(cycleStart))
      return true
    }
    if (visited.has(id)) return false

    visiting.add(id)
    path.push(id)

    const calc = calcMap.get(id)
    if (calc) {
      const deps = getDeps(calc.formula)
      for (const dep of deps) {
        if (calcMap.has(dep)) {
          dfs(dep, [...path])
        }
      }
    }

    visiting.delete(id)
    visited.add(id)
    return false
  }

  for (const calc of calculations) {
    dfs(calc.id, [])
  }

  return cycles
}

const cycles = detectCycles(calculations)
if (cycles.length > 0) {
  // Circular dependencies are a warning, not an error
  // Some financial models intentionally have co-dependent formulas
  // that are resolved using SHIFT or iterative evaluation
  warn(`Circular dependencies detected (may be intentional):`)
  cycles.slice(0, 5).forEach(cycle => {
    console.log(`   - Cycle: R${cycle.join(' → R')} → R${cycle[0]}`)
  })
  info('Consider using SHIFT() to break dependencies if unintentional')
} else {
  success('No circular dependencies detected')
}

// 4. Check formula syntax (balanced parentheses)
const unbalanced = []
for (const calc of calculations) {
  if (!calc.formula) continue

  let depth = 0
  for (const char of calc.formula) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (depth < 0) break
  }

  if (depth !== 0) {
    unbalanced.push({ id: calc.id, name: calc.name })
  }
}

if (unbalanced.length > 0) {
  error(`Unbalanced parentheses in formulas:`)
  unbalanced.forEach(u => {
    console.log(`   - "${u.name}" (ID: ${u.id})`)
  })
} else {
  success('All formulas have balanced parentheses')
}

// 5. Check for empty formulas
const emptyFormulas = calculations.filter(c => !c.formula && !c.name?.includes('placeholder'))
if (emptyFormulas.length > 0) {
  warn(`${emptyFormulas.length} calculations have empty formulas:`)
  emptyFormulas.slice(0, 5).forEach(c => {
    console.log(`   - "${c.name}" (ID: ${c.id})`)
  })
}

// 6. Validate V-references against input groups
const inputGroupIds = new Set((inputs.groups || []).map(g => g.id))
const vRefPattern = /V(\d+)(?:\.(\d+))?/g

const missingVRefs = []
for (const calc of calculations) {
  if (!calc.formula) continue

  let match
  while ((match = vRefPattern.exec(calc.formula)) !== null) {
    const groupId = parseInt(match[1])
    if (!inputGroupIds.has(groupId)) {
      missingVRefs.push({ calcId: calc.id, ref: match[0] })
    }
  }
}

if (missingVRefs.length > 0) {
  warn(`${missingVRefs.length} V-references point to non-existent input groups`)
  missingVRefs.slice(0, 5).forEach(r => {
    console.log(`   - ${r.ref} in calculation ID: ${r.calcId}`)
  })
}

// 7. Validate C-references against constants
const constantIds = new Set((inputs.constants || []).map(c => c.id))
const cRefPattern = /C(\d+)(?:\.(\d+))?/g

const missingCRefs = []
for (const calc of calculations) {
  if (!calc.formula) continue

  let match
  while ((match = cRefPattern.exec(calc.formula)) !== null) {
    const constId = parseInt(match[1])
    if (!constantIds.has(constId)) {
      missingCRefs.push({ calcId: calc.id, ref: match[0] })
    }
  }
}

if (missingCRefs.length > 0) {
  warn(`${missingCRefs.length} C-references point to non-existent constants`)
  missingCRefs.slice(0, 5).forEach(r => {
    console.log(`   - ${r.ref} in calculation ID: ${r.calcId}`)
  })
}

// Summary
console.log('\n--- Summary ---\n')
console.log(`Total calculations: ${calculations.length}`)
console.log(`Errors: ${hasErrors ? '❌ FAILED' : '✅ PASSED'}`)
console.log(`Warnings: ${warningCount}`)

if (hasErrors) {
  console.log('\n❌ Model validation FAILED. Please fix errors before committing.')
  process.exit(1)
} else if (warningCount > 0) {
  console.log('\n⚠️  Model validation passed with warnings.')
  process.exit(0)
} else {
  console.log('\n✅ Model validation PASSED.')
  process.exit(0)
}
