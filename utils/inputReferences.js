/**
 * Input Reference Utilities
 * Functions for generating hierarchical references and identifiers
 */

/**
 * Get hierarchical reference for an input (e.g., "1.2" for group 1, input 2)
 * @param {number} inputId - The input ID
 * @param {Array} inputs - Array of all inputs
 * @param {Array} groups - Array of all groups
 * @returns {string} Hierarchical reference string
 */
export function getInputReference(inputId, inputs, groups) {
    const input = inputs.find(i => i.id === inputId)
    if (!input) return ''

    const group = groups.find(g => g.id === input.groupId)
    if (!group) return ''

    // Get all inputs in this group, sorted by id
    const groupInputs = inputs
        .filter(i => i.groupId === input.groupId)
        .sort((a, b) => a.id - b.id)

    const inputIndex = groupInputs.findIndex(i => i.id === inputId)
    const groupOrder = groups
        .filter(g => g.order <= group.order)
        .sort((a, b) => a.order - b.order)
        .findIndex(g => g.id === group.id) + 1

    return `${groupOrder}.${inputIndex + 1}`
}

/**
 * Get unique flag identifier for auto-generated flags
 * @param {string} flagId - The flag ID (e.g., 'flag_simple_1', 'flag_keyperiod_2')
 * @returns {string} Unique identifier (e.g., 'F.S.1', 'F.KP.2')
 */
export function getFlagIdentifier(flagId) {
    if (!flagId || typeof flagId !== 'string' || !flagId.startsWith('flag_')) {
        return flagId
    }

    const parts = flagId.split('_')
    if (parts.length < 3) {
        return `F.${parts[parts.length - 1]}`
    }

    const type = parts[1] // 'simple', 'simple2', 'inputtype1', 'inputtype2', or 'keyperiod'
    const id = parts.slice(2).join('_') // Handle IDs that might have underscores

    // Create unique identifier based on type
    if (type === 'simple' || type === 'inputtype1') {
        return `F.S.${id}`
    } else if (type === 'simple2' || type === 'inputtype2') {
        return `F.S2.${id}`
    } else if (type === 'keyperiod') {
        return `F.KP.${id}`
    }

    // Fallback for other types
    return `F.${type}.${id}`
}
