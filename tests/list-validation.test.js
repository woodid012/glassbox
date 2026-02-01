import { describe, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { runServerModel } from '../utils/serverModelEngine.js'
import { validateAllCalculations, getValidationSummary, SEVERITY } from '../utils/formulaValidation.js'

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
    } catch { /* */ }
    return { calcData, inputs }
}

describe('Validation Issues', () => {
    it('should list all errors and warnings', () => {
        const { calcData, inputs } = loadModelData()
        const results = runServerModel(inputs, calcData)
        const refMap = results.referenceMap || {}

        // Build module output refs from _mRefMap AND solver outputs
        const moduleOutputs = {}
        if (calcData._mRefMap) {
            Object.keys(calcData._mRefMap).forEach(k => { moduleOutputs[k] = true })
        }
        // Add solver outputs from modules array (M{idx}.{outputIdx})
        if (calcData.modules) {
            calcData.modules.forEach((mod, mIdx) => {
                const moduleIndex = mIdx + 1
                const outputs = mod.outputs || []
                outputs.forEach((_, oIdx) => {
                    moduleOutputs[`M${moduleIndex}.${oIdx + 1}`] = true
                })
            })
        }

        const issues = validateAllCalculations(calcData.calculations, refMap, moduleOutputs)
        const summary = getValidationSummary(issues)

        console.log(`\nTotal: ${summary.total} | Errors: ${summary.bySeverity.error} | Warnings: ${summary.bySeverity.warning} | Info: ${summary.bySeverity.info}\n`)

        const errorsAndWarnings = issues.filter(i => i.severity === 'error' || i.severity === 'warning')
        errorsAndWarnings.forEach(i => {
            console.log(`${i.severity.toUpperCase().padEnd(8)} ${(i.calcRef || '').padEnd(8)} ${i.category.padEnd(14)} ${i.message}`)
        })
    })
})
