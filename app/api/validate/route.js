import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { runServerModel } from '@/utils/serverModelEngine'
import { loadModelData } from '@/utils/loadModelData'

export const dynamic = 'force-dynamic'

/**
 * POST: Run validation + lint against current model files.
 * Returns structured results: BS balance, lint warnings, IRR/DSCR, formula integrity.
 */
export async function POST() {
    try {
        const dataDir = path.join(process.cwd(), 'data')
        const recipePath = path.join(process.cwd(), 'recipe', 'recipe.json')

        // Load and run model
        const { inputs, calculations: calcs } = await loadModelData(dataDir)
        let engineResults
        try {
            engineResults = runServerModel(inputs, calcs)
        } catch (err) {
            return NextResponse.json({
                passed: false,
                formulaIntegrity: { passed: false, error: err.message },
                balanceSheet: null,
                sourcesAndUses: null,
                covenants: [],
                irr: [],
                lint: [],
                reasonableness: []
            })
        }

        const { calculationResults, timeline } = engineResults
        const results = {
            passed: true,
            balanceSheet: null,
            sourcesAndUses: null,
            covenants: [],
            irr: [],
            formulaIntegrity: { passed: true },
            lint: [],
            reasonableness: []
        }

        // --- Balance Sheet Check (R195) ---
        const bsValues = calculationResults['R195']
        if (bsValues) {
            const maxAbs = Math.max(...bsValues.map(v => Math.abs(v)))
            const threshold = 0.01
            const firstNonZero = bsValues.findIndex(v => Math.abs(v) > threshold)
            results.balanceSheet = {
                passed: maxAbs <= threshold,
                maxImbalance: maxAbs,
                firstNonZeroPeriod: firstNonZero >= 0 ? firstNonZero : null,
                firstNonZeroDate: firstNonZero >= 0 ? timeline.periodLabels[firstNonZero] : null
            }
            if (!results.balanceSheet.passed) results.passed = false
        }

        // --- Sources & Uses Check (R69) ---
        const suValues = calculationResults['R69']
        if (suValues) {
            const maxAbs = Math.max(...suValues.map(v => Math.abs(v)))
            const threshold = 0.01
            results.sourcesAndUses = {
                passed: maxAbs <= threshold,
                maxImbalance: maxAbs
            }
            if (!results.sourcesAndUses.passed) results.passed = false
        }

        // --- Covenant Check (DSCR via R9071) ---
        const dscrValues = calculationResults['R9071']
        if (dscrValues) {
            const activeValues = dscrValues.filter(v => v !== 0)
            const minVal = activeValues.length > 0 ? Math.min(...activeValues) : 0
            const covenantResult = {
                name: 'Min DSCR',
                passed: minVal >= 1.0,
                minValue: minVal,
                threshold: 1.0
            }
            results.covenants.push(covenantResult)
            if (!covenantResult.passed) results.passed = false
        }

        // --- IRR Check (Equity IRR via R137) ---
        const irrValues = calculationResults['R137']
        if (irrValues) {
            const irr = computeIRR(irrValues)
            results.irr.push({
                name: 'Equity IRR',
                passed: irr !== null && irr >= 0.08 && irr <= 0.25,
                irr,
                expectedRange: [0.08, 0.25]
            })
        }

        // --- Lint (load recipe and run lint checks) ---
        try {
            const recipeContent = await fs.readFile(recipePath, 'utf-8')
            const recipe = JSON.parse(recipeContent)
            const { lintRecipe } = await import('@/recipe/agent/lint.js')
            results.lint = await lintRecipe(recipe)
        } catch {
            // Recipe may not exist - skip lint
        }

        // --- Financial Reasonableness Checks ---
        results.reasonableness = runReasonablenessChecks(calculationResults, inputs)

        return NextResponse.json(results)
    } catch (err) {
        console.error('validate error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
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
 * Run financial reasonableness checks on engine results.
 */
function runReasonablenessChecks(results, inputs) {
    const checks = []
    const constants = (inputs.inputGlass || []).filter(i => i.groupId === 100)

    // Check constant ranges
    const rangeChecks = [
        { name: 'Max Gearing', find: 'gearing', min: 50, max: 80 },
        { name: 'Tax Rate', find: 'tax', min: 0, max: 40 },
        { name: 'Asset Life', find: 'life', min: 5, max: 40 },
    ]

    for (const rc of rangeChecks) {
        const c = constants.find(c => c.name.toLowerCase().includes(rc.find))
        if (c && c.value !== undefined) {
            const inRange = c.value >= rc.min && c.value <= rc.max
            checks.push({
                name: `${rc.name} in range`,
                passed: inRange,
                value: c.value,
                range: [rc.min, rc.max],
                level: inRange ? 'pass' : 'warning'
            })
        }
    }

    // Revenue > 0 during operations
    const r1 = results['R1'] // Revenue
    if (r1) {
        const totalRevenue = r1.reduce((a, b) => a + (b || 0), 0)
        checks.push({
            name: 'Revenue positive during operations',
            passed: totalRevenue > 0,
            value: totalRevenue,
            level: totalRevenue > 0 ? 'pass' : 'error'
        })
    }

    // Cash never deeply negative
    const r182 = results['R182'] // Cash balance
    if (r182) {
        const minCash = Math.min(...r182)
        checks.push({
            name: 'Cash balance not deeply negative',
            passed: minCash > -10,
            value: minCash,
            level: minCash > -10 ? 'pass' : 'warning'
        })
    }

    return checks
}
