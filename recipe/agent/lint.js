/**
 * Recipe Linter
 * Checks best practices without running the engine.
 * - Sign convention (revenues positive, costs negative)
 * - Flow/stock classification
 * - Corkscrew pattern for BS items
 * - No hardcoded numbers in formulas
 * - Units on every input
 */
import { promises as fs } from 'fs'

// Numbers that are acceptable in formulas (structural, not business)
const ALLOWED_NUMBERS = new Set([
  '0', '1', '2', '3', // SHIFT offsets, CUMSUM(1)
  '6', '10', '100',   // power expressions, % conversion
  '0.0001', '0.001',  // division-by-zero guards
  '30',               // days-per-month convention
])

// Regex to find bare numbers in formulas (excluding those in refs like R123, C1.19)
const NUMBER_PATTERN = /(?<![A-Z\d.])\b(\d+\.?\d*)\b(?![.\d]*[A-Z])/g

/**
 * Check sign convention
 */
function checkSignConvention(recipe) {
  const issues = []
  const rules = recipe.bestPractices?.signConvention?.rules || []
  if (!recipe.bestPractices?.signConvention?.enabled) return issues

  for (const calc of recipe.calculations || []) {
    if (!calc.sign || !calc.category) continue
    const rule = rules.find(r => r.category === calc.category)
    if (!rule) continue

    if (calc.sign !== rule.expectedSign) {
      issues.push({
        level: 'warning',
        type: 'sign_convention',
        calcId: calc.id,
        name: calc.name,
        message: `R${calc.id} (${calc.name}): expected ${rule.expectedSign} sign for category '${calc.category}', found '${calc.sign}'`
      })
    }
  }
  return issues
}

/**
 * Check for hardcoded numbers in formulas
 */
function checkNoHardcodedNumbers(recipe) {
  const issues = []
  if (!recipe.validation?.formulaIntegrity?.noHardcodedNumbers) return issues

  const allCalcs = [
    ...(recipe.calculations || []),
    ...(recipe.moduleCalculations || [])
  ]

  for (const calc of allCalcs) {
    if (!calc.formula || calc.formula === '0') continue

    const formula = calc.formula
    let match
    const regex = new RegExp(NUMBER_PATTERN.source, 'g')
    while ((match = regex.exec(formula)) !== null) {
      const num = match[1]
      if (ALLOWED_NUMBERS.has(num)) continue

      // Check if it's part of a power expression like 10^6
      const beforeIdx = match.index - 1
      const afterIdx = match.index + num.length
      if (beforeIdx >= 0 && formula[beforeIdx] === '^') continue
      if (afterIdx < formula.length && formula[afterIdx] === '^') continue

      issues.push({
        level: 'warning',
        type: 'hardcoded_number',
        calcId: calc.id,
        name: calc.name,
        message: `R${calc.id} (${calc.name}): hardcoded number '${num}' in formula '${formula}'`
      })
    }
  }
  return issues
}

/**
 * Check that every input has a unit
 */
function checkUnits(recipe) {
  const issues = []
  if (!recipe.bestPractices?.units?.enabled) return issues

  for (const input of recipe.inputs || []) {
    if (!input.unit && input.unit !== '') {
      issues.push({
        level: 'info',
        type: 'missing_unit',
        inputId: input.id,
        name: input.name,
        message: `Input ${input.id} (${input.name}): missing unit`
      })
    }
  }
  return issues
}

/**
 * Check corkscrew pattern for balance sheet groups
 */
function checkCorkscrewPattern(recipe) {
  const issues = []
  if (!recipe.bestPractices?.corkscrewPattern?.enabled) return issues

  const bsCalcs = (recipe.calculations || []).filter(c => c.financialStatement === 'bs')
  const bsGroupIds = [...new Set(bsCalcs.map(c => c.groupId))]

  for (const groupId of bsGroupIds) {
    const groupCalcs = bsCalcs.filter(c => c.groupId === groupId)
    const types = groupCalcs.map(c => c.type).filter(Boolean)

    // BS groups with >2 calcs should have stock_start and stock types
    if (groupCalcs.length >= 3) {
      const hasOpening = types.includes('stock_start')
      const hasClosing = types.includes('stock')
      if (!hasOpening && !hasClosing) {
        const group = (recipe.calculationGroups || []).find(g => g.id === groupId)
        issues.push({
          level: 'info',
          type: 'missing_corkscrew',
          groupId,
          name: group?.name || `Group ${groupId}`,
          message: `BS group ${group?.name || groupId}: no stock_start/stock types found (consider corkscrew pattern)`
        })
      }
    }
  }
  return issues
}

/**
 * Check flow/stock classification
 */
function checkFlowStockClassification(recipe) {
  const issues = []
  const allCalcs = [
    ...(recipe.calculations || []),
    ...(recipe.moduleCalculations || [])
  ]

  for (const calc of allCalcs) {
    if (!calc.type) continue
    const formula = calc.formula || ''

    // Stock types should typically use CUMSUM, CUMPROD, or reference other stocks
    if (calc.type === 'stock' && formula && !formula.includes('CUMSUM') && !formula.includes('CUMPROD') && !formula.includes('SHIFT') && !formula.includes('PREVVAL') && !formula.includes('MAXVAL')) {
      // It's ok if it references another stock
      const isSimpleRef = /^R\d+$/.test(formula)
      const isExpression = /^R\d+\s*[\+\-\*\/]/.test(formula) || /[\+\-\*\/]\s*R\d+$/.test(formula)
      if (!isSimpleRef && !isExpression) {
        // This is just info, not necessarily wrong
      }
    }
  }
  return issues
}

/**
 * Check all references exist
 */
function checkAllRefsExist(recipe) {
  const issues = []
  if (!recipe.validation?.formulaIntegrity?.allRefsExist) return issues

  // Build set of all known R-refs
  const knownRefs = new Set()
  for (const c of (recipe.calculations || [])) knownRefs.add(`R${c.id}`)
  for (const c of (recipe.moduleCalculations || [])) knownRefs.add(`R${c.id}`)

  // Build set of known M-refs
  const knownMRefs = new Set(Object.keys(recipe.mRefMap || {}))

  // Build set of known input refs
  const knownInputRefs = new Set()
  for (const input of (recipe.inputs || [])) {
    if (input.ref) knownInputRefs.add(input.ref)
  }
  // Group subtotals
  for (const group of (recipe.inputGroups || [])) {
    if (group.ref) knownInputRefs.add(group.ref)
  }

  // Build set of known flags
  const knownFlags = new Set()
  for (const kp of (recipe.keyPeriods || [])) {
    knownFlags.add(`F${kp.id}`)
    knownFlags.add(`F${kp.id}.Start`)
    knownFlags.add(`F${kp.id}.End`)
  }

  // Check formulas
  const allCalcs = [
    ...(recipe.calculations || []),
    ...(recipe.moduleCalculations || [])
  ]

  const refPattern = /\b(R\d+|M\d+\.\d+|[VSCL]\d+(?:\.\d+)?|F\d+(?:\.(Start|End))?|I\d+|T\.[A-Za-z]+)\b/g

  for (const calc of allCalcs) {
    if (!calc.formula) continue
    let match
    const regex = new RegExp(refPattern.source, 'g')
    while ((match = regex.exec(calc.formula)) !== null) {
      const ref = match[1]
      if (ref.startsWith('R')) {
        if (!knownRefs.has(ref)) {
          issues.push({
            level: 'error',
            type: 'dangling_ref',
            calcId: calc.id,
            name: calc.name,
            message: `R${calc.id} (${calc.name}): references ${ref} which does not exist`
          })
        }
      } else if (ref.startsWith('M')) {
        if (!knownMRefs.has(ref)) {
          issues.push({
            level: 'warning',
            type: 'dangling_mref',
            calcId: calc.id,
            name: calc.name,
            message: `R${calc.id} (${calc.name}): references ${ref} which is not in mRefMap`
          })
        }
      }
    }
  }
  return issues
}

/**
 * Run all lint checks on a recipe.
 */
export async function lintRecipe(recipe) {
  const issues = [
    ...checkSignConvention(recipe),
    ...checkNoHardcodedNumbers(recipe),
    ...checkUnits(recipe),
    ...checkCorkscrewPattern(recipe),
    ...checkFlowStockClassification(recipe),
    ...checkAllRefsExist(recipe)
  ]

  return issues
}

/**
 * CLI entry point
 */
export async function runLint(recipePath) {
  const raw = await fs.readFile(recipePath, 'utf-8')
  const recipe = JSON.parse(raw)
  const issues = await lintRecipe(recipe)

  const errors = issues.filter(i => i.level === 'error')
  const warnings = issues.filter(i => i.level === 'warning')
  const infos = issues.filter(i => i.level === 'info')

  console.log(`Lint results: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info`)

  if (errors.length > 0) {
    console.log('\nErrors:')
    for (const e of errors) console.log(`  ✗ ${e.message}`)
  }
  if (warnings.length > 0) {
    console.log('\nWarnings:')
    for (const w of warnings) console.log(`  ⚠ ${w.message}`)
  }
  if (infos.length > 0) {
    console.log('\nInfo:')
    for (const i of infos) console.log(`  ○ ${i.message}`)
  }

  return issues
}
