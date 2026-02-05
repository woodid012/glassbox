// Module system entry point
// Only iterative_debt_sizing (M1) has an active JS solver.
// All other modules are fullyConverted — their outputs are R9000+ calculations.

import { TEMPLATE as constructionFundingTemplate } from './constructionFunding'
import { TEMPLATE as iterativeDebtSizingTemplate, calculate as calculateIterativeDebtSizing } from './iterativeDebtSizing'

// Template metadata for UI (module cards, "add template" buttons)
// Templates for deleted solvers are sourced from moduleTemplates in model-modules.json
export const MODULE_TEMPLATES = {
    construction_funding: constructionFundingTemplate,
    iterative_debt_sizing: iterativeDebtSizingTemplate
}

// Dispatcher: only M1 (iterative_debt_sizing) needs a JS solver.
// All other modules are fullyConverted and evaluated as regular R9000+ calculations.
export function calculateModuleOutputs(moduleInstance, arrayLength, context) {
    if (moduleInstance.moduleType === 'iterative_debt_sizing') {
        return calculateIterativeDebtSizing(moduleInstance.inputs || {}, arrayLength, context)
    }

    // fullyConverted modules have no solver outputs — return empty
    const template = MODULE_TEMPLATES[moduleInstance.moduleType]
    if (template) {
        const outputs = {}
        template.outputs.forEach(output => {
            outputs[output.key] = new Array(arrayLength).fill(0)
        })
        return outputs
    }
    return {}
}

// Helper: get available module output references for a module instance
// Uses numeric indices: M1.1, M1.2, etc.
export function getModuleOutputRefs(moduleInstance) {
    const template = MODULE_TEMPLATES[moduleInstance.moduleType]
    if (!template) return []

    return template.outputs.map((output, index) => ({
        ref: `M${moduleInstance.id}.${index + 1}`,
        key: output.key,
        label: `${moduleInstance.name}: ${output.label}`,
        type: output.type
    }))
}

// Get output key from numeric index for a module type
export function getOutputKeyByIndex(moduleType, index) {
    const template = MODULE_TEMPLATES[moduleType]
    if (!template || index < 1 || index > template.outputs.length) return null
    return template.outputs[index - 1].key
}

// Get output index from key for a module type
export function getOutputIndexByKey(moduleType, key) {
    const template = MODULE_TEMPLATES[moduleType]
    if (!template) return null
    const idx = template.outputs.findIndex(o => o.key === key)
    return idx >= 0 ? idx + 1 : null
}
