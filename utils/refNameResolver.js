// Ref Name Resolver — maps human-readable refNames to standard refs (S1.14, C1.19, etc.)
// and provides {Name} syntax resolution for formulas.
//
// Used by both server engine (serverModelEngine.js) and client hook (useReferenceMap.js).

import { getGroupRef } from './groupRefResolver'

/**
 * Build a refName→standardRef mapping from input data.
 * Returns a Map like { "OmMsa" => "S1.14", "PowerMW" => "C1.1", ... }
 *
 * @param {Object[]} inputGlass - Array of input objects (with refName field)
 * @param {Object[]} inputGlassGroups - Array of input group objects
 * @returns {Map<string, string>} refName → standard ref string
 */
export function buildRefNameMap(inputGlass, inputGlassGroups) {
    const map = new Map()
    if (!inputGlass || !inputGlassGroups) return map

    const activeGroups = inputGlassGroups.filter(group =>
        inputGlass.some(input => input.groupId === group.id)
    )

    activeGroups.forEach(group => {
        const groupInputs = inputGlass.filter(input => input.groupId === group.id)
        const groupRef = getGroupRef(group, groupInputs)
        if (!groupRef) return

        groupInputs.forEach(input => {
            if (!input.refName) return
            const inputNum = group.id === 100 ? input.id - 99 : input.id
            const standardRef = `${groupRef}.${inputNum}`
            map.set(input.refName, standardRef)
        })
    })

    return map
}

/**
 * Register refName aliases in a reference map.
 * For each refName, points to the same array as its standard ref.
 *
 * @param {Object} refs - The reference map (mutated in place)
 * @param {Map<string, string>} refNameMap - refName → standard ref mapping
 */
export function registerRefNameAliases(refs, refNameMap) {
    for (const [refName, standardRef] of refNameMap) {
        if (refs[standardRef]) {
            refs[refName] = refs[standardRef]
        }
    }
}

/**
 * Resolve {Name} tokens in a formula string by replacing them with standard refs.
 * E.g., "{OmMsa} * I2 * F2" → "S1.14 * I2 * F2"
 *
 * @param {string} formula - Formula that may contain {Name} tokens
 * @param {Map<string, string>} refNameMap - refName → standard ref mapping
 * @returns {string} Formula with {Name} tokens resolved
 */
export function resolveRefNameTokens(formula, refNameMap) {
    if (!formula || !refNameMap || refNameMap.size === 0) return formula
    return formula.replace(/\{(\w+)\}/g, (match, name) => {
        const standardRef = refNameMap.get(name)
        return standardRef || match // leave unresolved names as-is
    })
}

/**
 * Generate a refName from an input display name.
 * PascalCase, strips special chars, handles duplicates.
 *
 * @param {string} name - Display name of the input
 * @param {Set<string>} existingNames - Set of already-used refNames (for dedup)
 * @returns {string} Generated refName
 */
export function generateRefName(name, existingNames = new Set()) {
    let clean = name
        .replace(/[()%$/\\]/g, '')
        .replace(/[&+]/g, 'And')
        .replace(/-/g, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()

    const words = clean.split(/\s+/).filter(w => w.length > 0)
    if (words.length === 0) return 'Unnamed'

    let refName = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')

    // Prepend underscore if starts with digit
    if (/^\d/.test(refName)) {
        refName = '_' + refName
    }

    // Handle duplicates
    if (existingNames.has(refName)) {
        let counter = 2
        while (existingNames.has(refName + counter)) counter++
        refName = refName + counter
    }

    return refName
}
