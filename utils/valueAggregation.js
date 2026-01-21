/**
 * Value Aggregation Utilities
 * Functions for aggregating and formatting time series values
 */

/**
 * Get aggregated value for an input across multiple period indices
 * @param {Object} input - The input object with category and type
 * @param {Array} inputArray - The array of values for this input
 * @param {Array<number>} indices - Array of period indices to aggregate
 * @returns {number} The aggregated value
 */
export function getAggregatedValue(input, inputArray, indices) {
    if (!input || !inputArray) return 0

    const values = indices.map(idx => inputArray[idx] || 0)
    const sum = values.reduce((acc, v) => acc + v, 0)

    // For flags, use boolean OR: 1 if ANY period has flag=1, else 0
    if (input.category === 'flag') {
        return values.some(v => v === 1 || v === '1') ? 1 : 0
    }

    if (input.type === 'stock') {
        // Lookup (stock): average the values (point-in-time measure)
        const nonZeroCount = values.filter(v => v !== 0).length
        return nonZeroCount > 0 ? sum / nonZeroCount : 0
    }
    // Spread (flow): sum the values (period measure)
    return sum
}

/**
 * Aggregate values from an array (for generic array aggregation)
 * @param {Array} arr - Array of values
 * @param {Array<number>} indices - Array of period indices to aggregate
 * @param {string} type - 'stock' (Lookup) or 'flow' (Spread) (default: 'flow')
 * @param {string} category - 'value', 'flag', or 'indexation' (default: 'value')
 * @returns {number} The aggregated value
 */
export function getAggregatedValueForArray(arr, indices, type = 'flow', category = 'value') {
    if (!arr) return 0
    const values = indices.map(idx => arr[idx] || 0)
    const sum = values.reduce((acc, v) => acc + v, 0)

    // For flags, use boolean OR: 1 if ANY period has flag=1, else 0
    if (category === 'flag') {
        return values.some(v => v === 1 || v === '1') ? 1 : 0
    }

    if (type === 'stock') {
        const nonZeroCount = values.filter(v => v !== 0).length
        return nonZeroCount > 0 ? sum / nonZeroCount : 0
    }
    return sum
}

/**
 * Format a numeric value for display
 * @param {number} val - The value to format
 * @param {boolean} compact - Whether to use compact notation (e.g., 1.5k)
 * @returns {string} Formatted string representation
 */
export function formatValue(val, compact = false) {
    if (typeof val !== 'number' || isNaN(val)) return '–'
    if (compact && Math.abs(val) >= 1000) {
        return (val / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'k'
    }
    return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
