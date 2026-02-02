/**
 * BS Imbalance Debugger
 * Implements the proven diagnostic process from CLAUDE.md.
 *
 * Uses synchronous file reading + vitest-compatible imports.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { runServerModel } from '../../utils/serverModelEngine.js'

/**
 * Load model data with manual merge
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
 * Run the BS debug diagnostic.
 */
export function debugBS(dataDir, threshold = 1e-7) {
  const { inputs, calculations } = loadModelDataSync(dataDir)
  const { calculationResults, timeline } = runServerModel(inputs, calculations)

  const r = (id) => calculationResults[`R${id}`] || new Array(timeline.periods).fill(0)

  const r195 = r(195)
  const report = { balanced: true, periods: timeline.periods, details: [] }

  // Step 1: Find first non-zero R195 period
  const firstIdx = r195.findIndex(v => Math.abs(v) > threshold)
  if (firstIdx < 0) {
    report.balanced = true
    report.message = 'Balance sheet balances for all periods'
    return report
  }

  report.balanced = false
  report.firstImbalancePeriod = firstIdx
  report.firstImbalanceDate = timeline.periodLabels[firstIdx]
  report.firstImbalanceValue = r195[firstIdx]

  const nonZeroCount = r195.filter(v => Math.abs(v) > threshold).length
  const maxAbs = Math.max(...r195.map(v => Math.abs(v)))
  const isGrowing = Math.abs(r195[r195.length - 1]) > Math.abs(r195[firstIdx]) * 2
  report.pattern = isGrowing ? 'cumulative_drift' : (nonZeroCount === 1 ? 'one_time' : 'periodic')
  report.maxImbalance = maxAbs
  report.nonZeroPeriods = nonZeroCount

  // Step 2: Movement analysis
  const i = firstIdx
  const prev = Math.max(0, i - 1)

  const assetComponents = {
    'R182 Cash': { curr: r(182)[i], prev: r(182)[prev] },
    'R196 WIP': { curr: r(196)[i], prev: r(196)[prev] },
    'R183 PP&E': { curr: r(183)[i], prev: r(183)[prev] },
    'R184 Receivables': { curr: r(184)[i], prev: r(184)[prev] },
    'R185 GST Recv': { curr: r(185)[i], prev: r(185)[prev] },
    'R186 MRA': { curr: r(186)[i], prev: r(186)[prev] },
    'R230 IDC/Fees NBV': { curr: r(230)[i], prev: r(230)[prev] },
    'R231 Upfront Fees NBV': { curr: r(231)[i], prev: r(231)[prev] },
    'R232 Maint Capex NBV': { curr: r(232)[i], prev: r(232)[prev] }
  }

  const leComponents = {
    'R198 Cons Debt': { curr: r(198)[i], prev: r(198)[prev] },
    'R188 Ops Debt': { curr: r(188)[i], prev: r(188)[prev] },
    'R189 Payables': { curr: r(189)[i], prev: r(189)[prev] },
    'R191 Share Capital': { curr: r(191)[i], prev: r(191)[prev] },
    'R192 Retained Earnings': { curr: r(192)[i], prev: r(192)[prev] }
  }

  const assetDeltas = {}
  let totalAssetDelta = 0
  for (const [name, vals] of Object.entries(assetComponents)) {
    const delta = vals.curr - vals.prev
    assetDeltas[name] = delta
    totalAssetDelta += delta
  }

  const leDeltas = {}
  let totalLEDelta = 0
  for (const [name, vals] of Object.entries(leComponents)) {
    const delta = vals.curr - vals.prev
    leDeltas[name] = delta
    totalLEDelta += delta
  }

  report.movementAnalysis = {
    period: i,
    date: timeline.periodLabels[i],
    assetDeltas,
    totalAssetDelta,
    leDeltas,
    totalLEDelta,
    mismatch: totalAssetDelta - totalLEDelta
  }

  // Step 3: Stock-flow verification
  report.stockFlowChecks = [
    {
      stock: 'Cash',
      stockDelta: r(182)[i] - r(182)[prev],
      flow: r(40)[i],
      flowName: 'Net CF',
      discrepancy: (r(182)[i] - r(182)[prev]) - r(40)[i]
    },
    {
      stock: 'RE',
      stockDelta: r(192)[i] - r(192)[prev],
      flow: r(19)[i],
      flowName: 'NPAT (approx)',
      discrepancy: (r(192)[i] - r(192)[prev]) - r(19)[i]
    }
  ]

  // Top contributors
  const allDeltas = { ...assetDeltas }
  for (const [name, delta] of Object.entries(leDeltas)) {
    allDeltas[name] = -delta
  }
  report.topContributors = Object.entries(allDeltas)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .map(([name, delta]) => ({ name, delta }))

  return report
}

/**
 * Print debug report to console.
 */
export function printDebugReport(report) {
  if (report.balanced) {
    console.log('Balance sheet balances for all periods.')
    return
  }

  console.log('\nBS IMBALANCE DETECTED')
  console.log(`  First at period ${report.firstImbalancePeriod} (${report.firstImbalanceDate}): ${report.firstImbalanceValue.toFixed(6)}`)
  console.log(`  Pattern: ${report.pattern}`)
  console.log(`  Max imbalance: ${report.maxImbalance.toFixed(6)}`)
  console.log(`  Non-zero periods: ${report.nonZeroPeriods}`)

  if (report.movementAnalysis) {
    const ma = report.movementAnalysis
    console.log(`\nMovement Analysis (period ${ma.period}, ${ma.date}):`)
    console.log(`  Total Asset delta: ${ma.totalAssetDelta.toFixed(6)}`)
    console.log(`  Total L+E delta:   ${ma.totalLEDelta.toFixed(6)}`)
    console.log(`  Mismatch:          ${ma.mismatch.toFixed(6)}`)
  }

  if (report.topContributors?.length) {
    console.log('\nTop Contributors:')
    for (const tc of report.topContributors) {
      console.log(`  ${tc.name}: ${tc.delta.toFixed(6)}`)
    }
  }
}
