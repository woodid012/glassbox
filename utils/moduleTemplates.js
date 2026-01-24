// Preset Modules for Financial Modeling
// Each module takes inputs and generates multiple output time series

/**
 * Module Template Structure:
 * {
 *   type: 'module_type',
 *   name: 'Display Name',
 *   description: 'Module description',
 *   inputs: [
 *     { key: 'inputKey', label: 'Input Label', type: 'number|percentage|period|reference|select', required: true|false }
 *   ],
 *   outputs: [
 *     { key: 'outputKey', label: 'Output Label', type: 'flow|stock' }
 *   ]
 * }
 */

// Module templates - to be defined
export const MODULE_TEMPLATES = {}

// Calculate module outputs
export function calculateModuleOutputs(moduleInstance, arrayLength, context) {
    const template = MODULE_TEMPLATES[moduleInstance.moduleType]
    if (!template) return {}

    const outputs = {}

    // Initialize output arrays
    template.outputs.forEach(output => {
        outputs[output.key] = new Array(arrayLength).fill(0)
    })

    // Module-specific calculation logic to be implemented
    return outputs
}

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
    const index = template.outputs.findIndex(o => o.key === key)
    return index >= 0 ? index + 1 : null
}
