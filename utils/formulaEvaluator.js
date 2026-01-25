// Formula Evaluator Utility
// Handles formula parsing and evaluation including array functions (CUMSUM, CUMPROD, etc.)

// LRU Cache implementation for expression functions
// Uses a Map which maintains insertion order, allowing efficient LRU eviction
class LRUCache {
    constructor(maxSize) {
        this.cache = new Map()
        this.maxSize = maxSize
    }

    get(key) {
        if (!this.cache.has(key)) return undefined
        // Move to end (most recently used)
        const value = this.cache.get(key)
        this.cache.delete(key)
        this.cache.set(key, value)
        return value
    }

    set(key, value) {
        // If key exists, delete it first to update position
        if (this.cache.has(key)) {
            this.cache.delete(key)
        } else if (this.cache.size >= this.maxSize) {
            // Evict oldest entry (first key in iteration order)
            const oldestKey = this.cache.keys().next().value
            this.cache.delete(oldestKey)
        }
        this.cache.set(key, value)
    }

    has(key) {
        return this.cache.has(key)
    }

    get size() {
        return this.cache.size
    }
}

// Cache for compiled expression functions - avoids repeated new Function() calls
// Using LRU cache to avoid clearing all cached functions when limit is reached
const expressionCache = new LRUCache(1000)

// Cache for compiled regex patterns - avoids repeated regex compilation
// Regex cache doesn't need LRU since patterns are reused frequently
const regexCache = new Map()

/**
 * Get or create a cached regex for a reference
 * @param {string} ref - Reference name to create regex for
 * @returns {RegExp} Cached or newly created regex
 */
export function getCachedRegex(ref) {
    if (!regexCache.has(ref)) {
        regexCache.set(ref, new RegExp(`\\b${ref.replace('.', '\\.')}\\b`, 'g'))
    }
    return regexCache.get(ref)
}

/**
 * Evaluate a safe expression using cached compiled functions
 * @param {string} safeExpr - Sanitized expression to evaluate
 * @returns {number} Evaluated result
 */
function evaluateCachedExpression(safeExpr) {
    if (!safeExpr.trim()) return 0

    let evalFn = expressionCache.get(safeExpr)
    if (!evalFn) {
        // LRU cache automatically evicts oldest entries when full
        try {
            evalFn = new Function(`return (${safeExpr})`)
            expressionCache.set(safeExpr, evalFn)
        } catch {
            return 0
        }
    }

    try {
        const result = evalFn()
        return typeof result === 'number' && isFinite(result) ? result : 0
    } catch {
        return 0
    }
}

/**
 * Evaluate an expression for all periods and return an array of results
 * @param {string} expr - The expression to evaluate
 * @param {Object} allRefs - Map of reference names to their value arrays
 * @param {number} periods - Number of periods
 * @returns {number[]} Array of evaluated values for each period
 */
export function evalExprForAllPeriods(expr, allRefs, periods) {
    const arr = new Array(periods).fill(0)

    // Sort refs once (longer refs first to avoid partial replacements)
    const sortedRefs = Object.keys(allRefs).sort((a, b) => b.length - a.length)

    // Pre-compile all regex patterns for refs used in this expression
    const compiledRefs = sortedRefs
        .filter(ref => expr.includes(ref.split('.')[0])) // Quick filter to skip irrelevant refs
        .map(ref => ({
            ref,
            regex: getCachedRegex(ref),
            values: allRefs[ref]
        }))

    for (let i = 0; i < periods; i++) {
        let periodExpr = expr

        // Substitute all refs with their period values using pre-compiled regex
        for (const { ref, regex, values } of compiledRefs) {
            const value = values?.[i] ?? 0
            regex.lastIndex = 0 // Reset regex state for global patterns
            periodExpr = periodExpr.replace(regex, value.toString())
        }

        // Replace any unresolved R-references with 0
        // These are calculations not yet computed (e.g., SHIFT(R84,1) when R84 hasn't been evaluated)
        // Without this, sanitization would strip "R" from "R84" leaving literal "84"
        periodExpr = periodExpr.replace(/\bR\d+\b/g, '0')

        // Convert MIN/MAX/ABS to Math functions
        periodExpr = periodExpr
            .replace(/\bMIN\s*\(/gi, 'Math.min(')
            .replace(/\bMAX\s*\(/gi, 'Math.max(')
            .replace(/\bABS\s*\(/gi, 'Math.abs(')

        // Sanitize and convert power operator
        // Allow comparison operators (>, <, =, !), logical operators (&, |), and modulo (%)
        let safeExpr = periodExpr.replace(/[^0-9+\-*/().e\s^Math.minaxbs,<>=!&|%]/gi, '')
        safeExpr = safeExpr.replace(/\^/g, '**')

        // Evaluate using cached function
        arr[i] = evaluateCachedExpression(safeExpr)
    }
    return arr
}

/**
 * CUMPROD_Y - Cumulative product at year boundaries only
 * Applies the factor only when the year changes (for annual rates like degradation)
 * @param {number[]} innerArray - Array of values to multiply
 * @param {number[]} yearArray - Array of year values for each period
 * @param {number} periods - Number of periods
 * @returns {number[]} Cumulative product array
 */
export function cumprodY(innerArray, yearArray, periods) {
    const result = new Array(periods).fill(0)
    let product = 1
    let lastYear = null
    let lastYearValue = null

    for (let i = 0; i < periods; i++) {
        const currentYear = yearArray?.[i]
        // Apply factor only when year changes (not on first period)
        // Use the PREVIOUS year's value (stored in lastYearValue)
        if (lastYear !== null && currentYear !== lastYear && lastYearValue !== null) {
            product *= lastYearValue
        }
        result[i] = product
        // Track last year's value (update at end of each period)
        if (currentYear !== lastYear) {
            lastYearValue = innerArray[i] // First value of new year becomes "last year's value" for next transition
        }
        lastYear = currentYear
    }

    return result
}

/**
 * CUMPROD - Standard cumulative product (every period)
 * @param {number[]} innerArray - Array of values to multiply
 * @param {number} periods - Number of periods
 * @returns {number[]} Cumulative product array
 */
export function cumprod(innerArray, periods) {
    const result = new Array(periods).fill(0)
    let product = 1

    for (let i = 0; i < periods; i++) {
        product *= innerArray[i]
        result[i] = product
    }

    return result
}

/**
 * CUMSUM - Standard cumulative sum (every period)
 * @param {number[]} innerArray - Array of values to sum
 * @param {number} periods - Number of periods
 * @returns {number[]} Cumulative sum array
 */
export function cumsum(innerArray, periods) {
    const result = new Array(periods).fill(0)
    let sum = 0

    for (let i = 0; i < periods; i++) {
        sum += innerArray[i]
        result[i] = sum
    }

    return result
}

/**
 * CUMSUM_Y - Cumulative sum at year boundaries only
 * Adds the value only when the year changes (for annual values like degradation %)
 * @param {number[]} innerArray - Array of values to sum
 * @param {number[]} yearArray - Array of year values for each period
 * @param {number} periods - Number of periods
 * @returns {number[]} Cumulative sum array
 */
export function cumsumY(innerArray, yearArray, periods) {
    const result = new Array(periods).fill(0)
    let sum = 0
    let lastYear = null
    let lastYearValue = null

    for (let i = 0; i < periods; i++) {
        const currentYear = yearArray?.[i]
        // Add value only when year changes (not on first period)
        // Use the PREVIOUS year's value
        if (lastYear !== null && currentYear !== lastYear && lastYearValue !== null) {
            sum += lastYearValue
        }
        result[i] = sum
        // Track last year's value
        if (currentYear !== lastYear) {
            lastYearValue = innerArray[i]
        }
        lastYear = currentYear
    }

    return result
}

/**
 * SHIFT - Shift array forward by n periods, filling with 0
 * SHIFT(X, 1) returns [0, X[0], X[1], X[2], ...]
 * Useful for getting "prior period value" without self-referential formulas
 * @param {number[]} innerArray - Array of values to shift
 * @param {number} n - Number of periods to shift forward
 * @param {number} periods - Total number of periods
 * @returns {number[]} Shifted array
 */
export function shift(innerArray, n, periods) {
    const result = new Array(periods).fill(0)
    for (let i = n; i < periods; i++) {
        result[i] = innerArray[i - n] ?? 0
    }
    return result
}

/**
 * COUNT - Cumulative count of non-zero values
 * COUNT([0, 5, 0, 10, 3]) returns [0, 1, 1, 2, 3]
 * @param {number[]} innerArray - Array of values to count
 * @param {number} periods - Number of periods
 * @returns {number[]} Cumulative count array
 */
export function count(innerArray, periods) {
    const result = new Array(periods).fill(0)
    let cnt = 0

    for (let i = 0; i < periods; i++) {
        if (innerArray[i] !== 0) {
            cnt++
        }
        result[i] = cnt
    }

    return result
}

/**
 * Process array functions in a formula and return the processed formula with placeholders
 * @param {string} formula - The formula string containing array functions
 * @param {Object} allRefs - Map of reference names to their value arrays
 * @param {Object} timeline - Timeline object with periods and year array
 * @returns {{ processedFormula: string, arrayFnResults: Object }} Processed formula and results map
 */
export function processArrayFunctions(formula, allRefs, timeline) {
    let processedFormula = formula
    const arrayFnResults = {}
    let arrayFnCounter = 0

    // CUMPROD_Y(expr) - Cumulative product at year boundaries only
    const cumprodYRegex = /CUMPROD_Y\s*\(([^)]+)\)/gi
    let match
    while ((match = cumprodYRegex.exec(processedFormula)) !== null) {
        const innerExpr = match[1]
        const innerArray = evalExprForAllPeriods(innerExpr, allRefs, timeline.periods)
        const resultArray = cumprodY(innerArray, timeline.year, timeline.periods)

        const placeholder = `__ARRAYFN${arrayFnCounter++}__`
        arrayFnResults[placeholder] = resultArray
        processedFormula = processedFormula.replace(match[0], placeholder)
        cumprodYRegex.lastIndex = 0
    }

    // CUMPROD(expr) - Standard cumulative product
    const cumprodRegex = /CUMPROD\s*\(([^)]+)\)/gi
    while ((match = cumprodRegex.exec(processedFormula)) !== null) {
        const innerExpr = match[1]
        const innerArray = evalExprForAllPeriods(innerExpr, allRefs, timeline.periods)
        const resultArray = cumprod(innerArray, timeline.periods)

        const placeholder = `__ARRAYFN${arrayFnCounter++}__`
        arrayFnResults[placeholder] = resultArray
        processedFormula = processedFormula.replace(match[0], placeholder)
        cumprodRegex.lastIndex = 0
    }

    // CUMSUM_Y(expr) - Cumulative sum at year boundaries only
    const cumsumYRegex = /CUMSUM_Y\s*\(([^)]+)\)/gi
    while ((match = cumsumYRegex.exec(processedFormula)) !== null) {
        const innerExpr = match[1]
        const innerArray = evalExprForAllPeriods(innerExpr, allRefs, timeline.periods)
        const resultArray = cumsumY(innerArray, timeline.year, timeline.periods)

        const placeholder = `__ARRAYFN${arrayFnCounter++}__`
        arrayFnResults[placeholder] = resultArray
        processedFormula = processedFormula.replace(match[0], placeholder)
        cumsumYRegex.lastIndex = 0
    }

    // CUMSUM(expr) - Standard cumulative sum
    const cumsumRegex = /CUMSUM\s*\(([^)]+)\)/gi
    while ((match = cumsumRegex.exec(processedFormula)) !== null) {
        const innerExpr = match[1]
        const innerArray = evalExprForAllPeriods(innerExpr, allRefs, timeline.periods)
        const resultArray = cumsum(innerArray, timeline.periods)

        const placeholder = `__ARRAYFN${arrayFnCounter++}__`
        arrayFnResults[placeholder] = resultArray
        processedFormula = processedFormula.replace(match[0], placeholder)
        cumsumRegex.lastIndex = 0
    }

    // SHIFT(expr, n) - Shift array forward by n periods
    const shiftRegex = /SHIFT\s*\(\s*([^,]+)\s*,\s*(\d+)\s*\)/gi
    while ((match = shiftRegex.exec(processedFormula)) !== null) {
        const innerExpr = match[1]
        const n = parseInt(match[2]) || 1
        const innerArray = evalExprForAllPeriods(innerExpr, allRefs, timeline.periods)
        const resultArray = shift(innerArray, n, timeline.periods)

        const placeholder = `__ARRAYFN${arrayFnCounter++}__`
        arrayFnResults[placeholder] = resultArray
        processedFormula = processedFormula.replace(match[0], placeholder)
        shiftRegex.lastIndex = 0
    }

    // COUNT(expr) - Cumulative count of non-zero values
    const countRegex = /COUNT\s*\(([^)]+)\)/gi
    while ((match = countRegex.exec(processedFormula)) !== null) {
        const innerExpr = match[1]
        const innerArray = evalExprForAllPeriods(innerExpr, allRefs, timeline.periods)
        const resultArray = count(innerArray, timeline.periods)

        const placeholder = `__ARRAYFN${arrayFnCounter++}__`
        arrayFnResults[placeholder] = resultArray
        processedFormula = processedFormula.replace(match[0], placeholder)
        countRegex.lastIndex = 0
    }

    return { processedFormula, arrayFnResults }
}

/**
 * Evaluate a single period's expression
 * @param {string} expr - Expression with references already substituted
 * @returns {number} Evaluated result
 */
export function evaluateSafeExpression(expr) {
    // Convert MIN/MAX to Math.min/Math.max before sanitizing
    let processedExpr = expr
        .replace(/\bMIN\s*\(/gi, 'Math.min(')
        .replace(/\bMAX\s*\(/gi, 'Math.max(')
        .replace(/\bABS\s*\(/gi, 'Math.abs(')

    // Allow Math., comparison operators (>, <, =, !), logical operators (&, |), and modulo (%)
    let safeExpr = processedExpr.replace(/[^0-9+\-*/().e\s^Math.minaxbs,<>=!&|%]/gi, '')
    safeExpr = safeExpr.replace(/\^/g, '**')

    // Use cached expression evaluation
    return evaluateCachedExpression(safeExpr)
}
