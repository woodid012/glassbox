/**
 * Style Helpers
 * Utilities for consistent color/style mappings across the dashboard
 */

/**
 * Get color classes for input mode badges
 * @param {string} mode - The mode: 'timing', 'series', 'constant', 'lookup', or 'values'
 * @param {boolean} background - Whether this is a badge (true) or reference item (false)
 * @returns {string} Tailwind color classes
 */
export function getModeColorClasses(mode, background = true) {
    const normalizedMode = (mode === 'lookup' || mode === 'lookup2') ? 'lookup' : mode

    if (background) {
        // Badge style (darker background)
        switch (normalizedMode) {
            case 'timing':
                return 'text-teal-600 bg-teal-100'
            case 'series':
                return 'text-green-600 bg-green-100'
            case 'constant':
                return 'text-blue-600 bg-blue-100'
            case 'lookup':
                return 'text-lime-600 bg-lime-100'
            default:
                return 'text-purple-600 bg-purple-100'
        }
    } else {
        // Reference item style (lighter background)
        switch (normalizedMode) {
            case 'timing':
                return 'text-teal-600 bg-teal-50'
            case 'series':
                return 'text-green-600 bg-green-50'
            case 'constant':
                return 'text-blue-600 bg-blue-50'
            case 'lookup':
                return 'text-lime-600 bg-lime-50'
            default:
                return 'text-purple-600 bg-purple-50'
        }
    }
}

/**
 * Get color classes for calculation type badges
 * @param {string} calcType - The calculation type: 'flow', 'stock', or 'stock_start'
 * @returns {string} Tailwind color classes
 */
export function getCalcTypeColorClasses(calcType) {
    switch (calcType) {
        case 'flow':
            return 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
        case 'stock':
            return 'text-blue-600 bg-blue-50 hover:bg-blue-100'
        case 'stock_start':
            return 'text-purple-600 bg-purple-50 hover:bg-purple-100'
        default:
            return 'text-slate-500 bg-slate-100'
    }
}

/**
 * Get color classes for calculation type display (non-interactive)
 * @param {string} calcType - The calculation type: 'flow', 'stock', or 'stock_start'
 * @returns {string} Tailwind color classes
 */
export function getCalcTypeDisplayClasses(calcType) {
    return calcType === 'flow'
        ? 'text-emerald-600 bg-emerald-50'
        : 'text-slate-500 bg-slate-100'
}

/**
 * Mode prefix mapping for reference codes
 */
export const MODE_PREFIX_MAP = {
    timing: 'T',
    series: 'S',
    constant: 'C',
    lookup: 'L',
    values: 'V',
    default: 'V'
}

/**
 * Get mode prefix for reference codes
 * @param {string} mode - The input mode
 * @returns {string} Single letter prefix
 */
export function getModePrefix(mode) {
    const normalizedMode = (mode === 'lookup' || mode === 'lookup2') ? 'lookup' : mode
    return MODE_PREFIX_MAP[normalizedMode] || MODE_PREFIX_MAP.default
}

/**
 * Filter items (calculations or groups) by tab ID
 * For calculations, tabId can be derived from their group's tabId
 * @param {Array} items - Array of items with optional tabId
 * @param {string|number} tabId - The active tab ID
 * @param {boolean} includeOrphaned - If true, include items without tabId when on first tab
 * @param {Array} groups - Optional groups array to derive tabId from groupId (for calculations)
 * @returns {Array} Filtered items
 */
export function getTabItems(items, tabId, includeOrphaned = false, groups = null) {
    return (items || []).filter(item => {
        // If groups provided and item has groupId, try to derive tabId from group
        if (groups && item.groupId !== undefined) {
            const group = groups.find(g => g.id === item.groupId)
            if (group) {
                // Group found - use group's tabId
                return group.tabId === tabId
            }
            // Group not found - fall back to item's tabId (orphaned calc)
        }
        // Use item's own tabId (groups, or calcs without groupId, or calcs with missing group)
        const effectiveTabId = item.tabId
        return effectiveTabId === tabId || (includeOrphaned && !effectiveTabId)
    })
}

/**
 * Get view mode label
 * @param {string} viewMode - 'M', 'Q', 'Y', or 'FY'
 * @returns {string} Human-readable label
 */
export function getViewModeLabel(viewMode) {
    switch (viewMode) {
        case 'M': return 'Monthly'
        case 'Q': return 'Quarterly'
        case 'Y': return 'Yearly'
        case 'FY': return 'Financial Year'
        default: return 'Monthly'
    }
}
