/**
 * Value Aggregation Utilities
 * Functions for aggregating and formatting time series values
 */

// Cached Intl.NumberFormat instances for performance
// toLocaleString() creates a new formatter each call - caching gives ~100x speedup in hot paths
const formatterCache = new Map()

function getFormatter(key, options) {
    if (!formatterCache.has(key)) {
        formatterCache.set(key, new Intl.NumberFormat('en-US', options))
    }
    return formatterCache.get(key)
}

// Pre-create common formatters
const FMT_INTEGER = getFormatter('int', { maximumFractionDigits: 0 })
const FMT_COMPACT = getFormatter('compact', { maximumFractionDigits: 1 })
const FMT_DEC2 = getFormatter('dec2', { maximumFractionDigits: 2 })

/**
 * Get aggregated value for an input across multiple period indices
 * @param {Object} input - The input object with category and type
 * @param {Array} inputArray - The array of values for this input
 * @param {Array<number>} indices - Array of period indices to aggregate
 * @returns {number} The aggregated value
 */
export function getAggregatedValue(input, inputArray, indices) {
    if (!input || !inputArray || indices.length === 0) return 0

    // For flags, use boolean OR: 1 if ANY period has flag=1, else 0
    if (input.category === 'flag') {
        const values = indices.map(idx => inputArray[idx] || 0)
        return values.some(v => v === 1 || v === '1') ? 1 : 0
    }

    // Stock: point-in-time value
    if (input.type === 'stock' || input.type === 'stock_end') {
        // End of period: last index
        return inputArray[indices[indices.length - 1]] || 0
    }
    if (input.type === 'stock_start') {
        // Start of period: first index
        return inputArray[indices[0]] || 0
    }

    // Flow: sum all values (period measure)
    return indices.reduce((sum, idx) => sum + (inputArray[idx] || 0), 0)
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
    if (!arr || indices.length === 0) return 0

    // For flags, use boolean OR: 1 if ANY period has flag=1, else 0
    // Check both category and type since calcs pass type='flag'
    if (category === 'flag' || type === 'flag') {
        const values = indices.map(idx => arr[idx] || 0)
        return values.some(v => v === 1 || v === '1') ? 1 : 0
    }

    // Stock/constant: point-in-time value (use last value in period)
    if (type === 'stock' || type === 'stock_end' || type === 'constant') {
        // End of period: last index
        return arr[indices[indices.length - 1]] || 0
    }
    if (type === 'stock_start') {
        // Start of period: first index
        return arr[indices[0]] || 0
    }

    // Flow: sum all values
    return indices.reduce((sum, idx) => sum + (arr[idx] || 0), 0)
}

/**
 * Format a numeric value for display with smart rounding:
 * - Large numbers (>=1000): whole numbers, no decimals
 * - Small decimals (<1): 2 significant figures (e.g., 0.00456 → 0.0046)
 * - Medium numbers (1-999): up to 2 decimal places
 * @param {number} val - The value to format
 * @param {boolean|Object} options - Boolean for backward compat (compact mode) or options object
 * @param {boolean} [options.accounting=false] - Show negatives in parentheses: (1,234)
 * @param {boolean} [options.compact=false] - Use compact notation (e.g., 1.5k)
 * @param {number} [options.decimals=2] - Max decimal places for medium numbers
 * @param {string} [options.emptyValue=''] - Value to return for zero/null/undefined
 * @returns {string} Formatted string representation
 */
export function formatValue(val, options = false) {
    // Backward compatibility: if options is a boolean, treat as compact flag
    const opts = typeof options === 'boolean'
        ? { compact: options, accounting: false, decimals: 2, emptyValue: '–' }
        : { compact: false, accounting: false, decimals: 2, emptyValue: '', ...options }

    const { compact, accounting, decimals, emptyValue } = opts

    // Handle zero/null/undefined - return emptyValue ('' for accounting/explicit, '–' for default)
    if (val === 0 || val === null || val === undefined) {
        return emptyValue
    }
    if (typeof val !== 'number' || isNaN(val)) return '–'

    const absVal = Math.abs(val)
    let formatted

    if (compact && absVal >= 1000) {
        formatted = FMT_COMPACT.format(absVal / 1000) + 'k'
    } else if (absVal >= 1000) {
        // Large numbers: no decimals
        formatted = FMT_INTEGER.format(Math.round(absVal))
    } else if (absVal > 0 && absVal < 1) {
        // Small decimals: 2 significant figures
        const magnitude = Math.floor(Math.log10(absVal))
        const sigFigDecimals = Math.max(0, -magnitude + 1)
        // Cache formatters for common sig fig decimal counts (0-6 covers most cases)
        const key = `sig${sigFigDecimals}`
        const fmt = getFormatter(key, { minimumFractionDigits: 0, maximumFractionDigits: sigFigDecimals })
        formatted = fmt.format(absVal)
    } else {
        // Medium numbers: up to specified decimals
        if (decimals === 2) {
            formatted = FMT_DEC2.format(absVal)
        } else {
            const key = `dec${decimals}`
            const fmt = getFormatter(key, { maximumFractionDigits: decimals })
            formatted = fmt.format(absVal)
        }
    }

    // Handle negatives: accounting style uses parentheses, otherwise prefix with minus
    if (val < 0) {
        return accounting ? `(${formatted})` : `-${formatted}`
    }
    return formatted
}

/**
 * Calculate period values from a result array based on view headers and mode
 * @param {Array} resultArray - The raw monthly result array
 * @param {Array} viewHeaders - Array of view header objects with index/indices
 * @param {string} viewMode - 'M', 'Q', 'Y', or 'FY'
 * @param {string} calcType - 'flow', 'stock', or 'stock_start'
 * @returns {Array<number>} Aggregated values per period
 */
export function calculatePeriodValues(resultArray, viewHeaders, viewMode, calcType = 'flow') {
    return viewHeaders.map((header) => {
        if (viewMode === 'M') {
            return resultArray[header.index] ?? 0
        } else {
            return getAggregatedValueForArray(resultArray, header.indices || [header.index], calcType)
        }
    })
}

/**
 * Calculate total from period values based on calculation type
 * @param {Array<number>} periodValues - Array of period values
 * @param {string} calcType - 'flow', 'stock', or 'stock_start'
 * @returns {number} The total value
 */
export function calculateTotal(periodValues, calcType = 'flow') {
    if (calcType === 'stock' || calcType === 'stock_end' || calcType === 'constant') {
        // Stock/constant: use last period value
        return periodValues[periodValues.length - 1] || 0
    }
    if (calcType === 'stock_start') {
        // Stock start: use first period value
        return periodValues[0] || 0
    }
    if (calcType === 'flag') {
        // Flag: 1 if any period is 1
        return periodValues.some(v => v === 1 || v === '1') ? 1 : 0
    }
    // Flow: sum all values
    return periodValues.reduce((sum, v) => sum + v, 0)
}
