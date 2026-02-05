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

// Helpers for Excel-style functions — injected into eval scope via new Function()
function _IF(condition, trueVal, falseVal) {
    return condition ? trueVal : falseVal
}
function _AND(a, b) {
    return (a && b) ? 1 : 0
}
function _OR(a, b) {
    return (a || b) ? 1 : 0
}
function _NOT(a) {
    return a ? 0 : 1
}
function _ROUND(x, n) {
    const factor = Math.pow(10, n || 0)
    return Math.round(x * factor) / factor
}

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
        regexCache.set(ref, new RegExp(`\\b${ref.replace(/\./g, '\\.')}\\b`, 'g'))
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
            evalFn = new Function('_IF', '_AND', '_OR', '_NOT', '_ROUND', `return Number(${safeExpr})`)
            expressionCache.set(safeExpr, evalFn)
        } catch {
            return 0
        }
    }

    try {
        const result = evalFn(_IF, _AND, _OR, _NOT, _ROUND)
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
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.trackWarnings=false] - Whether to track unresolved references
 * @returns {number[]|{values: number[], warnings: string[]}} Array of values, or object with values and warnings if trackWarnings is true
 */
export function evalExprForAllPeriods(expr, allRefs, periods, options = {}) {
    const arr = new Array(periods).fill(0)
    const warnings = options.trackWarnings ? new Set() : null

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
            // Wrap negative values in parentheses to avoid syntax errors like --2.32
            const valueStr = value < 0 ? `(${value})` : value.toString()
            periodExpr = periodExpr.replace(regex, valueStr)
        }

        // Track unresolved R-references before replacing with 0 (only on first period to avoid duplicates)
        if (warnings && i === 0) {
            const unresolvedMatches = periodExpr.match(/\bR\d+\b/g)
            if (unresolvedMatches) {
                unresolvedMatches.forEach(ref => warnings.add(ref))
            }
        }

        // Replace any unresolved R-references with 0
        // These are calculations not yet computed (e.g., SHIFT(R84,1) when R84 hasn't been evaluated)
        // Without this, sanitization would strip "R" from "R84" leaving literal "84"
        periodExpr = periodExpr.replace(/\bR\d+\b/g, '0')

        // Convert Excel-style functions to eval-safe functions
        periodExpr = periodExpr
            .replace(/\bIF\s*\(/gi, '_IF(')
            .replace(/\bAND\s*\(/gi, '_AND(')
            .replace(/\bOR\s*\(/gi, '_OR(')
            .replace(/\bNOT\s*\(/gi, '_NOT(')
            .replace(/\bROUND\s*\(/gi, '_ROUND(')
            .replace(/\bMIN\s*\(/gi, 'Math.min(')
            .replace(/\bMAX\s*\(/gi, 'Math.max(')
            .replace(/\bABS\s*\(/gi, 'Math.abs(')

        // Sanitize and convert power operator
        // Allow comparison operators (>, <, =, !), logical operators (&, |), and modulo (%)
        let safeExpr = periodExpr.replace(/[^0-9+\-*/().e\s^Math.minaxbsfdoru_,<>=!&|%]/gi, '')
        safeExpr = safeExpr.replace(/\^/g, '**')

        // Evaluate using cached function
        arr[i] = evaluateCachedExpression(safeExpr)
    }

    if (options.trackWarnings) {
        return { values: arr, warnings: Array.from(warnings) }
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
 * PREVSUM - Cumulative sum of all PRIOR periods (excludes current period)
 * PREVSUM([10, 20, 30]) returns [0, 10, 30]
 * At period i, returns sum(X[0..i-1]). Equivalent to CUMSUM(X) - X but
 * explicitly marks a cross-period-only dependency for cycle detection.
 * Excel equivalent: =SUM($B$2:B{n-1}) — sum of all prior columns
 * @param {number[]} innerArray - Array of values to sum
 * @param {number} periods - Number of periods
 * @returns {number[]} Previous cumulative sum array
 */
export function prevsum(innerArray, periods) {
    const result = new Array(periods).fill(0)
    let sum = 0

    for (let i = 0; i < periods; i++) {
        result[i] = sum       // Use accumulated sum BEFORE adding current period
        sum += innerArray[i]  // Then add current period for next iteration
    }

    return result
}

/**
 * PREVVAL - Value from one period ago (lag by 1)
 * PREVVAL([10, 20, 30]) returns [0, 10, 20]
 * At period i, returns X[i-1] (0 at period 0).
 * Excel equivalent: reference to prior column in same row
 * @param {number[]} innerArray - Array of values to lag
 * @param {number} periods - Number of periods
 * @returns {number[]} Lagged array
 */
export function prevval(innerArray, periods) {
    const result = new Array(periods).fill(0)
    for (let i = 1; i < periods; i++) {
        result[i] = innerArray[i - 1] ?? 0
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
 * MAXVAL - Maximum value across all periods (broadcast to every period)
 * MAXVAL([10, 50, 30]) returns [50, 50, 50]
 * Useful for getting the peak/final cumulative value as a constant across all periods.
 * @param {number[]} innerArray - Array of values
 * @param {number} periods - Number of periods
 * @returns {number[]} Array filled with the max value
 */
export function maxval(innerArray, periods) {
    let max = -Infinity
    for (let i = 0; i < periods; i++) {
        if (innerArray[i] > max) max = innerArray[i]
    }
    if (max === -Infinity) max = 0
    return new Array(periods).fill(max)
}

/**
 * FWDSUM - Forward-looking sum of next N periods
 * FWDSUM(innerArray, N) returns sum of values from [i, i+N-1] at each period i
 * @param {number[]} innerArray - Array of values to sum
 * @param {number} windowSize - Number of periods to look ahead (inclusive of current)
 * @param {number} periods - Total number of periods
 * @returns {number[]} Forward sum array
 */
export function fwdsum(innerArray, windowSize, periods) {
    const result = new Array(periods).fill(0)
    for (let i = 0; i < periods; i++) {
        let sum = 0
        const end = Math.min(i + windowSize, periods)
        for (let j = i; j < end; j++) {
            sum += innerArray[j] || 0
        }
        result[i] = sum
    }
    return result
}

/**
 * Resolve the window size argument for FWDSUM.
 * Can be a literal number or a reference (e.g., C1.54).
 */
function resolveFwdsumWindow(windowExpr, allRefs) {
    const trimmed = windowExpr.trim()
    const asNum = parseFloat(trimmed)
    if (!isNaN(asNum)) return Math.round(asNum)
    // Try to resolve as a reference
    const refValues = allRefs[trimmed]
    if (refValues) {
        const val = refValues.find(v => v !== 0) ?? refValues[0] ?? 6
        return Math.round(val)
    }
    return 6 // default fallback
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

    // MAXVAL(expr) - Maximum value across all periods (broadcast)
    const maxvalRegex = /MAXVAL\s*\(([^)]+)\)/gi
    while ((match = maxvalRegex.exec(processedFormula)) !== null) {
        const innerExpr = match[1]
        const innerArray = evalExprForAllPeriods(innerExpr, allRefs, timeline.periods)
        const resultArray = maxval(innerArray, timeline.periods)

        const placeholder = `__ARRAYFN${arrayFnCounter++}__`
        arrayFnResults[placeholder] = resultArray
        processedFormula = processedFormula.replace(match[0], placeholder)
        maxvalRegex.lastIndex = 0
    }

    // FWDSUM(expr, N) - Forward-looking sum of next N periods
    const fwdsumRegex = /FWDSUM\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi
    while ((match = fwdsumRegex.exec(processedFormula)) !== null) {
        const innerExpr = match[1]
        const windowExpr = match[2]
        const windowSize = resolveFwdsumWindow(windowExpr, allRefs)
        const innerArray = evalExprForAllPeriods(innerExpr, allRefs, timeline.periods)
        const resultArray = fwdsum(innerArray, windowSize, timeline.periods)

        const placeholder = `__ARRAYFN${arrayFnCounter++}__`
        arrayFnResults[placeholder] = resultArray
        processedFormula = processedFormula.replace(match[0], placeholder)
        fwdsumRegex.lastIndex = 0
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

    // PREVSUM(expr) - Cumulative sum of all prior periods (excludes current)
    const prevsumRegex = /PREVSUM\s*\(([^)]+)\)/gi
    while ((match = prevsumRegex.exec(processedFormula)) !== null) {
        const innerExpr = match[1]
        const innerArray = evalExprForAllPeriods(innerExpr, allRefs, timeline.periods)
        const resultArray = prevsum(innerArray, timeline.periods)

        const placeholder = `__ARRAYFN${arrayFnCounter++}__`
        arrayFnResults[placeholder] = resultArray
        processedFormula = processedFormula.replace(match[0], placeholder)
        prevsumRegex.lastIndex = 0
    }

    // PREVVAL(expr) - Value from one period ago (lag by 1)
    const prevvalRegex = /PREVVAL\s*\(([^)]+)\)/gi
    while ((match = prevvalRegex.exec(processedFormula)) !== null) {
        const innerExpr = match[1]
        const innerArray = evalExprForAllPeriods(innerExpr, allRefs, timeline.periods)
        const resultArray = prevval(innerArray, timeline.periods)

        const placeholder = `__ARRAYFN${arrayFnCounter++}__`
        arrayFnResults[placeholder] = resultArray
        processedFormula = processedFormula.replace(match[0], placeholder)
        prevvalRegex.lastIndex = 0
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
 * Extract R-refs that appear inside SHIFT() calls in a formula
 * Used to detect "soft cycles" where SHIFT creates a lagged dependency
 * @param {string} formula - The formula string
 * @returns {string[]} Array of R-ref strings (e.g., ["R84"])
 */
export function extractShiftTargets(formula) {
    if (!formula) return []
    const targets = new Set()
    // Match SHIFT(expr, n), PREVSUM(expr), and PREVVAL(expr)
    const lagRegex = /(?:SHIFT\s*\(\s*([^,]+)\s*,\s*\d+\s*\)|PREVSUM\s*\(([^)]+)\)|PREVVAL\s*\(([^)]+)\))/gi
    let match
    while ((match = lagRegex.exec(formula)) !== null) {
        const innerExpr = match[1] || match[2] || match[3]
        const rPattern = /\bR(\d+)(?!\d)/g
        let rMatch
        while ((rMatch = rPattern.exec(innerExpr)) !== null) {
            targets.add(`R${rMatch[1]}`)
        }
    }
    return [...targets]
}

/**
 * Evaluate a cluster of formulas period-by-period to resolve SHIFT-based cycles.
 *
 * When formulas form a cycle through SHIFT (e.g., Opening = SHIFT(Closing, 1),
 * Closing = Opening + Addition - Reduction), array-at-once evaluation fails because
 * the SHIFT target hasn't been computed yet. This function evaluates all cluster
 * formulas for period 0, then period 1, etc., so SHIFT(RX, n) can read RX[i-n].
 *
 * @param {Object[]} clusterCalcs - Array of calculation objects { id, formula }
 * @param {string[]} internalOrder - Node IDs in evaluation order (e.g., ["R81", "R80", "R82", "R84"])
 * @param {Object} context - Reference map with all external refs already resolved as arrays
 * @param {Object} timeline - Timeline object with .periods and .year
 * @returns {Object} Map of nodeId -> result array
 */
export function evaluateClusterPeriodByPeriod(clusterCalcs, internalOrder, context, timeline) {
    const periods = timeline.periods
    const calcMap = new Map()
    clusterCalcs.forEach(calc => calcMap.set(`R${calc.id}`, calc))

    // Pre-allocate result arrays and add them to context so SHIFT can read them
    const results = {}
    for (const nodeId of internalOrder) {
        results[nodeId] = new Array(periods).fill(0)
        context[nodeId] = results[nodeId]
    }

    // Pre-parse each formula: identify SHIFT calls, CUMSUM calls, and regular refs
    const parsedFormulas = new Map()

    for (const nodeId of internalOrder) {
        const calc = calcMap.get(nodeId)
        if (!calc || !calc.formula || !calc.formula.trim()) {
            parsedFormulas.set(nodeId, null)
            continue
        }

        const formula = calc.formula
        const parsed = {
            originalFormula: formula,
            shiftCalls: [],     // { placeholder, targetRef, offset, innerExpr }
            prevsumCalls: [],   // { placeholder, innerExpr, accumulator }
            prevvalCalls: [],   // { placeholder, innerExpr }
            cumsumCalls: [],    // { placeholder, innerExpr, accumulator }
            cumprodCalls: [],   // { placeholder, innerExpr, accumulator }
            countCalls: [],     // { placeholder, innerExpr, accumulator }
            maxvalCalls: [],    // { placeholder, innerExpr, resolvedValue }
            processedFormula: formula,
            refs: []            // { ref, regex }
        }

        let placeholderIdx = 0

        // Extract PREVSUM calls (must be before CUMSUM to avoid partial matches)
        let processedF = parsed.processedFormula
        let match
        const prevsumRegex = /PREVSUM\s*\(([^)]+)\)/gi
        while ((match = prevsumRegex.exec(processedF)) !== null) {
            const placeholder = `__CLPREVSUM${placeholderIdx++}__`
            parsed.prevsumCalls.push({
                placeholder,
                innerExpr: match[1].trim(),
                accumulator: 0,
                original: match[0]
            })
            processedF = processedF.replace(match[0], placeholder)
            prevsumRegex.lastIndex = 0
        }

        // Extract PREVVAL calls (must be before SHIFT)
        const prevvalRegex = /PREVVAL\s*\(([^)]+)\)/gi
        while ((match = prevvalRegex.exec(processedF)) !== null) {
            const placeholder = `__CLPREVVAL${placeholderIdx++}__`
            parsed.prevvalCalls.push({
                placeholder,
                innerExpr: match[1].trim(),
                original: match[0]
            })
            processedF = processedF.replace(match[0], placeholder)
            prevvalRegex.lastIndex = 0
        }

        // Extract SHIFT calls
        const shiftRegex = /SHIFT\s*\(\s*([^,]+)\s*,\s*(\d+)\s*\)/gi
        while ((match = shiftRegex.exec(processedF)) !== null) {
            const placeholder = `__CLSHIFT${placeholderIdx++}__`
            parsed.shiftCalls.push({
                placeholder,
                innerExpr: match[1].trim(),
                offset: parseInt(match[2]) || 1,
                original: match[0]
            })
            processedF = processedF.replace(match[0], placeholder)
            shiftRegex.lastIndex = 0
        }

        // Extract CUMSUM calls
        const cumsumRegex = /CUMSUM\s*\(([^)]+)\)/gi
        while ((match = cumsumRegex.exec(processedF)) !== null) {
            const placeholder = `__CLCUMSUM${placeholderIdx++}__`
            parsed.cumsumCalls.push({
                placeholder,
                innerExpr: match[1].trim(),
                accumulator: 0,
                original: match[0]
            })
            processedF = processedF.replace(match[0], placeholder)
            cumsumRegex.lastIndex = 0
        }

        // Extract CUMPROD calls
        const cumprodRegex = /CUMPROD\s*\(([^)]+)\)/gi
        while ((match = cumprodRegex.exec(processedF)) !== null) {
            const placeholder = `__CLCUMPROD${placeholderIdx++}__`
            parsed.cumprodCalls.push({
                placeholder,
                innerExpr: match[1].trim(),
                accumulator: 1,
                original: match[0]
            })
            processedF = processedF.replace(match[0], placeholder)
            cumprodRegex.lastIndex = 0
        }

        // Extract COUNT calls
        const countRegex = /COUNT\s*\(([^)]+)\)/gi
        while ((match = countRegex.exec(processedF)) !== null) {
            const placeholder = `__CLCOUNT${placeholderIdx++}__`
            parsed.countCalls.push({
                placeholder,
                innerExpr: match[1].trim(),
                accumulator: 0,
                original: match[0]
            })
            processedF = processedF.replace(match[0], placeholder)
            countRegex.lastIndex = 0
        }

        // Extract FWDSUM calls - resolved via full-array pre-computation
        const fwdsumRegex2 = /FWDSUM\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi
        while ((match = fwdsumRegex2.exec(processedF)) !== null) {
            const placeholder = `__CLFWDSUM${placeholderIdx++}__`
            parsed.fwdsumCalls = parsed.fwdsumCalls || []
            parsed.fwdsumCalls.push({
                placeholder,
                innerExpr: match[1].trim(),
                windowExpr: match[2].trim(),
                resolvedValues: null,
                original: match[0]
            })
            processedF = processedF.replace(match[0], placeholder)
            fwdsumRegex2.lastIndex = 0
        }

        // Extract MAXVAL calls - resolved via full-array pre-computation
        const maxvalRegex2 = /MAXVAL\s*\(([^)]+)\)/gi
        while ((match = maxvalRegex2.exec(processedF)) !== null) {
            const placeholder = `__CLMAXVAL${placeholderIdx++}__`
            parsed.maxvalCalls.push({
                placeholder,
                innerExpr: match[1].trim(),
                resolvedValue: null,
                original: match[0]
            })
            processedF = processedF.replace(match[0], placeholder)
            maxvalRegex2.lastIndex = 0
        }

        parsed.processedFormula = processedF

        // Collect all refs used in the processed formula (excluding placeholders)
        const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*(?:\.(?:Start|End|M|Q|Y))?|T\.[A-Za-z]+)\b/g
        const refs = [...new Set([...processedF.matchAll(refPattern)].map(m => m[1]))]
            .filter(ref => context[ref])
            .sort((a, b) => b.length - a.length)
        parsed.refs = refs.map(ref => ({
            ref,
            regex: getCachedRegex(ref)
        }))

        parsedFormulas.set(nodeId, parsed)
    }

    // Helper: evaluate a simple expression at period i, substituting refs from context
    function evalExprAtPeriod(expr, i) {
        // Sort context refs by length (longer first)
        const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*(?:\.(?:Start|End|M|Q|Y))?|T\.[A-Za-z]+)\b/g
        const exprRefs = [...new Set([...expr.matchAll(refPattern)].map(m => m[1]))]
            .filter(ref => context[ref])
            .sort((a, b) => b.length - a.length)

        let substituted = expr
        for (const ref of exprRefs) {
            const value = context[ref]?.[i] ?? 0
            const regex = getCachedRegex(ref)
            regex.lastIndex = 0
            substituted = substituted.replace(regex, value < 0 ? `(${value})` : value.toString())
        }

        // Replace any remaining unresolved R-references with 0
        substituted = substituted.replace(/\bR\d+\b/g, '0')

        return evaluateSafeExpression(substituted)
    }

    // Period-by-period evaluation
    for (let i = 0; i < periods; i++) {
        for (const nodeId of internalOrder) {
            const parsed = parsedFormulas.get(nodeId)
            if (!parsed) {
                results[nodeId][i] = 0
                continue
            }

            let expr = parsed.processedFormula

            // Resolve PREVSUM placeholders (accumulator holds sum of ALL prior periods)
            for (const ps of parsed.prevsumCalls) {
                // Use accumulator value BEFORE adding current period's value
                const accValue = ps.accumulator
                expr = expr.replace(ps.placeholder, accValue < 0 ? `(${accValue})` : accValue.toString())
                // After substitution, add current period's inner value to accumulator for next period
                // (deferred to after all formulas evaluated for this period — see below)
            }

            // Resolve PREVVAL placeholders (value from prior period)
            for (const pv of parsed.prevvalCalls) {
                let value = 0
                if (i > 0) {
                    value = evalExprAtPeriod(pv.innerExpr, i - 1)
                }
                expr = expr.replace(pv.placeholder, value < 0 ? `(${value})` : value.toString())
            }

            // Resolve SHIFT placeholders
            for (const sc of parsed.shiftCalls) {
                const srcPeriod = i - sc.offset
                let value = 0
                if (srcPeriod >= 0) {
                    // Evaluate the inner expression at the source period
                    value = evalExprAtPeriod(sc.innerExpr, srcPeriod)
                }
                expr = expr.replace(sc.placeholder, value < 0 ? `(${value})` : value.toString())
            }

            // Resolve CUMSUM placeholders
            for (const cs of parsed.cumsumCalls) {
                const innerVal = evalExprAtPeriod(cs.innerExpr, i)
                cs.accumulator += innerVal
                expr = expr.replace(cs.placeholder, cs.accumulator < 0 ? `(${cs.accumulator})` : cs.accumulator.toString())
            }

            // Resolve CUMPROD placeholders
            for (const cp of parsed.cumprodCalls) {
                const innerVal = evalExprAtPeriod(cp.innerExpr, i)
                cp.accumulator *= innerVal
                expr = expr.replace(cp.placeholder, cp.accumulator < 0 ? `(${cp.accumulator})` : cp.accumulator.toString())
            }

            // Resolve COUNT placeholders
            for (const ct of parsed.countCalls) {
                const innerVal = evalExprAtPeriod(ct.innerExpr, i)
                if (innerVal !== 0) ct.accumulator++
                expr = expr.replace(ct.placeholder, ct.accumulator.toString())
            }

            // Resolve MAXVAL placeholders (compute once on first encounter, cache the scalar)
            for (const mv of parsed.maxvalCalls) {
                if (mv.resolvedValue === null) {
                    // Evaluate inner expression for all periods to find max
                    let max = -Infinity
                    for (let p = 0; p < periods; p++) {
                        const val = evalExprAtPeriod(mv.innerExpr, p)
                        if (val > max) max = val
                    }
                    mv.resolvedValue = max === -Infinity ? 0 : max
                }
                const v = mv.resolvedValue
                expr = expr.replace(mv.placeholder, v < 0 ? `(${v})` : v.toString())
            }

            // Resolve FWDSUM placeholders (compute once, cache the array)
            if (parsed.fwdsumCalls) {
                for (const fw of parsed.fwdsumCalls) {
                    if (fw.resolvedValues === null) {
                        // Resolve window size
                        const windowSize = resolveFwdsumWindow(fw.windowExpr, context)
                        // Evaluate inner expression for all periods
                        const innerValues = new Array(periods).fill(0)
                        for (let p = 0; p < periods; p++) {
                            innerValues[p] = evalExprAtPeriod(fw.innerExpr, p)
                        }
                        fw.resolvedValues = fwdsum(innerValues, windowSize, periods)
                    }
                    const v = fw.resolvedValues[i]
                    expr = expr.replace(fw.placeholder, v < 0 ? `(${v})` : v.toString())
                }
            }

            // Substitute regular refs at period i
            for (const { ref, regex } of parsed.refs) {
                const value = context[ref]?.[i] ?? 0
                regex.lastIndex = 0
                expr = expr.replace(regex, value < 0 ? `(${value})` : value.toString())
            }

            // Replace any remaining unresolved R-references with 0
            expr = expr.replace(/\bR\d+\b/g, '0')

            // Evaluate the scalar expression
            const value = evaluateSafeExpression(expr)
            results[nodeId][i] = value
            // context[nodeId] already points to results[nodeId], so it's updated automatically
        }

        // AFTER all nodes evaluated for period i, update all PREVSUM accumulators
        // This ensures inner expressions reference fully-computed period i values
        for (const nodeId of internalOrder) {
            const parsed = parsedFormulas.get(nodeId)
            if (!parsed) continue
            for (const ps of parsed.prevsumCalls) {
                const innerVal = evalExprAtPeriod(ps.innerExpr, i)
                ps.accumulator += innerVal
            }
        }
    }

    return results
}

/**
 * Evaluate a single period's expression
 * @param {string} expr - Expression with references already substituted
 * @returns {number} Evaluated result
 */
export function evaluateSafeExpression(expr) {
    // Convert Excel-style functions to eval-safe functions
    let processedExpr = expr
        .replace(/\bIF\s*\(/gi, '_IF(')
        .replace(/\bAND\s*\(/gi, '_AND(')
        .replace(/\bOR\s*\(/gi, '_OR(')
        .replace(/\bNOT\s*\(/gi, '_NOT(')
        .replace(/\bROUND\s*\(/gi, '_ROUND(')
        .replace(/\bMIN\s*\(/gi, 'Math.min(')
        .replace(/\bMAX\s*\(/gi, 'Math.max(')
        .replace(/\bABS\s*\(/gi, 'Math.abs(')

    // Allow Math., _IF, comparison operators (>, <, =, !), logical operators (&, |), and modulo (%)
    let safeExpr = processedExpr.replace(/[^0-9+\-*/().e\s^Math.minaxbsfdoru_,<>=!&|%]/gi, '')
    safeExpr = safeExpr.replace(/\^/g, '**')

    // Use cached expression evaluation
    return evaluateCachedExpression(safeExpr)
}
