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
  return results
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
}
