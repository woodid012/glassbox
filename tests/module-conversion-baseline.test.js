/**
 * Baseline capture for M4 and M8 module conversion.
 * Run BEFORE converting solvers to declarative formulas.
 * Saves current solver output values to JSON files for later comparison.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'fs'
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

describe('Module Conversion Baseline Capture', () => {
    let result

    it('should run the full model', () => {
        const { calcData, inputs } = loadModelData()
        result = runServerModel(inputs, calcData)
        expect(result.calculationResults).toBeDefined()
        expect(result.moduleOutputs).toBeDefined()
    })

    it('should capture M4.1 baseline', () => {
        const m4_1 = result.moduleOutputs['M4.1']
        expect(m4_1).toBeDefined()
        expect(m4_1.length).toBeGreaterThan(0)

        const nonZero = m4_1.filter(v => v !== 0)
        console.log(`M4.1: ${nonZero.length} non-zero periods, sum=${nonZero.reduce((a, b) => a + b, 0).toFixed(2)}`)

        const baseline = {
            ref: 'M4.1',
            values: m4_1,
            periods: result.timeline.periodLabels
        }
        writeFileSync(
            join(process.cwd(), 'data', 'baseline-M4.json'),
            JSON.stringify(baseline, null, 2)
        )
    })

    it('should capture M8.1-M8.3 baseline', () => {
        const refs = ['M8.1', 'M8.2', 'M8.3']
        const baseline = { periods: result.timeline.periodLabels, outputs: {} }

        for (const ref of refs) {
            const values = result.moduleOutputs[ref]
            expect(values).toBeDefined()
            expect(values.length).toBeGreaterThan(0)

            const nonZero = values.filter(v => v !== 0)
            console.log(`${ref}: ${nonZero.length} non-zero periods, sum=${nonZero.reduce((a, b) => a + b, 0).toFixed(2)}`)

            baseline.outputs[ref] = values
        }

        writeFileSync(
            join(process.cwd(), 'data', 'baseline-M8.json'),
            JSON.stringify(baseline, null, 2)
        )
    })

    it('should also capture dependent calc values for cross-check', () => {
        const crossCheck = {
            R9024: result.calculationResults['R9024'],
            R9023: result.calculationResults['R9023'],
            R9080: result.calculationResults['R9080'],
            R9081: result.calculationResults['R9081'],
            R9082: result.calculationResults['R9082'],
        }

        for (const [ref, values] of Object.entries(crossCheck)) {
            const nonZero = (values || []).filter(v => v !== 0)
            console.log(`${ref}: ${nonZero.length} non-zero periods`)
        }

        writeFileSync(
            join(process.cwd(), 'data', 'baseline-cross-check.json'),
            JSON.stringify(crossCheck, null, 2)
        )
    })
})
