/**
 * Verification tests for M4 and M8 module conversion.
 * Compares post-conversion values against saved baseline.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { runServerModel } from '../utils/serverModelEngine.js'

function loadModelData() {
    const dataDir = join(process.cwd(), 'data')
    const calcData = JSON.parse(readFileSync(join(dataDir, 'model-calculations.json'), 'utf-8'))
    const inputs = JSON.parse(readFileSync(join(dataDir, 'model-inputs.json'), 'utf-8'))

    try {
        const modulesData = JSON.parse(readFileSync(join(dataDir, 'model-modules.json'), 'utf-8'))
        if (modulesData.moduleGroups?.length) {
            calcData.calculationsGroups = [...(calcData.calculationsGroups || []), ...modulesData.moduleGroups]
        }
        if (modulesData.moduleCalculations?.length) {
            calcData.calculations = [...(calcData.calculations || []), ...modulesData.moduleCalculations]
        }
        if (modulesData.modules !== undefined) calcData.modules = modulesData.modules
        if (modulesData._mRefMap !== undefined) calcData._mRefMap = modulesData._mRefMap
    } catch { /* ok */ }

    return { calcData, inputs }
}

describe('M4 Conversion Verification', () => {
    let result
    let baseline

    it('should load baseline and run model', () => {
        const dataDir = join(process.cwd(), 'data')
        baseline = JSON.parse(readFileSync(join(dataDir, 'baseline-M4.json'), 'utf-8'))
        const { calcData, inputs } = loadModelData()
        result = runServerModel(inputs, calcData)
    })

    it('should resolve M4.1 via _mRefMap (not solver)', () => {
        // M4.1 now resolves via _mRefMap → R9024 (a regular calc, not a solver output)
        const m4_1 = result.moduleOutputs['M4.1']
        const r9024 = result.calculationResults['R9024']
        expect(m4_1).toBeDefined()
        expect(r9024).toBeDefined()
        // They should be the exact same array (same reference)
        expect(m4_1).toBe(r9024)
    })

    it('should produce R9024 values matching baseline M4.1', () => {
        const r9024 = result.calculationResults['R9024']
        expect(r9024).toBeDefined()
        expect(r9024.length).toBe(baseline.values.length)

        const tolerance = 0.01
        const diffs = []
        for (let i = 0; i < baseline.values.length; i++) {
            const diff = Math.abs((r9024[i] || 0) - (baseline.values[i] || 0))
            if (diff > tolerance) {
                diffs.push({
                    period: baseline.periods[i],
                    idx: i,
                    baseline: baseline.values[i],
                    actual: r9024[i],
                    diff
                })
            }
        }

        if (diffs.length > 0) {
            console.log('M4.1 vs R9024 differences (first 10):')
            diffs.slice(0, 10).forEach(d => {
                console.log(`  ${d.period}: baseline=${d.baseline.toFixed(4)} actual=${d.actual.toFixed(4)} diff=${d.diff.toFixed(4)}`)
            })
        }

        expect(diffs.length).toBe(0)
    })

    it('should produce matching R9023 (cumulative) values', () => {
        const crossCheck = JSON.parse(
            readFileSync(join(process.cwd(), 'data', 'baseline-cross-check.json'), 'utf-8')
        )
        const r9023 = result.calculationResults['R9023']
        const baseR9023 = crossCheck['R9023']

        expect(r9023).toBeDefined()
        const tolerance = 0.01
        const diffs = []
        for (let i = 0; i < baseR9023.length; i++) {
            const diff = Math.abs((r9023[i] || 0) - (baseR9023[i] || 0))
            if (diff > tolerance) {
                diffs.push({ idx: i, baseline: baseR9023[i], actual: r9023[i], diff })
            }
        }

        if (diffs.length > 0) {
            console.log('R9023 differences (first 10):')
            diffs.slice(0, 10).forEach(d => {
                console.log(`  idx=${d.idx}: baseline=${d.baseline.toFixed(4)} actual=${d.actual.toFixed(4)}`)
            })
        }

        expect(diffs.length).toBe(0)
    })

    it('should maintain BS balance (R195 near zero)', () => {
        const r195 = result.calculationResults['R195']
        expect(r195).toBeDefined()
        const maxImbalance = Math.max(...r195.map(Math.abs))
        console.log(`Max BS imbalance (R195): ${maxImbalance.toFixed(6)}`)
        expect(maxImbalance).toBeLessThan(0.01)
    })
})

describe('M8 Solver Outputs Still Work (pre-conversion)', () => {
    it('should still produce M8.1-M8.3 solver outputs', () => {
        const { calcData, inputs } = loadModelData()
        const result = runServerModel(inputs, calcData)

        const baseline = JSON.parse(
            readFileSync(join(process.cwd(), 'data', 'baseline-M8.json'), 'utf-8')
        )

        for (const ref of ['M8.1', 'M8.2', 'M8.3']) {
            const values = result.moduleOutputs[ref]
            expect(values).toBeDefined()

            const baseValues = baseline.outputs[ref]
            const tolerance = 0.01
            let maxDiff = 0
            for (let i = 0; i < baseValues.length; i++) {
                maxDiff = Math.max(maxDiff, Math.abs((values[i] || 0) - (baseValues[i] || 0)))
            }
            console.log(`${ref}: max diff from baseline = ${maxDiff.toFixed(6)}`)
            expect(maxDiff).toBeLessThan(tolerance)
        }
    })
})
