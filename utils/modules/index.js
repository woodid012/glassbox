// Module system entry point - assembles all modules and exports public API

import { TEMPLATE as constructionFundingTemplate, calculate as calculateConstructionFunding } from './constructionFunding'
import { TEMPLATE as reserveAccountTemplate, calculate as calculateReserveAccount } from './reserveAccount'

import { TEMPLATE as gstReceivableTemplate, calculate as calculateGstReceivable } from './gstReceivable'
import { TEMPLATE as taxLossesTemplate, calculate as calculateTaxLosses } from './taxLosses'
import { TEMPLATE as straightLineAmortisationTemplate, calculate as calculateStraightLineAmortisation } from './straightLineAmortisation'
import { TEMPLATE as iterativeDebtSizingTemplate, calculate as calculateIterativeDebtSizing } from './iterativeDebtSizing'
import { TEMPLATE as distributionsTemplate, calculate as calculateDistributions } from './distributions'
import { TEMPLATE as dsrfTemplate, calculate as calculateDsrf } from './dsrf'

// Assembled MODULE_TEMPLATES object (same shape as the original)
export const MODULE_TEMPLATES = {
    construction_funding: constructionFundingTemplate,
    reserve_account: reserveAccountTemplate,

    gst_receivable: gstReceivableTemplate,
    tax_losses: taxLossesTemplate,
    straight_line_amortisation: straightLineAmortisationTemplate,
    distributions: distributionsTemplate,
    dsrf: dsrfTemplate,
    iterative_debt_sizing: iterativeDebtSizingTemplate
}

// Dispatcher: routes to the correct module calculation function
export function calculateModuleOutputs(moduleInstance, arrayLength, context) {
    const template = MODULE_TEMPLATES[moduleInstance.moduleType]
    if (!template) return {}

    const inputs = moduleInstance.inputs || {}

    // Initialize default outputs (returned if no matching type)
    const outputs = {}
    template.outputs.forEach(output => {
        outputs[output.key] = new Array(arrayLength).fill(0)
    })

    switch (moduleInstance.moduleType) {
        case 'construction_funding':
            return calculateConstructionFunding(inputs, arrayLength, context)
        case 'reserve_account':
            return calculateReserveAccount(inputs, arrayLength, context)

        case 'gst_receivable':
            return calculateGstReceivable(inputs, arrayLength, context)
        case 'tax_losses':
            return calculateTaxLosses(inputs, arrayLength, context)
        case 'straight_line_amortisation':
            return calculateStraightLineAmortisation(inputs, arrayLength, context)
        case 'iterative_debt_sizing':
            return calculateIterativeDebtSizing(inputs, arrayLength, context)
        case 'distributions':
            return calculateDistributions(inputs, arrayLength, context)
        case 'dsrf':
            return calculateDsrf(inputs, arrayLength, context)
        default:
            return outputs
    }
}

// Helper functions (inline to avoid circular imports with helpers.js)

// Get available module output references for a module instance
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
