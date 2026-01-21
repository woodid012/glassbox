/**
 * Value Provider - Functional Generator for Input Values
 *
 * Instead of pre-calculating full arrays, this provides a logic function f(t)
 * that calculates values on-demand when a specific period is requested.
 *
 * Entry Modes:
 * - constant: Always returns input.value
 * - series: Returns value spread/repeated within date range
 * - values: Sparse lookup from input.values object
 */

import { evaluateSimpleFormula } from '@/utils/simpleFormulaEvaluator'

/**
 * Auto-detect whether an input should be treated as Flow or Stock based on its name
 * Flow (spread/divide when spreading): revenues, costs, volumes - things that accumulate over time
 * Stock (lookup/repeat when spreading): prices, rates, factors - point-in-time values
 *
 * @param {string} inputName - The name of the input
 * @returns {'flow' | 'stock'} - The detected type
 */
export function detectFlowOrStock(inputName) {
    if (!inputName) return 'flow' // default

    const name = inputName.toLowerCase()

    // Stock keywords - values that should be repeated (not divided)
    const stockKeywords = [
        'price', 'rate', 'factor', 'percent', 'ratio',
        'count', 'capacity', 'balance', 'index',
        'escalation', 'inflation', 'growth', 'yield', 'margin', 'fee'
    ]

    // Flow keywords - values that should be divided across periods
    const flowKeywords = [
        'revenue', 'cost', 'expense', 'capex', 'opex',
        'volume', 'production', 'generation', 'payment',
        'cash', 'income', 'profit', 'loss', 'spend', 'budget', 'amount', 'total'
    ]

    // Check stock keywords first (more specific)
    if (stockKeywords.some(k => name.includes(k))) return 'stock'

    // Then check flow keywords
    if (flowKeywords.some(k => name.includes(k))) return 'flow'

    // Default to flow (safer - dividing is usually what users expect for financial inputs)
    return 'flow'
}

/**
 * Calculate periods per value frequency based on timeline frequency
 *
 * @param {string} valueFrequency - 'Y' (annual), 'Q' (quarterly), or 'M' (monthly)
 * @param {string} timelineFrequency - 'monthly', 'quarterly', or 'annual'
 * @returns {number} - Number of timeline periods per value frequency period
 */
export function getPeriodsPerValueFrequency(valueFrequency, timelineFrequency) {
    if (timelineFrequency === 'monthly') {
        return valueFrequency === 'Y' ? 12 : valueFrequency === 'Q' ? 3 : 1
    } else if (timelineFrequency === 'quarterly') {
        return valueFrequency === 'Y' ? 4 : 1
    } else if (timelineFrequency === 'annual') {
        return 1
    }
    return 1
}

/**
 * Determine the spread method for an input
 *
 * @param {Object} input - The input definition
 * @param {boolean} isConstantMode - Whether the input is in constant mode
 * @returns {'lookup' | 'spread'} - The spread method
 */
export function determineSpreadMethod(input, isConstantMode = false) {
    if (input.spreadMethod) {
        return input.spreadMethod
    } else if (input.type === 'stock') {
        return 'lookup'
    } else if (input.type === 'flow') {
        return 'spread'
    } else if (isConstantMode) {
        return 'lookup'
    } else {
        const detected = detectFlowOrStock(input.name)
        return detected === 'stock' ? 'lookup' : 'spread'
    }
}

/**
 * Get the value of an InputGlass input at a specific period
 *
 * @param {Object} input - The input definition
 * @param {number} t - The period index (0-based)
 * @param {Object} context - { timeline, group }
 * @returns {number} The calculated value at period t
 */
export function getValueAtPeriod(input, t, context) {
    const { timeline, group } = context

    if (!group || t < 0 || t >= timeline.periods) {
        return 0
    }

    const periodYear = timeline.year[t]
    const periodMonth = timeline.month[t]
    const periodTotal = periodYear * 12 + periodMonth

    const startTotal = group.startYear * 12 + group.startMonth
    const endTotal = group.endYear * 12 + group.endMonth

    // Support both old and new property names for backwards compatibility
    // Check group's entryMode first, then fall back to input's mode
    const entryMode = group.entryMode || input.entryMode || input.mode || 'values'
    const isValuesMode = entryMode === 'values' || entryMode === 'schedule'
    const isSeriesMode = entryMode === 'series' || entryMode === 'single' || entryMode === 'uniform'
    const isConstantMode = entryMode === 'constant' || entryMode === 'constants'
    const isLookupMode = entryMode === 'lookup'
    const isLookup2Mode = entryMode === 'lookup2'

    const valueFrequency = input.valueFrequency || input.timePeriod || 'Y'
    const timelineFreq = timeline.frequency || 'monthly'
    const periodsPerValueFreq = getPeriodsPerValueFrequency(valueFrequency, timelineFreq)
    const spreadMethod = determineSpreadMethod(input, isConstantMode)

    // Find start index in timeline for values mode offset calculations
    let startIndex = 0
    for (let i = 0; i < timeline.periods; i++) {
        const iTotal = timeline.year[i] * 12 + timeline.month[i]
        if (iTotal >= startTotal) {
            startIndex = i
            break
        }
    }

    // 1. CONSTANT mode: single value for date range
    if (isConstantMode) {
        if (periodTotal < startTotal || periodTotal > endTotal) {
            return 0
        }
        return spreadMethod === 'lookup'
            ? (input.value || 0)
            : (input.value || 0) / periodsPerValueFreq
    }

    // 2. LOOKUP mode: direct monthly lookup with offset from custom lookup range
    if (isLookupMode && input.values && typeof input.values === 'object') {
        // Calculate offset from lookup start to model start
        const modelStartTotal = timeline.year[0] * 12 + timeline.month[0]
        const lookupStartYear = group.lookupStartYear ?? timeline.year[0]
        const lookupStartMonth = group.lookupStartMonth ?? timeline.month[0]
        const lookupStartTotal = lookupStartYear * 12 + lookupStartMonth
        const monthOffset = lookupStartTotal - modelStartTotal

        // Direct lookup at monthly index with offset
        const valueIndex = t + monthOffset
        const value = input.values[valueIndex] ?? input.values[String(valueIndex)]
        if (value !== undefined && !isNaN(parseFloat(value))) {
            return parseFloat(value)
        }
        return 0
    }

    // 3. LOOKUP2 mode: direct monthly lookup at model timeline (no offset)
    if (isLookup2Mode && input.values && typeof input.values === 'object') {
        // Direct lookup at monthly index (values stored at 0, 1, 2... from model start)
        const value = input.values[t] ?? input.values[String(t)]
        if (value !== undefined && !isNaN(parseFloat(value))) {
            return parseFloat(value)
        }
        return 0
    }

    // 4. SERIES mode: value at specific payment periods within date range
    if (isSeriesMode) {
        // Use series configuration fields
        const seriesFreq = input.seriesFrequency || 'M'
        const paymentMonth = parseInt(input.seriesPaymentMonth || '1') - 1  // 0-indexed
        const annualValue = input.seriesAnnualValue ?? input.value ?? 0

        // Calculate periods per year based on series frequency
        const seriesPeriodsPerYear = seriesFreq === 'Y' ? 1 : seriesFreq === 'Q' ? 4 : seriesFreq === 'FY' ? 1 : 12
        const periodValue = annualValue / seriesPeriodsPerYear

        // Get months per period for the series frequency
        const monthsPerSeriesPeriod = seriesFreq === 'Y' || seriesFreq === 'FY' ? 12 : seriesFreq === 'Q' ? 3 : 1

        // Get the series start/end dates (may override group start/end)
        let seriesStartTotal = startTotal
        let seriesEndTotal = endTotal

        if (input.seriesStartDate && input.seriesStartDate !== 'range') {
            const [y, m] = input.seriesStartDate.split('-').map(Number)
            seriesStartTotal = y * 12 + m
        }
        if (input.seriesEndDate && input.seriesEndDate !== 'range') {
            const [y, m] = input.seriesEndDate.split('-').map(Number)
            seriesEndTotal = y * 12 + m
        }

        // Check if outside series range
        if (periodTotal < seriesStartTotal || periodTotal > seriesEndTotal) {
            return 0
        }

        // For monthly, every month gets the value
        if (seriesFreq === 'M') {
            return periodValue
        }
        // For Annual/FY, payment month is the actual calendar month (1=Jan, 12=Dec)
        else if (seriesFreq === 'Y' || seriesFreq === 'FY') {
            if (periodMonth === paymentMonth + 1) {  // paymentMonth is 0-indexed, calendar month is 1-indexed
                return periodValue
            }
        }
        // For Quarterly, payment month is relative within quarter (0=1st, 1=2nd, 2=3rd month of quarter)
        else if (seriesFreq === 'Q') {
            const monthInQuarter = ((periodMonth - 1) % 3)  // 0, 1, or 2
            if (monthInQuarter === paymentMonth) {
                return periodValue
            }
        }

        return 0
    }

    // 5. VALUES mode: sparse lookup
    if (isValuesMode && input.values && typeof input.values === 'object') {
        // If valueFrequency matches timeline (periodsPerValueFreq === 1), direct lookup
        if (periodsPerValueFreq === 1) {
            const periodOffset = t - startIndex
            const value = input.values[periodOffset]
            if (value !== undefined && !isNaN(value)) {
                if (periodTotal >= startTotal && periodTotal <= endTotal) {
                    return value
                }
            }
            return 0
        } else {
            // Need to spread annual/quarterly values
            if (periodTotal < startTotal || periodTotal > endTotal) {
                return 0
            }

            // Find the value for this period's year/quarter
            let periodKey
            if (valueFrequency === 'Y') {
                periodKey = periodYear
            } else if (valueFrequency === 'Q') {
                const quarter = Math.floor((periodMonth - 1) / 3)
                periodKey = `${periodYear}-Q${quarter}`
            }

            // Search through values to find one matching this period
            let foundValue = undefined
            for (const [key, value] of Object.entries(input.values)) {
                const offset = parseInt(key)
                if (!isNaN(offset) && !isNaN(value)) {
                    const targetIndex = startIndex + offset
                    if (targetIndex >= 0 && targetIndex < timeline.periods) {
                        const valueYear = timeline.year[targetIndex]
                        const valueMonth = timeline.month[targetIndex]
                        let valueKey
                        if (valueFrequency === 'Y') {
                            valueKey = valueYear
                        } else if (valueFrequency === 'Q') {
                            const q = Math.floor((valueMonth - 1) / 3)
                            valueKey = `${valueYear}-Q${q}`
                        }
                        if (valueKey === periodKey && foundValue === undefined) {
                            foundValue = value
                            break
                        }
                    }
                }
            }

            if (foundValue !== undefined) {
                return spreadMethod === 'lookup'
                    ? foundValue
                    : foundValue / periodsPerValueFreq
            }
            return 0
        }
    }

    return 0
}

/**
 * Materialize an InputGlass input into a full array
 * Only call this when you actually need the full array
 *
 * @param {Object} input - The input definition
 * @param {Object} context - { timeline, group }
 * @returns {number[]} The materialized array
 */
export function materializeInput(input, context) {
    const { timeline } = context
    const arr = new Array(timeline.periods).fill(0)

    for (let t = 0; t < timeline.periods; t++) {
        arr[t] = getValueAtPeriod(input, t, context)
    }

    return arr
}

/**
 * Get values for a range of periods (more efficient than full materialization)
 *
 * @param {Object} input - The input definition
 * @param {number} startIndex - Start period index (inclusive)
 * @param {number} endIndex - End period index (inclusive)
 * @param {Object} context - { timeline, group }
 * @returns {number[]} Array of values for the range
 */
export function getValuesForRange(input, startIndex, endIndex, context) {
    const values = []
    for (let t = startIndex; t <= endIndex; t++) {
        values.push(getValueAtPeriod(input, t, context))
    }
    return values
}

/**
 * Create a value provider function for an input
 * Returns a function that can be called with period t to get the value
 *
 * @param {Object} input - The input definition
 * @param {Object} context - { timeline, group }
 * @returns {function(number): number} Value provider function
 */
export function createValueProvider(input, context) {
    return (t) => getValueAtPeriod(input, t, context)
}
