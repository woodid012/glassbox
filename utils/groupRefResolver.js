/**
 * Resolve the formula-reference prefix+index for an input group.
 *
 * Uses explicit `refIndex` from group data (stable across deletions),
 * with a console warning when refIndex is missing.
 */

/**
 * Get the mode prefix letter for a group.
 * @param {object} group - The input group object
 * @param {object[]} [groupInputs] - Inputs belonging to this group (used as mode fallback)
 * @returns {string} One of 'T', 'C', 'L', 'S', 'V'
 */
export function getGroupPrefix(group, groupInputs) {
    if (group.groupType === 'timing') return 'T'
    if (group.groupType === 'constant') return 'C'
    const groupMode = group.entryMode || groupInputs?.[0]?.mode || 'values'
    if (groupMode === 'lookup' || groupMode === 'lookup2') return 'L'
    if (groupMode === 'series') return 'S'
    return 'V'
}

/**
 * Resolve the full group reference string (e.g. "S1", "L2", "C1").
 * @param {object} group - The input group object (must have `refIndex`)
 * @param {object[]} [groupInputs] - Inputs belonging to this group (used as mode fallback)
 * @returns {string|null} The reference string, or null if refIndex is missing
 */
export function getGroupRef(group, groupInputs) {
    const prefix = getGroupPrefix(group, groupInputs)
    const index = group.refIndex
    if (index == null) {
        console.warn(`Group ${group.id} (${group.name}) missing refIndex — assign one in model-inputs.json`)
        return null
    }
    return `${prefix}${index}`
}
