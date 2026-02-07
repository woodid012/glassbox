/**
 * Recipe Validator
 * Runs the server engine against generated model files and checks:
 *   - Balance sheet balance (R195 = 0)
 *   - Formula integrity (no broken refs)
 *   - Covenants (DSCR > threshold)
 *   - IRR range
 *
 * NOTE: Uses synchronous file reading + vitest-compatible imports.
 * Run via: npx vitest run tests/recipe-roundtrip.test.js
 * or: node recipe/agent/index.js validate (which calls vitest internally)
 */
import { readFileSync } from 'fs'
import { promises as fs } from 'fs'
import { join } from 'path'
import { runServerModel } from '../../utils/serverModelEngine.js'

/**
 * Load model data with manual merge (same pattern as verifyBs.test.js)
 */
function loadModelDataSync(dataDir) {
  const inputs = JSON.parse(readFileSync(join(dataDir, 'model-inputs.json'), 'utf-8'))
  const calcData = JSON.parse(readFileSync(join(dataDir, 'model-calculations.json'), 'utf-8'))

  try {
    const modulesData = JSON.parse(readFileSync(join(dataDir, 'model-modules.json'), 'utf-8'))
    if (modulesData.moduleGroups?.length) {
      calcData.calculationsGroups = [
        ...(calcData.calculationsGroups || []),
        ...modulesData.moduleGroups
      ]
    }
    if (modulesData.moduleCalculations?.length) {
      calcData.calculations = [
        ...(calcData.calculations || []),
        ...modulesData.moduleCalculations
      ]
    }
    if (modulesData.modules) calcData.modules = modulesData.modules
    if (modulesData._mRefMap) calcData._mRefMap = modulesData._mRefMap
  } catch (e) {
    // model-modules.json may not exist
  }

  return { inputs, calculations: calcData }
}

/**
 * Validate a recipe against its generated model files.
 */
export function validateRecipe(recipe, dataDir) {
  const results = {
    balanceSheet: null,
    sourcesAndUses: null,
    covenants: [],
    irr: [],
    formulaIntegrity: null,
    passed: true
  }

  let engineResults
  try {
    const { inputs, calculations } = loadModelDataSync(dataDir)
    engineResults = runServerModel(inputs, calculations)
  } catch (err) {
    results.formulaIntegrity = { passed: false, error: err.message }
    results.passed = false
    return results
  }

  const { calculationResults, timeline } = engineResults

  // --- Balance Sheet Check ---
  const bsValidation = recipe.validation?.balanceSheet
    || (recipe.validation?.balanceSheetTolerance != null
      ? { checkRef: 'R195', threshold: recipe.validation.balanceSheetTolerance }
      : null)
  if (bsValidation) {
    const { checkRef, threshold } = bsValidation
    const values = calculationResults[checkRef]
    if (values) {
      const maxAbs = Math.max(...values.map(v => Math.abs(v)))
      const firstNonZero = values.findIndex(v => Math.abs(v) > threshold)
      results.balanceSheet = {
        passed: maxAbs <= threshold,
        maxImbalance: maxAbs,
        firstNonZeroPeriod: firstNonZero >= 0 ? firstNonZero : null,
        firstNonZeroDate: firstNonZero >= 0 ? timeline.periodLabels[firstNonZero] : null
      }
      if (!results.balanceSheet.passed) results.passed = false
    } else {
      results.balanceSheet = { passed: false, error: `${checkRef} not found in results` }
      results.passed = false
    }
  }

  // --- Sources & Uses Check ---
  if (recipe.validation?.sourcesAndUses) {
    const { checkRef, threshold } = recipe.validation.sourcesAndUses
    const values = calculationResults[checkRef]
    if (values) {
      const maxAbs = Math.max(...values.map(v => Math.abs(v)))
      results.sourcesAndUses = {
        passed: maxAbs <= threshold,
        maxImbalance: maxAbs
      }
      if (!results.sourcesAndUses.passed) results.passed = false
    }
  }

  // --- Covenant Checks ---
  for (const covenant of (recipe.validation?.covenants || [])) {
    const values = calculationResults[covenant.ref]
    if (!values) {
      results.covenants.push({ name: covenant.name, passed: false, error: `${covenant.ref} not found` })
      results.passed = false
      continue
    }

    let activeValues = values.filter(v => v !== 0)

    if (covenant.rule === 'minValue') {
      const minVal = activeValues.length > 0 ? Math.min(...activeValues) : 0
      const covenantResult = {
        name: covenant.name,
        passed: minVal >= covenant.threshold,
        minValue: minVal,
        threshold: covenant.threshold
      }
      results.covenants.push(covenantResult)
      if (!covenantResult.passed) results.passed = false
    }
  }

  // --- IRR Checks ---
  for (const irrCheck of (recipe.validation?.irr || [])) {
    const values = calculationResults[irrCheck.cashFlowRef]
    if (!values) {
      results.irr.push({ name: irrCheck.name, passed: false, error: `${irrCheck.cashFlowRef} not found` })
      continue
    }

    const irr = computeIRR(values)
    const [minIRR, maxIRR] = irrCheck.expectedRange
    const irrResult = {
      name: irrCheck.name,
      passed: irr !== null && irr >= minIRR && irr <= maxIRR,
      irr: irr,
      expectedRange: irrCheck.expectedRange
    }
    results.irr.push(irrResult)
  }

  results.formulaIntegrity = { passed: true }

  // --- Financial Reasonableness Checks ---
  results.reasonableness = runReasonablenessChecks(calculationResults, engineResults)

  return results
}

/**
 * Run financial reasonableness checks on engine results.
 * These are warnings/info - they don't fail the overall validation.
 */
function runReasonablenessChecks(calcResults, engineResults) {
  const checks = []

  // Revenue > 0 during operations
  const r1 = calcResults['R1']
  if (r1) {
    const totalRevenue = r1.reduce((a, b) => a + (b || 0), 0)
    checks.push({
      name: 'Revenue positive during operations',
      passed: totalRevenue > 0,
      value: Math.round(totalRevenue * 100) / 100,
      level: totalRevenue > 0 ? 'pass' : 'warning'
    })
  }

  // No revenue during construction (R1 should be 0 when F1 is active)
  const r10 = calcResults['R10'] || calcResults['R1']
  if (r10) {
    // Check first 18 periods (typical construction)
    const constructionRevenue = r10.slice(0, 18).reduce((a, b) => a + Math.abs(b || 0), 0)
    checks.push({
      name: 'No revenue during construction',
      passed: constructionRevenue < 0.01,
      value: Math.round(constructionRevenue * 100) / 100,
      level: constructionRevenue < 0.01 ? 'pass' : 'warning'
    })
  }

  // Cash never deeply negative
  const r182 = calcResults['R182']
  if (r182) {
    const minCash = Math.min(...r182)
    checks.push({
      name: 'Cash balance not deeply negative',
      passed: minCash > -10,
      value: Math.round(minCash * 100) / 100,
      level: minCash > -10 ? 'pass' : 'warning'
    })
  }

  // Debt fully repaid by maturity (R94 or closing balance should reach 0)
  const debtClosing = calcResults['R94'] || calcResults['R9070']
  if (debtClosing) {
    const lastNonZero = [...debtClosing].reverse().findIndex(v => Math.abs(v) > 0.01)
    const periodsFromEnd = lastNonZero >= 0 ? lastNonZero : debtClosing.length
    const finalBalance = debtClosing[debtClosing.length - 1] || 0
    checks.push({
      name: 'Debt fully repaid',
      passed: Math.abs(finalBalance) < 0.01,
      value: Math.round(finalBalance * 100) / 100,
      level: Math.abs(finalBalance) < 0.01 ? 'pass' : 'warning'
    })
  }

  // Cost signs: OPEX should be negative
  const opexRefs = ['R8', 'R9', 'R11', 'R12', 'R13']
  for (const ref of opexRefs) {
    const values = calcResults[ref]
    if (!values) continue
    const totalPositive = values.filter(v => v > 0.01).reduce((a, b) => a + b, 0)
    if (totalPositive > 0.01) {
      checks.push({
        name: `${ref} cost sign (should be negative)`,
        passed: false,
        value: Math.round(totalPositive * 100) / 100,
        level: 'warning'
      })
    }
  }

  // Project IRR plausibility (if R137 equity cashflows exist)
  const equityCF = calcResults['R137'] || calcResults['R125']
  if (equityCF) {
    const irr = computeIRR(equityCF)
    if (irr !== null) {
      const inRange = irr >= 0.05 && irr <= 0.25
      checks.push({
        name: 'Equity IRR plausibility (5-25%)',
        passed: inRange,
        value: `${(irr * 100).toFixed(2)}%`,
        level: inRange ? 'pass' : 'warning'
      })
    }
  }

  return checks
}

/**
 * Compute monthly IRR using Newton's method, then annualize.
 */
function computeIRR(cashflows, maxIterations = 100, tolerance = 1e-8) {
  let firstNonZero = cashflows.findIndex(v => v !== 0)
  let lastNonZero = cashflows.length - 1
  while (lastNonZero > 0 && cashflows[lastNonZero] === 0) lastNonZero--
  if (firstNonZero < 0) return null

  const cf = cashflows.slice(firstNonZero, lastNonZero + 1)
  if (cf.length < 2) return null

  let rate = 0.01
  for (let iter = 0; iter < maxIterations; iter++) {
    let npv = 0, dnpv = 0
    for (let i = 0; i < cf.length; i++) {
      const factor = Math.pow(1 + rate, -i)
      npv += cf[i] * factor
      dnpv -= i * cf[i] * factor / (1 + rate)
    }
    if (Math.abs(dnpv) < 1e-20) break
    const newRate = rate - npv / dnpv
    if (Math.abs(newRate - rate) < tolerance) {
      rate = newRate
      break
    }
    rate = newRate
    if (rate < -0.5 || rate > 1) return null
  }

  return Math.pow(1 + rate, 12) - 1
}

/**
 * Print validation results to console.
 */
export function printValidationResults(results) {
  console.log('\nValidation Results:')
  console.log(`  Overall: ${results.passed ? 'PASSED' : 'FAILED'}`)

  if (results.balanceSheet) {
    const bs = results.balanceSheet
    console.log(`  Balance Sheet: ${bs.passed ? 'PASS' : 'FAIL'} (max imbalance: ${bs.maxImbalance?.toFixed(6) || 'N/A'})`)
    if (!bs.passed && bs.firstNonZeroDate) {
      console.log(`    First imbalance at: ${bs.firstNonZeroDate} (period ${bs.firstNonZeroPeriod})`)
    }
  }

  if (results.sourcesAndUses) {
    const su = results.sourcesAndUses
    console.log(`  Sources & Uses: ${su.passed ? 'PASS' : 'FAIL'} (max: ${su.maxImbalance?.toFixed(6) || 'N/A'})`)
  }

  for (const c of results.covenants) {
    console.log(`  ${c.name}: ${c.passed ? 'PASS' : 'FAIL'} (min: ${c.minValue?.toFixed(4) || 'N/A'}, threshold: ${c.threshold})`)
  }

  for (const i of results.irr) {
    const irrPct = i.irr !== null ? (i.irr * 100).toFixed(2) + '%' : 'N/A'
    console.log(`  ${i.name}: ${i.passed ? 'PASS' : 'CHECK'} (IRR: ${irrPct}, range: ${i.expectedRange?.map(r => (r * 100).toFixed(1) + '%').join(' - ')})`)
  }

  if (results.reasonableness?.length > 0) {
    console.log('\nReasonableness Checks:')
    for (const r of results.reasonableness) {
      const icon = r.passed ? 'PASS' : r.level === 'warning' ? 'WARN' : 'INFO'
      console.log(`  ${r.name}: ${icon} (${r.value})`)
    }
  }
}
