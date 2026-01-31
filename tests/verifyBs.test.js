
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { runServerModel } from '../utils/serverModelEngine.js'

function loadModelData() {
    const dataDir = join(process.cwd(), 'data')

    const calcData = JSON.parse(
        readFileSync(join(dataDir, 'model-calculations.json'), 'utf-8')
    )
    const inputs = JSON.parse(
        readFileSync(join(dataDir, 'model-inputs.json'), 'utf-8')
    )

    // Merge module data (moduleCalculations, modules, _mRefMap) into calcData
    // so the server engine gets the full picture including converted module calcs
    try {
        const modulesData = JSON.parse(
            readFileSync(join(dataDir, 'model-modules.json'), 'utf-8')
        )
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
        if (modulesData.modules !== undefined) calcData.modules = modulesData.modules
        if (modulesData._mRefMap !== undefined) calcData._mRefMap = modulesData._mRefMap
    } catch { /* model-modules.json may not exist */ }

    return { calcData, inputs }
}

describe('Balance Sheet Verification', () => {
    let results
    let context

    beforeAll(() => {
        const { calcData, inputs } = loadModelData()
        // Run the model
        const out = runServerModel(inputs, calcData)
        results = out.calculationResults
        context = out.referenceMap
    })

    it('Balance Sheet Check (R195) should be zero for all periods', () => {
        const check = results['R195']
        expect(check).toBeDefined()

        // 0.01 threshold: allows floating-point rounding but catches real imbalances
        const maxDiff = Math.max(...check.map(v => Math.abs(v)))
        console.log('Max Balance Sheet Diff:', maxDiff)
        expect(maxDiff).toBeLessThan(0.01)
    })

    it('Cash Closing Balance (R42) should be non-negative', () => {
        const cash = results['R42']
        expect(cash).toBeDefined()

        const debugLog = []

        const minCash = Math.min(...cash)
        const minCashIdx = cash.findIndex(v => v === minCash)
        debugLog.push(`Min Cash: ${minCash} at Period ${minCashIdx}`)

        // Find FIRST negative period
        const firstNegIdx = cash.findIndex(v => v < -0.01)

        if (firstNegIdx !== -1) {
            debugLog.push(`First Negative Cash at Period ${firstNegIdx}: ${cash[firstNegIdx]}`)

            const idx = firstNegIdx
            debugLog.push(`\n--- Deep Dive Period ${idx} ---`)
            debugLog.push(`Cash Closing (R42): ${results['R42'][idx]}`)
            debugLog.push(`Net Cashflow (R40): ${results['R40'][idx]}`)

            // R40 = R170 + ...
            debugLog.push(`Net CF ex Dist (R170): ${results['R170'][idx]}`)
            debugLog.push(`  Ops Cashflow (R22): ${results['R22'][idx]}`)
            debugLog.push(`  Investing CF (R28): ${results['R28'][idx]}`)
            debugLog.push(`  Financing CF (R169): ${results['R169'][idx]}`)

            // Financing Breakdown
            debugLog.push(`\nFinancing Breakdown (R169) at ${idx}:`)
            debugLog.push(`  Debt Drawdown (R29): ${results['R29'][idx]}`)
            debugLog.push(`  Equity Injection (R35): ${results['R35'][idx]}`)
            debugLog.push(`  Financing Fees Paid (R173): ${results['R173'][idx]}`)
            debugLog.push(`    Upfront (R144): ${results['R144'][idx]}`)
            debugLog.push(`    Commitment (R146): ${results['R146'][idx]}`)

            debugLog.push(`  Agency Flow (Calc): ${results['R147'][idx] - (results['R147'][idx - 1] || 0)}`)
            debugLog.push(`  DSRF Fees (R153): ${results['R153'][idx]}`)
            debugLog.push(`  DSRA (R33): ${results['R33'][idx]}`)
            debugLog.push(`  MRA (R62 Flow): ${results['R62'][idx] - (results['R62'][idx - 1] || 0)}`)

            // Check R219 at this point
            debugLog.push(`\nR219 (Funded Fees) at ${idx}: ${results['R219'][idx]}`)
            debugLog.push(`R219 Delta: ${results['R219'][idx] - (results['R219'][idx - 1] || 0)}`)

            debugLog.push(`\n--- Module Internals ---`)
            debugLog.push(`R220 (Funding Window): ${results['R220'] ? results['R220'][idx] : 'N/A'}`)
            debugLog.push(`Total Uses (R9023): ${results['R9023'] ? results['R9023'][idx] : 'N/A'}`)
            debugLog.push(`Period Cost (R9024): ${results['R9024'] ? results['R9024'][idx] : 'N/A'}`)
            debugLog.push(`Equity Drawdown (R9021): ${results['R9021'] ? results['R9021'][idx] : 'N/A'}`)
            debugLog.push(`Debt Drawdown (R9020): ${results['R9020'] ? results['R9020'][idx] : 'N/A'}`)
            debugLog.push(`R35 (Mapped): ${results['R35'][idx]}`)

            debugLog.push(`Construction Flag (F1): ${context['F1'] ? context['F1'][idx] : 'N/A'}`)
        }

        if (debugLog.length > 1) console.log(debugLog.join('\n'))
        // -0.05 threshold: small negative cash from timing (GST refund lag) is acceptable
        expect(minCash).toBeGreaterThanOrEqual(-0.05)
    })
})
