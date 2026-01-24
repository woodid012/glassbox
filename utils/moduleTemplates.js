// Preset Modules for Financial Modeling
// Each module takes inputs and generates multiple output time series

/**
 * Module Template Structure:
 * {
 *   type: 'iterative_debt_sizing',
 *   name: 'Iterative Debt Sizing (DSCR Sculpted)',
 *   description: 'Binary search to find optimal debt with DSCR-sculpted repayments',
 *   inputs: [
 *     { key: 'cfadsRef', label: 'CFADS Reference', type: 'reference', refType: 'any', required: true },
 *     ...
 *   ],
 *   outputs: [
 *     { key: 'sized_debt', label: 'Sized Debt Amount', type: 'stock' },
 *     ...
 *   ]
 * }
 */

export const MODULE_TEMPLATES = {
    iterative_debt_sizing: {
        type: 'iterative_debt_sizing',
        name: 'Iterative Debt Sizing (DSCR Sculpted)',
        description: 'Binary search to find optimal debt with DSCR-sculpted repayments',
        inputs: [
            // Cash flow source
            { key: 'cfadsRef', label: 'CFADS Reference', type: 'reference', refType: 'any', required: true },
            // Debt service period flag (when debt service starts - e.g., end of construction)
            { key: 'debtFlagRef', label: 'Debt Service Flag', type: 'reference', refType: 'flag', required: true },
            // Debt parameters
            { key: 'totalCapex', label: 'Total Capex ($M)', type: 'number', required: true },
            { key: 'maxGearingPct', label: 'Max Gearing (%)', type: 'percentage', required: true, default: 65 },
            { key: 'interestRatePct', label: 'Interest Rate (%)', type: 'percentage', required: true, default: 5 },
            { key: 'tenorYears', label: 'Debt Tenor (years)', type: 'number', required: true, default: 18 },
            // DSCR target
            { key: 'targetDSCR', label: 'Target DSCR', type: 'number', required: true, default: 1.4 },
            // Debt service period (M=Monthly, Q=Quarterly, Y=Yearly)
            { key: 'debtPeriod', label: 'Debt Service Period', type: 'select', options: [
                { value: 'M', label: 'Monthly' },
                { value: 'Q', label: 'Quarterly' },
                { value: 'Y', label: 'Yearly' }
            ], required: true, default: 'Q' },
            // IDC from construction (optional)
            { key: 'idcRef', label: 'IDC Reference (optional)', type: 'reference', refType: 'any', required: false },
            // Iteration control
            { key: 'tolerance', label: 'Tolerance ($M)', type: 'number', required: false, default: 0.1 },
            { key: 'maxIterations', label: 'Max Iterations', type: 'number', required: false, default: 50 }
        ],
        outputs: [
            { key: 'sized_debt', label: 'Sized Debt Amount', type: 'stock' },
            { key: 'opening_balance', label: 'Opening Balance', type: 'stock' },
            { key: 'interest_payment', label: 'Interest Payment', type: 'flow' },
            { key: 'principal_payment', label: 'Principal Payment', type: 'flow' },
            { key: 'debt_service', label: 'Total Debt Service', type: 'flow' },
            { key: 'closing_balance', label: 'Closing Balance', type: 'stock' },
            { key: 'period_dscr', label: 'Period DSCR', type: 'stock' },
            { key: 'cumulative_principal', label: 'Cumulative Principal', type: 'stock' }
        ]
    }
}

// Calculate module outputs
export function calculateModuleOutputs(moduleInstance, arrayLength, context) {
    const template = MODULE_TEMPLATES[moduleInstance.moduleType]
    if (!template) return {}

    const inputs = moduleInstance.inputs || {}
    const outputs = {}

    // Initialize output arrays
    template.outputs.forEach(output => {
        outputs[output.key] = new Array(arrayLength).fill(0)
    })

    switch (moduleInstance.moduleType) {
        case 'iterative_debt_sizing':
            return calculateIterativeDebtSizing(inputs, arrayLength, context)
        default:
            return outputs
    }
}

/**
 * Check if a month index is a period end for the given frequency.
 * @param {number} monthIdx - 0-based month index from model start
 * @param {string} debtPeriod - 'M', 'Q', or 'Y'
 * @param {object} timeline - Timeline object with month array
 * @returns {boolean}
 */
function isPeriodEnd(monthIdx, debtPeriod, timeline) {
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
function getMonthsPerPeriod(debtPeriod) {
    if (debtPeriod === 'Q') return 3
    if (debtPeriod === 'Y') return 12
    return 1 // Monthly
}

/**
 * Generate a DSCR-sculpted debt schedule for a given debt amount.
 * Supports Monthly, Quarterly, or Yearly debt service periods.
 * Returns schedule arrays and viability flags.
 */
function generateDSCRSchedule(totalDebt, cfads, start, end, monthlyRate, targetDSCR, len, debtPeriod, timeline) {
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

/**
 * Create empty outputs for iterative debt sizing (when no viable debt found)
 */
function emptyDebtSizingOutputs(arrayLength) {
    return {
        sized_debt: new Array(arrayLength).fill(0),
        opening_balance: new Array(arrayLength).fill(0),
        interest_payment: new Array(arrayLength).fill(0),
        principal_payment: new Array(arrayLength).fill(0),
        debt_service: new Array(arrayLength).fill(0),
        closing_balance: new Array(arrayLength).fill(0),
        period_dscr: new Array(arrayLength).fill(0),
        cumulative_principal: new Array(arrayLength).fill(0)
    }
}

/**
 * Iterative Debt Sizing with DSCR-sculpted repayments.
 * Uses binary search to find the maximum viable debt amount.
 * Supports Monthly, Quarterly, or Yearly debt service periods.
 * Debt service period determined by flag (e.g., operations flag, post-construction flag).
 */
function calculateIterativeDebtSizing(inputs, arrayLength, context) {
    const {
        cfadsRef = null,
        debtFlagRef = null,
        totalCapex = 0,
        maxGearingPct = 65,
        interestRatePct = 5,
        tenorYears = 18,
        targetDSCR = 1.4,
        debtPeriod = 'Q', // M = Monthly, Q = Quarterly, Y = Yearly
        idcRef = null,
        tolerance = 0.1,
        maxIterations = 50
    } = inputs

    // Get timeline from context (for determining period ends)
    const timeline = context.timeline || null

    // Get CFADS array from context
    const cfadsArray = cfadsRef && context[cfadsRef]
        ? context[cfadsRef]
        : new Array(arrayLength).fill(0)

    // Get debt service flag array
    const debtFlag = debtFlagRef && context[debtFlagRef]
        ? context[debtFlagRef]
        : new Array(arrayLength).fill(0)

    // Get IDC array if provided
    const idcArray = idcRef && context[idcRef] ? context[idcRef] : null

    // Find debt period bounds from flag (flag = 1 means debt service is active)
    const debtStart = debtFlag.findIndex(f => f === 1 || f === true)
    if (debtStart < 0) {
        // No debt service period found
        return emptyDebtSizingOutputs(arrayLength)
    }

    // Find last period where flag is active
    let debtFlagEnd = debtStart
    for (let i = debtFlag.length - 1; i >= debtStart; i--) {
        if (debtFlag[i] === 1 || debtFlag[i] === true) {
            debtFlagEnd = i
            break
        }
    }
    const tenorMonths = tenorYears * 12
    const debtEnd = Math.min(debtStart + tenorMonths - 1, debtFlagEnd, arrayLength - 1)

    // Get IDC (from reference at period before debt start, or 0)
    const idc = idcArray && debtStart > 0 ? (idcArray[debtStart - 1] || 0) : 0

    // Monthly interest rate
    const monthlyRate = interestRatePct / 100 / 12

    // Binary search for optimal debt
    let lowerBound = 0
    let upperBound = totalCapex * (maxGearingPct / 100)
    let bestDebt = 0
    let bestSchedule = null

    for (let iter = 0; iter < maxIterations; iter++) {
        if (upperBound - lowerBound <= tolerance) break

        const testDebt = (lowerBound + upperBound) / 2
        const totalDebt = testDebt + idc

        // Generate DSCR-sculpted schedule
        const schedule = generateDSCRSchedule(
            totalDebt,
            cfadsArray,
            debtStart,
            debtEnd,
            monthlyRate,
            targetDSCR,
            arrayLength,
            debtPeriod,
            timeline
        )

        // Check viability
        const isViable = schedule.fullyRepaid &&
                        !schedule.dscrBreached &&
                        !schedule.hasNegativePrincipal

        if (isViable) {
            lowerBound = testDebt
            bestDebt = testDebt
            bestSchedule = schedule
        } else {
            upperBound = testDebt
        }
    }

    // Return output arrays from best schedule
    if (bestSchedule) {
        // Update sized_debt to show the base debt (excluding IDC)
        bestSchedule.sized_debt.fill(bestDebt)
        return {
            sized_debt: bestSchedule.sized_debt,
            opening_balance: bestSchedule.opening_balance,
            interest_payment: bestSchedule.interest_payment,
            principal_payment: bestSchedule.principal_payment,
            debt_service: bestSchedule.debt_service,
            closing_balance: bestSchedule.closing_balance,
            period_dscr: bestSchedule.period_dscr,
            cumulative_principal: bestSchedule.cumulative_principal
        }
    }

    return emptyDebtSizingOutputs(arrayLength)
}

// Get available module output references for a module instance
// Uses numeric indices: M1.1, M1.2, etc.
export function getModuleOutputRefs(moduleInstance) {
    const template = MODULE_TEMPLATES[moduleInstance.moduleType]
    if (!template) return []

    return template.outputs.map((output, index) => ({
        ref: `M${moduleInstance.id}.${index + 1}`,
        key: output.key,
        label: `${moduleInstance.name}: ${output.label}`,
        type: output.type
    }))
}

// Get output key from numeric index for a module type
export function getOutputKeyByIndex(moduleType, index) {
    const template = MODULE_TEMPLATES[moduleType]
    if (!template || index < 1 || index > template.outputs.length) return null
    return template.outputs[index - 1].key
}

// Get output index from key for a module type
export function getOutputIndexByKey(moduleType, key) {
    const template = MODULE_TEMPLATES[moduleType]
    if (!template) return null
    const index = template.outputs.findIndex(o => o.key === key)
    return index >= 0 ? index + 1 : null
}
