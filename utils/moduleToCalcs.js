// Module-to-Calculations Converter
// Converts module templates into regular GlassBox calculation entries.
// Each module output becomes a calculation with a proper formula,
// grouped under a module-specific group, and evaluated by the
// standard formula engine (including SHIFT cluster detection).

import { MODULE_TEMPLATES } from './modules'

/**
 * Generate regular calculation entries from a module instance.
 *
 * @param {Object} module - Module entry from model-calculations.json (templateId, inputs, name, etc.)
 * @param {number} moduleIndex - 0-based index in the modules[] array (M1 = index 0)
 * @param {number} startId - First available calculation ID for generated calcs
 * @param {number} groupId - Group ID for the generated calcs
 * @param {number} tabId - Tab ID for the generated group
 * @param {Object} [constantsLookup] - Optional map of constant refs (e.g., "C1.31") to their numeric values
 * @returns {{ calcs: Object[], group: Object, mRefMap: Object }} Generated calculations, group, and M-ref mapping
 */
export function generateModuleCalcs(module, moduleIndex, startId, groupId, tabId, constantsLookup) {
    const template = MODULE_TEMPLATES[module.templateId]
    if (!template) {
        throw new Error(`Unknown module template: ${module.templateId}`)
    }

    const moduleNum = moduleIndex + 1 // M1, M2, etc.
    const inputs = module.inputs || {}
    const outputFormulas = template.outputFormulas || {}

    // Map output keys to their assigned R-ref IDs
    const outputKeyToId = {}
    const outputKeyToRef = {}
    template.outputs.forEach((output, idx) => {
        const calcId = startId + idx
        outputKeyToId[output.key] = calcId
        outputKeyToRef[output.key] = `R${calcId}`
    })

    // Build M-ref map: M{n}.{outputIdx+1} → R{calcId}
    const mRefMap = {}
    template.outputs.forEach((output, idx) => {
        const mRef = `M${moduleNum}.${idx + 1}`
        mRefMap[mRef] = `R${outputKeyToId[output.key]}`
    })

    // Generate calculation entries
    const calcs = template.outputs.map((output, idx) => {
        let formula = outputFormulas[output.key] || '0'

        // Step 1: Substitute {inputKey} placeholders with configured input values
        for (const [inputKey, inputValue] of Object.entries(inputs)) {
            formula = formula.replace(new RegExp(`\\{${inputKey}\\}`, 'g'), String(inputValue))
        }

        // Step 2: Substitute remaining placeholders with template defaults
        if (template.inputs) {
            for (const inp of template.inputs) {
                formula = formula.replace(
                    new RegExp(`\\{${inp.key}\\}`, 'g'),
                    String(inp.default ?? inp.key)
                )
            }
        }

        // Step 3: Replace internal output key references with R-refs
        // Sort by length (longest first) to avoid partial matches
        const sortedKeys = Object.keys(outputKeyToRef).sort((a, b) => b.length - a.length)
        for (const key of sortedKeys) {
            formula = formula.replace(new RegExp(`\\b${key}\\b`, 'g'), outputKeyToRef[key])
        }

        // Step 4: Clean up display characters
        formula = formula.replace(/×/g, '*')

        // Step 5: Resolve constant references in SHIFT offsets to literal numbers
        // SHIFT regex only matches literal digit offsets, so C1.31 etc. must be resolved
        if (constantsLookup) {
            formula = formula.replace(
                /SHIFT\s*\(([^,]+),\s*(C\d+\.\d+)\s*\)/gi,
                (match, ref, constRef) => {
                    const val = constantsLookup[constRef]
                    if (val !== undefined && val !== null) {
                        return `SHIFT(${ref}, ${Math.round(val)})`
                    }
                    return match
                }
            )
        }

        return {
            id: startId + idx,
            groupId: groupId,
            name: `${module.name}: ${output.label}`,
            formula: formula,
            type: output.type || 'flow',
            _moduleId: `M${moduleNum}`,
            _moduleOutputKey: output.key
        }
    })

    // Generate group entry
    const group = {
        id: groupId,
        tabId: tabId,
        name: module.name,
        _isModuleGroup: true,
        _moduleTemplateId: module.templateId
    }

    return { calcs, group, mRefMap }
}

/**
 * Determine which tab a module should be placed on.
 */
function getModuleTabId(templateId) {
    switch (templateId) {
        case 'depreciation_amortization': return 1  // IFS tab (D&A)
        case 'gst_receivable': return 1             // IFS tab (Working Capital)
        case 'tax_losses': return 1                 // IFS tab (Tax)
        case 'construction_funding': return 2       // Funding tab
        case 'reserve_account': return 2            // Funding tab
        case 'distributions': return 2              // Funding tab
        case 'dsrf': return 2                       // Funding tab
        default: return 2                           // Funding tab default
    }
}

/**
 * Migrate all convertible modules in a model-calculations.json data object.
 * Generates calculations, groups, and M-ref map for all non-iterative modules.
 *
 * @param {Object} calcData - The full model-calculations.json object
 * @param {Object} [constantsLookup] - Optional map of constant refs to numeric values (for SHIFT offset resolution)
 * @returns {Object} Modified calcData with generated calcs, groups, _mRefMap, and converted modules
 */
export function migrateModulesToCalcs(calcData, constantsLookup) {
    const modules = calcData.modules || []
    const calculations = calcData.calculations || []
    const groups = calcData.calculationsGroups || []

    // Find the next available IDs
    let nextCalcId = Math.max(...calculations.map(c => c.id), 0) + 1
    // Round up to a clean starting point for module calcs
    nextCalcId = Math.max(nextCalcId, 9001)
    // Ensure we start at a round number
    if (nextCalcId < 9001) nextCalcId = 9001

    let nextGroupId = Math.max(...groups.map(g => g.id), 0) + 1
    nextGroupId = Math.max(nextGroupId, 50)

    const allMRefMap = {}
    const newCalcs = []
    const newGroups = []

    modules.forEach((mod, idx) => {
        // Skip modules that can't be expressed as formulas
        // - iterative_debt_sizing: uses binary search algorithm
        // - dsrf: requires forward-looking sums and step-function schedules
        if (mod.templateId === 'iterative_debt_sizing' || mod.templateId === 'dsrf') return

        // Skip already-converted modules
        if (mod.converted) return

        const tabId = getModuleTabId(mod.templateId)

        try {
            const { calcs, group, mRefMap } = generateModuleCalcs(
                mod, idx, nextCalcId, nextGroupId, tabId, constantsLookup
            )

            newCalcs.push(...calcs)
            newGroups.push(group)
            Object.assign(allMRefMap, mRefMap)

            // Mark module as converted and record calc IDs
            mod.converted = true
            mod.calcIds = calcs.map(c => c.id)

            // Advance IDs
            nextCalcId += calcs.length
            nextGroupId++
        } catch (e) {
            console.error(`Failed to convert module M${idx + 1} (${mod.templateId}):`, e.message)
        }
    })

    // Merge into calcData
    calcData.calculations = [...calculations, ...newCalcs]
    calcData.calculationsGroups = [...groups, ...newGroups]
    calcData._mRefMap = allMRefMap

    return calcData
}
