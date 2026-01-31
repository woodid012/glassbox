/**
 * Shared helper for server-side API routes that need to read model data.
 *
 * Reads model-inputs.json, model-calculations.json, and model-modules.json,
 * then merges module data back into the calculations object so callers get
 * the same unified shape they always expected.
 */
import { promises as fs } from 'fs'
import path from 'path'

async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(data)
    } catch (error) {
        if (error.code === 'ENOENT') return null
        if (error instanceof SyntaxError) {
            console.error(`JSON corrupted in ${filePath}`)
            return null
        }
        throw error
    }
}

/**
 * Merge module data back into a calculations object.
 * After this, the returned calcs object looks exactly like the old
 * single-file model-calculations.json (with modules, moduleGroups in
 * calculationsGroups, moduleCalculations in calculations, _mRefMap).
 */
function mergeCalcsAndModules(calcs, modulesData) {
    if (!calcs) return calcs
    if (!modulesData) return calcs

    const merged = { ...calcs }

    // Merge moduleGroups into calculationsGroups
    if (modulesData.moduleGroups?.length) {
        merged.calculationsGroups = [
            ...(merged.calculationsGroups || []),
            ...modulesData.moduleGroups
        ]
    }

    // Merge moduleCalculations into calculations
    if (modulesData.moduleCalculations?.length) {
        merged.calculations = [
            ...(merged.calculations || []),
            ...modulesData.moduleCalculations
        ]
    }

    // Add modules array
    if (modulesData.modules !== undefined) {
        merged.modules = modulesData.modules
    }

    // Add _mRefMap
    if (modulesData._mRefMap !== undefined) {
        merged._mRefMap = modulesData._mRefMap
    }

    // Add moduleTemplates if present
    if (modulesData.moduleTemplates !== undefined) {
        merged.moduleTemplates = modulesData.moduleTemplates
    }

    return merged
}

/**
 * Load all model data files and return { inputs, calculations } where
 * calculations includes merged module data.
 *
 * @param {string} dataDir - Path to the data directory
 * @returns {Promise<{ inputs: Object, calculations: Object }>}
 */
export async function loadModelData(dataDir) {
    const [inputs, calcs, modulesData] = await Promise.all([
        readJsonFile(path.join(dataDir, 'model-inputs.json')),
        readJsonFile(path.join(dataDir, 'model-calculations.json')),
        readJsonFile(path.join(dataDir, 'model-modules.json'))
    ])

    return {
        inputs,
        calculations: mergeCalcsAndModules(calcs, modulesData)
    }
}

/**
 * Load just the calculations + modules (no inputs).
 * Useful for routes that load inputs separately or don't need them.
 *
 * @param {string} dataDir - Path to the data directory
 * @returns {Promise<Object>} Merged calculations object
 */
export async function loadCalculations(dataDir) {
    const [calcs, modulesData] = await Promise.all([
        readJsonFile(path.join(dataDir, 'model-calculations.json')),
        readJsonFile(path.join(dataDir, 'model-modules.json'))
    ])

    return mergeCalcsAndModules(calcs, modulesData)
}
