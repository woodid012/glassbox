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
        hasNegativePrincipal: false,
        paysOffEarly: false,
        payoffPeriodIdx: null
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

            // Max principal allowed by DSCR constraint
            const maxPrincipalFromCapacity = Math.max(0, maxDebtService - interest)

            let principal
            if (i === end) {
                // Final period: pay off remaining balance
                principal = balance
            } else if (balance <= 0) {
                principal = 0
            } else {
                // Minimum principal to amortize over remaining tenor (level principal floor)
                const minPrincipalForTenor = remainingPeriods > 0 ? balance / remainingPeriods : balance

                if (maxPrincipalFromCapacity < minPrincipalForTenor) {
                    // DSCR doesn't allow minimum amortization — debt is too large
                    // Pay what we can (binary search will reject this as non-viable)
                    principal = maxPrincipalFromCapacity
                } else if (remainingPeriods > 1) {
                    // Cap payment to ensure debt amortizes over full tenor, not early
                    // Leave enough balance for at least min payments in remaining periods
                    const minRequiredBalance = minPrincipalForTenor * (remainingPeriods - 1)
                    const maxAllowedPayment = Math.max(0, balance - minRequiredBalance)
                    // Use DSCR-allowed amount but cap to prevent early payoff
                    principal = Math.max(minPrincipalForTenor, Math.min(maxPrincipalFromCapacity, maxAllowedPayment))
                } else {
                    // Last or second-to-last period — allow paying off
                    principal = Math.min(maxPrincipalFromCapacity, balance)
                }
            }

            principal = Math.min(principal, balance)
            if (principal < 0) hasNegativePrincipal = true

            // Check if debt won't fully repay within tenor at this rate
            if (!dscrBreached && i < end && balance > 0) {
                const minPrincipalForTenor = remainingPeriods > 0 ? balance / remainingPeriods : balance
                if (principal < minPrincipalForTenor * 0.5) {
                    dscrBreached = true
                }
            }

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

    // Detect early payoff: find the period where balance first reaches zero
    if (outputs.fullyRepaid) {
        // Count total payment periods and find payoff period
        let totalPaymentPeriods = 0
        let payoffPeriodCount = null
        let periodCount = 0
        for (let i = start; i <= end && i < len; i++) {
            if (isPeriodEnd(i, debtPeriod, timeline) || i === end) {
                periodCount++
                totalPaymentPeriods++
                if (payoffPeriodCount === null && outputs.closing_balance[i] < 0.001) {
                    payoffPeriodCount = periodCount
                    outputs.payoffPeriodIdx = i
                }
            }
        }
        // Early payoff = balance hits zero more than 2 periods before end
        const periodsFromEnd = totalPaymentPeriods - (payoffPeriodCount || totalPaymentPeriods)
        outputs.paysOffEarly = periodsFromEnd > 2
    }

    return outputs
}

