// Shared helpers for module calculations

/**
 * Universal input resolver for module calculations.
 * Converts any input (number, string, or reference) to a numeric value.
 * Use this for ALL numeric module inputs to ensure refs like "C1.21" work.
 *
 * @param {any} value - The input value (number, string number, or reference)
 * @param {Object} context - The reference map containing resolved arrays
 * @param {number} defaultVal - Fallback value if resolution fails
 * @returns {number} The resolved numeric value
 */
export function resolveModuleInput(value, context, defaultVal = 0) {
    // Already a number - use directly
    if (typeof value === 'number') return value

    if (typeof value === 'string') {
        // Check if it's a reference (C1.X, R123, etc.) in context
        if (context && context[value]) {
            const arr = context[value]
            // Get first non-zero value (constants are same across periods)
            return arr.find(v => v !== 0) || arr[0] || defaultVal
        }
        // Try parsing as a number string ("5" -> 5)
        const parsed = parseFloat(value)
        return isNaN(parsed) ? defaultVal : parsed
    }

    return defaultVal
}

/**
 * Resolves a module input to a full array (for time-series inputs like interest rates).
 * If the input is a number, returns an array filled with that value.
 * If the input is a reference, returns the referenced array.
 *
 * @param {any} value - The input value (number, string number, or reference)
 * @param {Object} context - The reference map containing resolved arrays
 * @param {number} arrayLength - The expected length of the output array
 * @param {number} defaultVal - Fallback value if resolution fails
 * @returns {number[]} The resolved array of values
 */
export function resolveModuleInputArray(value, context, arrayLength, defaultVal = 0) {
    // If it's a reference string and exists in context, return the array
    if (typeof value === 'string' && context && context[value]) {
        return context[value]
    }

    // If it's a number or can be parsed as one, return a filled array
    const numValue = typeof value === 'number' ? value : parseFloat(value)
    if (!isNaN(numValue)) {
        return new Array(arrayLength).fill(numValue)
    }

    // Default: return array filled with default value
    return new Array(arrayLength).fill(defaultVal)
}

/**
 * Check if a month index is a period end for the given frequency.
 * @param {number} monthIdx - 0-based month index from model start
 * @param {string} debtPeriod - 'M', 'Q', or 'Y'
 * @param {object} timeline - Timeline object with month array
 * @returns {boolean}
 */
export function isPeriodEnd(monthIdx, debtPeriod, timeline) {
    if (debtPeriod === 'M') return true // Every month is a period end

    const month = timeline?.month?.[monthIdx] || ((monthIdx % 12) + 1)

    if (debtPeriod === 'Q') {
        return month === 3 || month === 6 || month === 9 || month === 12
    }
    if (debtPeriod === 'Y') {
        return month === 12
    }
    return true
}

/**
 * Get number of months per debt service period.
 */
export function getMonthsPerPeriod(debtPeriod) {
    if (debtPeriod === 'Q') return 3
    if (debtPeriod === 'Y') return 12
    return 1 // Monthly
}

/**
 * Generate a capacity-sculpted debt schedule using pre-calculated debt service capacity.
 * Capacity = (Contracted CFADS / Contracted DSCR) + (Merchant CFADS / Merchant DSCR)
 * This allows different DSCR targets for different revenue streams.
 *
 * @param {number} totalDebt - The debt amount to test
 * @param {Array} debtServiceCapacity - Pre-calculated max debt service per period
 * @param {Array} totalCfads - Total CFADS (for DSCR reporting)
 * @param {number} start - Debt start period index
 * @param {number} end - Debt end period index
 * @param {Array<number>} interestRateArray - Interest rate (%) for each period (time-series)
 * @param {number} len - Array length
 * @param {string} debtPeriod - 'M', 'Q', or 'Y'
 * @param {Object} timeline - Timeline context for period end detection
 */
export function generateCapacitySchedule(totalDebt, debtServiceCapacity, totalCfads, start, end, interestRateArray, len, debtPeriod, timeline) {
    const outputs = {
        sized_debt: new Array(len).fill(0),
        opening_balance: new Array(len).fill(0),
        interest_payment: new Array(len).fill(0),
        principal_payment: new Array(len).fill(0),
        debt_service: new Array(len).fill(0),
        closing_balance: new Array(len).fill(0),
        period_dscr: new Array(len).fill(0),
        cumulative_principal: new Array(len).fill(0),
        fullyRepaid: false,
        dscrBreached: false,
        hasNegativePrincipal: false
    }

    if (totalDebt <= 0 || start < 0 || end < start) {
        return outputs
    }

    // Set sized debt as constant for all periods (for reporting)
    outputs.sized_debt.fill(totalDebt)

    let balance = totalDebt
    let dscrBreached = false
    let hasNegativePrincipal = false
    let cumulativePrincipal = 0

    // Track accrued values within a debt service period
    let accruedInterest = 0
    let accruedCapacity = 0
    let accruedCfads = 0

    for (let i = start; i <= end && i < len; i++) {
        outputs.opening_balance[i] = balance

        // Accrue interest monthly (on opening balance of each month)
        // Use period-specific rate from time-series array
        const monthlyRate = (interestRateArray[i] || 0) / 100 / 12
        const monthlyInterest = balance * monthlyRate
        accruedInterest += monthlyInterest

        // Accrue debt service capacity and CFADS
        accruedCapacity += debtServiceCapacity[i] || 0
        accruedCfads += totalCfads[i] || 0

        // Check if this is a payment period end
        const isPaymentPeriod = isPeriodEnd(i, debtPeriod, timeline) || i === end

        if (isPaymentPeriod) {
            // Calculate remaining debt service periods
            let remainingPeriods = 0
            for (let j = i; j <= end; j++) {
                if (isPeriodEnd(j, debtPeriod, timeline) || j === end) {
                    remainingPeriods++
                }
            }

            // Interest payment = accrued interest for this period
            const interest = accruedInterest
            outputs.interest_payment[i] = interest

            // Max debt service from capacity constraint (already DSCR-adjusted)
            const maxDebtService = accruedCapacity

            // Minimum principal to fully repay within tenor
            const minPrincipalForTenor = remainingPeriods > 0 ? balance / remainingPeriods : balance
            const maxPrincipalFromCapacity = Math.max(0, maxDebtService - interest)

            let principal
            if (i === end) {
                // Final period: pay off remaining balance
                principal = balance
            } else if (maxPrincipalFromCapacity >= minPrincipalForTenor) {
                // Capacity allows adequate principal - use minimum to stretch debt to full tenor
                principal = minPrincipalForTenor
            } else {
                // Capacity constraint limits principal - pay what DSCR allows
                principal = maxPrincipalFromCapacity
                if (principal < minPrincipalForTenor * 0.9) {
                    dscrBreached = true // Can't meet amortization schedule within tenor
                }
            }

            principal = Math.min(principal, balance)
            if (principal < 0) hasNegativePrincipal = true

            outputs.principal_payment[i] = principal
            outputs.debt_service[i] = interest + principal

            // Blended DSCR for this period = Total CFADS / Debt Service
            outputs.period_dscr[i] = outputs.debt_service[i] > 0
                ? accruedCfads / outputs.debt_service[i]
                : 0

            // Update balance
            balance -= principal
            cumulativePrincipal += principal

            // Reset accumulators for next period
            accruedInterest = 0
            accruedCapacity = 0
            accruedCfads = 0
        }

        outputs.closing_balance[i] = Math.max(0, balance)
        outputs.cumulative_principal[i] = cumulativePrincipal
    }

    // Carry forward cumulative principal after debt ends
    for (let i = end + 1; i < len; i++) {
        outputs.cumulative_principal[i] = cumulativePrincipal
    }

    outputs.fullyRepaid = balance < 0.001
    outputs.dscrBreached = dscrBreached
    outputs.hasNegativePrincipal = hasNegativePrincipal

    return outputs
}

/**
 * Generate a DSCR-sculpted debt schedule for a given debt amount.
 * Supports Monthly, Quarterly, or Yearly debt service periods.
 * Returns schedule arrays and viability flags.
 * @deprecated Use generateCapacitySchedule for new implementations
 */
export function generateDSCRSchedule(totalDebt, cfads, start, end, monthlyRate, targetDSCR, len, debtPeriod, timeline) {
    const outputs = {
        sized_debt: new Array(len).fill(0),
        opening_balance: new Array(len).fill(0),
        interest_payment: new Array(len).fill(0),
        principal_payment: new Array(len).fill(0),
        debt_service: new Array(len).fill(0),
        closing_balance: new Array(len).fill(0),
        period_dscr: new Array(len).fill(0),
        cumulative_principal: new Array(len).fill(0),
        fullyRepaid: false,
        dscrBreached: false,
        hasNegativePrincipal: false
    }

    if (totalDebt <= 0 || start < 0 || end < start) {
        return outputs
    }

    // Set sized debt as constant for all periods (for reporting)
    outputs.sized_debt.fill(totalDebt)

    const monthsPerPeriod = getMonthsPerPeriod(debtPeriod)
    let balance = totalDebt
    let dscrBreached = false
    let hasNegativePrincipal = false
    let cumulativePrincipal = 0

    // Track accrued values within a debt service period
    let accruedInterest = 0
    let accruedCfads = 0
    let periodStartBalance = balance

    for (let i = start; i <= end && i < len; i++) {
        outputs.opening_balance[i] = balance

        // Accrue interest monthly (on opening balance of each month)
        const monthlyInterest = balance * monthlyRate
        accruedInterest += monthlyInterest

        // Accrue CFADS
        accruedCfads += cfads[i] || 0

        // Check if this is a payment period end
        const isPaymentPeriod = isPeriodEnd(i, debtPeriod, timeline) || i === end

        if (isPaymentPeriod) {
            // Calculate remaining debt service periods
            let remainingPeriods = 0
            for (let j = i; j <= end; j++) {
                if (isPeriodEnd(j, debtPeriod, timeline) || j === end) {
                    remainingPeriods++
                }
            }

            // Interest payment = accrued interest for this period
            const interest = accruedInterest
            outputs.interest_payment[i] = interest

            // Max debt service from DSCR constraint (using accrued CFADS)
            const maxDebtService = targetDSCR > 0 ? accruedCfads / targetDSCR : 0

            // Minimum principal to fully repay within tenor
            const minPrincipalForTenor = remainingPeriods > 0 ? balance / remainingPeriods : balance
            const maxPrincipalFromDSCR = Math.max(0, maxDebtService - interest)

            let principal
            if (i === end) {
                // Final period: pay off remaining balance
                principal = balance
            } else if (maxPrincipalFromDSCR >= minPrincipalForTenor) {
                // DSCR allows adequate principal payment
                principal = maxPrincipalFromDSCR
            } else {
                // DSCR constraint limits principal
                principal = maxPrincipalFromDSCR
                if (principal < minPrincipalForTenor * 0.9) {
                    dscrBreached = true // Can't meet amortization schedule
                }
            }

            principal = Math.min(principal, balance)
            if (principal < 0) hasNegativePrincipal = true

            outputs.principal_payment[i] = principal
            outputs.debt_service[i] = interest + principal

            // DSCR for this period (using accrued CFADS and total debt service)
            outputs.period_dscr[i] = outputs.debt_service[i] > 0
                ? accruedCfads / outputs.debt_service[i]
                : 0

            // Update balance
            balance -= principal
            cumulativePrincipal += principal

            // Reset accumulators for next period
            accruedInterest = 0
            accruedCfads = 0
            periodStartBalance = balance
        }

        outputs.closing_balance[i] = Math.max(0, balance)
        outputs.cumulative_principal[i] = cumulativePrincipal
    }

    // Carry forward cumulative principal after debt ends
    for (let i = end + 1; i < len; i++) {
        outputs.cumulative_principal[i] = cumulativePrincipal
    }

    outputs.fullyRepaid = balance < 0.001
    outputs.dscrBreached = dscrBreached
    outputs.hasNegativePrincipal = hasNegativePrincipal

    return outputs
}
