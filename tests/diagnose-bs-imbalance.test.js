import { describe, it, expect } from 'vitest'
import { runServerModel } from '../utils/serverModelEngine.js'
import { readFileSync } from 'fs'
import { join } from 'path'

function loadModelData() {
  const dataDir = join(process.cwd(), 'data')
  const calcData = JSON.parse(readFileSync(join(dataDir, 'model-calculations.json'), 'utf-8'))
  const inputs = JSON.parse(readFileSync(join(dataDir, 'model-inputs.json'), 'utf-8'))
  return { calcData, inputs }
}

describe('BS Imbalance Diagnosis', () => {
  it('should identify the source of BS imbalance', () => {
    const { calcData, inputs } = loadModelData()
    const out = runServerModel(inputs, calcData)
    const results = out.calculationResults

    // Find R195 (BS check)
    const r195 = results['R195'] || []

    // Find period with worst imbalance
    let worstPeriod = 0
    let worstValue = 0
    r195.forEach((val, idx) => {
      if (Math.abs(val) > Math.abs(worstValue)) {
        worstValue = val
        worstPeriod = idx
      }
    })

    console.log('\n=== BS IMBALANCE DIAGNOSIS ===')
    console.log(`Worst period: ${worstPeriod} (value: ${worstValue})`)
    console.log(`\nPeriod window: ${worstPeriod - 2} to ${worstPeriod + 2}`)

    const getCalc = (id) => calcData.calculations.find(c => c.id === id)

    // R195 components
    const r195Calc = getCalc(195)
    const r187Calc = getCalc(187) // Total Assets
    const r194Calc = getCalc(194) // Total L+E
    const r190Calc = getCalc(190) // Total Liabilities
    const r193Calc = getCalc(193) // Total Equity

    console.log(`\n--- R195 Formula ---`)
    console.log(`${r195Calc.name}: ${r195Calc.formula}`)
    console.log(`${r195Calc.description}`)

    console.log(`\n--- Total Assets (R187) ---`)
    console.log(`Formula: ${r187Calc.formula}`)
    console.log(`${r187Calc.description}`)

    console.log(`\n--- Total L+E (R194) ---`)
    console.log(`Formula: ${r194Calc.formula}`)
    console.log(`${r194Calc.description}`)

    // Print values at worst period and surrounding periods
    const printPeriodRange = (refId, name, start, end) => {
      const values = results[refId] || []
      console.log(`\n${name} (${refId}):`)
      for (let i = start; i <= end; i++) {
        const val = values[i] || 0
        const marker = i === worstPeriod ? ' <-- WORST' : ''
        console.log(`  Period ${i}: ${val.toFixed(4)}${marker}`)
      }
    }

    const start = Math.max(0, worstPeriod - 2)
    const end = Math.min(r195.length - 1, worstPeriod + 2)

    // Main components
    printPeriodRange('R195', 'BS Check (Imbalance)', start, end)
    printPeriodRange('R187', 'Total Assets', start, end)
    printPeriodRange('R194', 'Total L+E', start, end)

    console.log('\n--- Asset Breakdown (at worst period) ---')
    const assetRefs = ['R182', 'R196', 'R183', 'R184', 'R185', 'R186', 'R230', 'R231']
    const assetNames = ['Cash', 'WIP', 'PP&E Net', 'Trade Receivables', 'GST Receivable',
                        'Upfront Fees', 'IDC Unamortized', 'Comm Fees Unamortized']
    assetRefs.forEach((ref, idx) => {
      const val = (results[ref] || [])[worstPeriod] || 0
      const calc = getCalc(parseInt(ref.substring(1)))
      console.log(`  ${assetNames[idx]} (${ref}): ${val.toFixed(4)}`)
      if (calc) console.log(`    Formula: ${calc.formula}`)
    })

    console.log('\n--- Liability Breakdown (at worst period) ---')
    console.log(`Total Liabilities (R190): ${(results['R190'] || [])[worstPeriod] || 0}`)
    const r190Formula = getCalc(190)?.formula || 'unknown'
    console.log(`  Formula: ${r190Formula}`)

    // Parse R190 components
    const liabRefs = r190Formula.split('+').map(s => s.trim())
    liabRefs.forEach(ref => {
      if (ref.startsWith('R')) {
        const val = (results[ref] || [])[worstPeriod] || 0
        const calc = getCalc(parseInt(ref.substring(1)))
        console.log(`  ${calc?.name || ref} (${ref}): ${val.toFixed(4)}`)
      }
    })

    console.log('\n--- Equity Breakdown (at worst period) ---')
    console.log(`Total Equity (R193): ${(results['R193'] || [])[worstPeriod] || 0}`)
    const r193Formula = getCalc(193)?.formula || 'unknown'
    console.log(`  Formula: ${r193Formula}`)

    // Parse R193 components
    const equityRefs = r193Formula.split('+').map(s => s.trim())
    equityRefs.forEach(ref => {
      if (ref.startsWith('R')) {
        const val = (results[ref] || [])[worstPeriod] || 0
        const calc = getCalc(parseInt(ref.substring(1)))
        console.log(`  ${calc?.name || ref} (${ref}): ${val.toFixed(4)}`)
      }
    })

    console.log('\n--- Working Capital Chain (at worst period) ---')
    const wcRefs = ['R95', 'R96', 'R97', 'R98', 'R21']
    const wcNames = ['Revenue for WC', 'OPEX for WC', 'WC Receivables', 'WC Payables', 'WC Movement']
    wcRefs.forEach((ref, idx) => {
      const val = (results[ref] || [])[worstPeriod] || 0
      const calc = getCalc(parseInt(ref.substring(1)))
      console.log(`  ${wcNames[idx]} (${ref}): ${val.toFixed(4)}`)
      if (calc) console.log(`    Formula: ${calc.formula}`)
    })

    printPeriodRange('R21', 'WC Movement', start, end)
    printPeriodRange('R184', 'Trade Receivables', start, end)
    printPeriodRange('R189', 'Trade Payables', start, end)

    console.log('\n--- Cash Flow Impact ---')
    printPeriodRange('R35', 'Operating CF (pre-WC)', start, end)
    printPeriodRange('R36', 'Operating CF (post-WC)', start, end)
    printPeriodRange('R42', 'Cash Closing', start, end)

    console.log('\n=== END DIAGNOSIS ===\n')
  })
})
