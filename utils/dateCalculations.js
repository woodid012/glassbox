/**
 * Period Calculation Utilities
 * Functions for period manipulation, calculations, and key period linking
 * Uses year/month integers instead of Date objects
 */

/**
 * Normalize period IDs: convert string numbers to numbers, keep special values as-is
 * @param {string|number|null} periodId - The period ID to normalize
 * @returns {string|number|null} Normalized period ID
 */
export function normalizePeriodId(periodId) {
    if (periodId === 'default' || periodId === 'default-all' || periodId === null || periodId === undefined) {
        return periodId
    }
    // Convert string numbers to numbers
    const numId = typeof periodId === 'string' ? parseInt(periodId, 10) : periodId
    return isNaN(numId) ? periodId : numId
}

/**
 * Add months to a year/month pair
 * @param {number} year - Start year
 * @param {number} month - Start month (1-12)
 * @param {number} monthsToAdd - Months to add (can be negative)
 * @returns {Object} { year, month }
 */
export function addMonths(year, month, monthsToAdd) {
    const totalMonths = year * 12 + (month - 1) + monthsToAdd
    return {
        year: Math.floor(totalMonths / 12),
        month: (totalMonths % 12) + 1
    }
}

/**
 * Calculate end year/month from start year/month and number of periods
 * @param {number} startYear - Start year
 * @param {number} startMonth - Start month (1-12)
 * @param {number} periods - Number of periods
 * @param {string} frequency - 'monthly', 'quarterly', or 'annual'
 * @returns {Object} { endYear, endMonth }
 */
export function calculateEndPeriod(startYear, startMonth, periods, frequency = 'monthly') {
    const monthsPerPeriod = frequency === 'annual' ? 12 : frequency === 'quarterly' ? 3 : 1
    const totalMonthsToAdd = (periods - 1) * monthsPerPeriod + (monthsPerPeriod - 1)

    return addMonths(startYear, startMonth, totalMonthsToAdd)
}

/**
 * Calculate number of periods between two year/month pairs
 * @param {number} startYear - Start year
 * @param {number} startMonth - Start month (1-12)
 * @param {number} endYear - End year
 * @param {number} endMonth - End month (1-12)
 * @param {string} frequency - 'monthly', 'quarterly', or 'annual'
 * @returns {number} Number of periods
 */
export function calculatePeriods(startYear, startMonth, endYear, endMonth, frequency = 'monthly') {
    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
    const monthsPerPeriod = frequency === 'annual' ? 12 : frequency === 'quarterly' ? 3 : 1
    return Math.ceil(totalMonths / monthsPerPeriod)
}

/**
 * Get the last day of a month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {number} Last day of the month (28-31)
 */
export function getLastDayOfMonth(year, month) {
    // Month in JavaScript Date is 0-indexed, so month is the next month
    // Day 0 gives us the last day of the previous month
    return new Date(year, month, 0).getDate()
}

/**
 * Get period range from a linked Key Period
 * @param {string|number|null} linkedKeyPeriodId - The linked period ID
 * @param {Array} keyPeriods - Array of key period objects
 * @param {Object} config - Config object with startYear, startMonth, endYear, endMonth
 * @returns {Object|null} Object with startYear, startMonth, endYear, endMonth, or null
 */
export function getKeyPeriodRange(linkedKeyPeriodId, keyPeriods, config) {
    if (!linkedKeyPeriodId) return null

    if (linkedKeyPeriodId === 'default') {
        return {
            startYear: config.startYear,
            startMonth: config.startMonth,
            endYear: config.endYear,
            endMonth: config.endMonth
        }
    }

    // Normalize the period ID before lookup (convert string numbers to numbers)
    const normalizedId = typeof linkedKeyPeriodId === 'string' && !isNaN(parseInt(linkedKeyPeriodId, 10))
        ? parseInt(linkedKeyPeriodId, 10)
        : linkedKeyPeriodId

    const keyPeriod = keyPeriods.find(p => p.id === normalizedId)
    if (!keyPeriod) return null

    return {
        startYear: keyPeriod.startYear,
        startMonth: keyPeriod.startMonth,
        endYear: keyPeriod.endYear,
        endMonth: keyPeriod.endMonth
    }
}

/**
 * Calculate linked start and end periods for ALL mode (both dates from linked period)
 * @param {string|number} linkedToPeriodId - The linked period ID
 * @param {Array} allPeriods - Array of all period objects
 * @param {Object} config - Config object with startYear, startMonth, endYear, endMonth
 * @returns {Object|null} Object with startYear, startMonth, endYear, endMonth, or null
 */
export function calculateLinkedAllPeriods(linkedToPeriodId, allPeriods, config) {
    if (!linkedToPeriodId) return null

    // Normalize the period ID before lookup
    const normalizedId = normalizePeriodId(linkedToPeriodId)

    // Find the linked period
    let linkedPeriod
    if (normalizedId === 'default') {
        // Link to default period (config start/end)
        linkedPeriod = {
            startYear: config.startYear,
            startMonth: config.startMonth,
            endYear: config.endYear,
            endMonth: config.endMonth
        }
    } else {
        linkedPeriod = allPeriods.find(p => p.id === normalizedId)
        if (!linkedPeriod) return null
    }

    if (linkedPeriod.startYear === undefined || linkedPeriod.endYear === undefined) return null

    return {
        startYear: linkedPeriod.startYear,
        startMonth: linkedPeriod.startMonth,
        endYear: linkedPeriod.endYear,
        endMonth: linkedPeriod.endMonth
    }
}

/**
 * Calculate linked start period from another period's start or end with offset
 * @param {string|number} linkedToPeriodId - The linked period ID
 * @param {Object} linkOffset - Offset object with value and unit (months only now)
 * @param {Array} allPeriods - Array of all period objects
 * @param {Object} config - Config object with startYear, startMonth, endYear, endMonth
 * @param {boolean} linkToStart - Whether to link to start (false = link to end)
 * @returns {Object|null} { startYear, startMonth } or null
 */
export function calculateLinkedStartPeriod(linkedToPeriodId, linkOffset, allPeriods, config, linkToStart = false) {
    if (!linkedToPeriodId) return null

    // Normalize the period ID before lookup
    const normalizedId = normalizePeriodId(linkedToPeriodId)

    // Find the linked period
    let linkedPeriod
    if (normalizedId === 'default') {
        // Link to default period (config start/end)
        linkedPeriod = {
            startYear: config.startYear,
            startMonth: config.startMonth,
            endYear: config.endYear,
            endMonth: config.endMonth
        }
    } else {
        linkedPeriod = allPeriods.find(p => p.id === normalizedId)
        if (!linkedPeriod) return null
    }

    // Use start or end based on linkToStart flag
    const refYear = linkToStart ? linkedPeriod.startYear : linkedPeriod.endYear
    const refMonth = linkToStart ? linkedPeriod.startMonth : linkedPeriod.endMonth
    if (refYear === undefined) return null

    const offset = linkOffset || { value: 0, unit: 'months' }

    // Convert offset to months (simplified: days -> 0 months, years -> 12 months each)
    let offsetMonths = 0
    if (offset.unit === 'months') {
        offsetMonths = offset.value
    } else if (offset.unit === 'years') {
        offsetMonths = offset.value * 12
    } else if (offset.unit === 'days') {
        // For days, convert to months (approximate: 30 days = 1 month)
        // But for typical use case of +1 day (next month), we add 1 month
        offsetMonths = offset.value > 0 ? Math.ceil(offset.value / 30) : Math.floor(offset.value / 30)
    }

    const result = addMonths(refYear, refMonth, offsetMonths)
    return {
        startYear: result.year,
        startMonth: result.month
    }
}

/**
 * Check for circular dependencies in period linking
 * @param {number} periodId - The period being modified
 * @param {string|number} linkedToPeriodId - The proposed linked period ID
 * @param {Array} allPeriods - Array of all period objects
 * @returns {boolean} True if circular dependency detected
 */
export function hasCircularDependency(periodId, linkedToPeriodId, allPeriods) {
    if (!linkedToPeriodId || linkedToPeriodId === 'default') return false

    // Normalize the linkedToPeriodId before checking
    const normalizedLinkedToPeriodId = normalizePeriodId(linkedToPeriodId)

    const visited = new Set()
    let current = normalizedLinkedToPeriodId

    while (current) {
        // Normalize current for comparison
        const normalizedCurrent = normalizePeriodId(current)
        if (normalizedCurrent === periodId) return true // Circular dependency detected
        if (visited.has(normalizedCurrent)) break // Already checked this path

        visited.add(normalizedCurrent)
        const period = allPeriods.find(p => p.id === normalizedCurrent)
        if (!period || !period.linkedToPeriodId) break
        current = normalizePeriodId(period.linkedToPeriodId)
    }

    return false
}

/**
 * Recalculate all periods that depend on a given period
 * @param {number|string} updatedPeriodId - The ID of the period that was updated
 * @param {Array} updatedPeriods - Array of period objects (using startYear/startMonth/endYear/endMonth)
 * @param {Object} config - Config object with startYear, startMonth, endYear, endMonth, minFrequency
 * @returns {Array} Updated periods array
 */
export function recalculateLinkedPeriods(updatedPeriodId, updatedPeriods, config) {
    const periods = [...updatedPeriods]
    let changed = true
    const affectedPeriodIds = new Set([updatedPeriodId])

    // Keep recalculating until no more changes (handles chains)
    while (changed) {
        changed = false
        periods.forEach(period => {
            // Recalculate if this period links to any affected period
            if (period.linkedToPeriodId &&
                (affectedPeriodIds.has(period.linkedToPeriodId) || period.linkedToPeriodId === 'default')) {

                // Handle ALL mode - link to both start and end
                if (period.linkToAll) {
                    const allPeriods = calculateLinkedAllPeriods(period.linkedToPeriodId, periods, config)
                    if (allPeriods && (
                        allPeriods.startYear !== period.startYear ||
                        allPeriods.startMonth !== period.startMonth ||
                        allPeriods.endYear !== period.endYear ||
                        allPeriods.endMonth !== period.endMonth
                    )) {
                        const calculatedPeriods = calculatePeriods(
                            allPeriods.startYear, allPeriods.startMonth,
                            allPeriods.endYear, allPeriods.endMonth,
                            config.minFrequency
                        )
                        period.startYear = allPeriods.startYear
                        period.startMonth = allPeriods.startMonth
                        period.endYear = allPeriods.endYear
                        period.endMonth = allPeriods.endMonth
                        period.periods = calculatedPeriods
                        affectedPeriodIds.add(period.id)
                        changed = true
                    }
                } else {
                    // Handle normal mode - link to start or end with offset
                    const calculatedStart = calculateLinkedStartPeriod(
                        period.linkedToPeriodId,
                        period.linkOffset,
                        periods,
                        config,
                        period.linkToStart !== undefined ? period.linkToStart : false
                    )

                    if (calculatedStart && (
                        calculatedStart.startYear !== period.startYear ||
                        calculatedStart.startMonth !== period.startMonth
                    )) {
                        const endPeriod = calculateEndPeriod(
                            calculatedStart.startYear,
                            calculatedStart.startMonth,
                            period.periods || 1,
                            config.minFrequency
                        )
                        period.startYear = calculatedStart.startYear
                        period.startMonth = calculatedStart.startMonth
                        period.endYear = endPeriod.year
                        period.endMonth = endPeriod.month
                        affectedPeriodIds.add(period.id)
                        changed = true
                    }
                }
            }
        })
    }

    return periods
}
