// Iterative Debt Sizing Module
import { resolveModuleInput, resolveModuleInputArray, generateCapacitySchedule } from './shared'

export const TEMPLATE = {
    type: 'iterative_debt_sizing',
    name: 'Iterative Debt Sizing (DSCR Sculpted)',
    description: 'Binary search to find optimal debt with DSCR-sculpted repayments',
    inputs: [
        // Contracted revenue CFADS and DSCR
        { key: 'contractedCfadsRef', label: 'Contracted CFADS', type: 'reference', refType: 'any', required: false },
        { key: 'contractedDSCR', label: 'Contracted DSCR', type: 'number_or_ref', required: false, default: 1.35 },
        // Merchant revenue CFADS and DSCR
        { key: 'merchantCfadsRef', label: 'Merchant CFADS', type: 'reference', refType: 'any', required: false },
        { key: 'merchantDSCR', label: 'Merchant DSCR', type: 'number_or_ref', required: false, default: 1.50 },
        // Debt service period flag (when debt service starts - e.g., end of construction)
        { key: 'debtFlagRef', label: 'Debt Service Flag', type: 'reference', refType: 'flag', required: true, default: 'F8' },
        // Total funding requirement (reference to cumulative calculation)
        { key: 'totalFundingRef', label: 'Total Funding Requirement', type: 'reference', refType: 'any', required: true, default: 'R64' },
        { key: 'maxGearingPct', label: 'Max Gearing (%)', type: 'percentage', required: true, default: 65 },
        { key: 'interestRatePct', label: 'Interest Rate (%)', type: 'percentage', required: true, default: 5 },
        { key: 'tenorYears', label: 'Debt Tenor (years)', type: 'number', required: true, default: 18 },
        // Debt service period (M=Monthly, Q=Quarterly, Y=Yearly)
        { key: 'debtPeriod', label: 'Debt Service Period', type: 'select', options: [
            { value: 'M', label: 'Monthly' },
            { value: 'Q', label: 'Quarterly' },
            { value: 'Y', label: 'Yearly' }
        ], required: true, default: 'Q' },
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
    ],
    outputFormulas: {
        sized_debt: 'BinarySearch(MaxDebt where DebtService ≤ DSCapacity for all periods)\n  where DSCapacity = {contractedCfadsRef}/{contractedDSCR} + {merchantCfadsRef}/{merchantDSCR}\n  subject to: Debt ≤ {totalFundingRef} × {maxGearingPct}/100',
        opening_balance: 'SHIFT(closing_balance, 1) + sized_debt × {debtFlagRef}.Start',
        interest_payment: 'opening_balance × {interestRatePct}/100 / T.MiY × {debtFlagRef}',
        principal_payment: 'MIN(DSCapacity - interest_payment, opening_balance / remaining_periods) × {debtFlagRef}',
        debt_service: 'interest_payment + principal_payment',
        closing_balance: 'opening_balance - principal_payment',
        period_dscr: '({contractedCfadsRef} + {merchantCfadsRef}) / debt_service',
        cumulative_principal: 'CUMSUM(principal_payment)'
    }
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
export function calculate(inputs, arrayLength, context) {
    const {
        // New: separate contracted and merchant CFADS with different DSCRs
        contractedCfadsRef = null,
        contractedDSCR = 1.35,
        merchantCfadsRef = null,
        merchantDSCR = 1.50,
        // Legacy: single CFADS with single DSCR (backward compatibility)
        cfadsRef = null,
        targetDSCR = 1.4,
        debtFlagRef = null,
        totalFundingRef = null,
        totalCapex = null,  // Backward compatibility with old input name
        maxGearingPct = 65,
        interestRatePct = 5,
        tenorYears = 18,
        debtPeriod = 'Q', // M = Monthly, Q = Quarterly, Y = Yearly
        tolerance = 0.1,
        maxIterations = 50
    } = inputs

    // Get timeline from context (for determining period ends)
    const timeline = context.timeline || null

    // Get CFADS arrays - support both new (contracted+merchant) and legacy (single CFADS) formats
    const contractedCfads = contractedCfadsRef && context[contractedCfadsRef]
        ? context[contractedCfadsRef]
        : new Array(arrayLength).fill(0)

    const merchantCfads = merchantCfadsRef && context[merchantCfadsRef]
        ? context[merchantCfadsRef]
        : new Array(arrayLength).fill(0)

    const legacyCfads = cfadsRef && context[cfadsRef]
        ? context[cfadsRef]
        : null

    // Calculate debt service capacity for each period
    // DS Capacity = (Contracted CFADS / Contracted DSCR) + (Merchant CFADS / Merchant DSCR)
    const debtServiceCapacity = new Array(arrayLength).fill(0)
    const totalCfads = new Array(arrayLength).fill(0)

    const useNewFormat = contractedCfadsRef || merchantCfadsRef
    // Resolve all numeric inputs using shared resolver - supports refs like C1.25
    const parsedContractedDSCR = resolveModuleInput(contractedDSCR, context, 0)
    const parsedMerchantDSCR = resolveModuleInput(merchantDSCR, context, 0)
    const parsedTargetDSCR = resolveModuleInput(targetDSCR, context, 0)
    const parsedMaxGearing = resolveModuleInput(maxGearingPct, context, 0)
    // Interest rate as time-series array (supports time-varying rates like R172)
    const interestRateArray = resolveModuleInputArray(interestRatePct, context, arrayLength, 0)
    const parsedTenorYears = resolveModuleInput(tenorYears, context, 0)
    const parsedTolerance = resolveModuleInput(tolerance, context, 0.1)
    const parsedMaxIterations = Math.round(resolveModuleInput(maxIterations, context, 50))

    for (let i = 0; i < arrayLength; i++) {
        if (useNewFormat) {
            // New format: separate contracted and merchant
            const contractedCapacity = parsedContractedDSCR > 0 ? (contractedCfads[i] || 0) / parsedContractedDSCR : 0
            const merchantCapacity = parsedMerchantDSCR > 0 ? (merchantCfads[i] || 0) / parsedMerchantDSCR : 0
            debtServiceCapacity[i] = contractedCapacity + merchantCapacity
            totalCfads[i] = (contractedCfads[i] || 0) + (merchantCfads[i] || 0)
        } else if (legacyCfads) {
            // Legacy format: single CFADS with single DSCR
            debtServiceCapacity[i] = parsedTargetDSCR > 0 ? (legacyCfads[i] || 0) / parsedTargetDSCR : 0
            totalCfads[i] = legacyCfads[i] || 0
        }
    }

    // Get debt service flag array
    const debtFlag = debtFlagRef && context[debtFlagRef]
        ? context[debtFlagRef]
        : new Array(arrayLength).fill(0)

    // Find debt period bounds from flag (flag = 1 means debt service is active)
    const debtStart = debtFlag.findIndex(f => f === 1 || f === true)
    if (debtStart < 0) {
        // No debt service period found
        return emptyDebtSizingOutputs(arrayLength)
    }

    // Get total funding requirement - handle both old (number) and new (reference) formats
    let totalFunding = 0

    // Check for old format: totalCapex as a number
    if (totalCapex !== null && typeof totalCapex === 'number' && totalCapex > 0) {
        totalFunding = totalCapex
    }
    // Check if totalFundingRef is a direct number (legacy)
    else if (totalFundingRef !== null && typeof totalFundingRef === 'number' && totalFundingRef > 0) {
        totalFunding = totalFundingRef
    }
    // New format: totalFundingRef as a reference string
    else if (totalFundingRef && typeof totalFundingRef === 'string' && context[totalFundingRef]) {
        const fundingArray = context[totalFundingRef]
        // Get cumulative value at the period before debt starts (end of construction)
        totalFunding = debtStart > 0
            ? (fundingArray[debtStart - 1] || 0)
            : (fundingArray[0] || 0)
    }

    // Find last period where flag is active
    let debtFlagEnd = debtStart
    for (let i = debtFlag.length - 1; i >= debtStart; i--) {
        if (debtFlag[i] === 1 || debtFlag[i] === true) {
            debtFlagEnd = i
            break
        }
    }
    const tenorMonths = parsedTenorYears * 12
    const debtEnd = Math.min(debtStart + tenorMonths - 1, debtFlagEnd, arrayLength - 1)

    // Binary search for optimal debt (no IDC added - IDC is equity-funded)
    let lowerBound = 0
    let upperBound = totalFunding * (parsedMaxGearing / 100)
    let bestDebt = 0
    let bestSchedule = null

    for (let iter = 0; iter < parsedMaxIterations; iter++) {
        if (upperBound - lowerBound <= parsedTolerance) break

        const testDebt = (lowerBound + upperBound) / 2

        // Generate capacity-sculpted schedule using pre-calculated debt service capacity
        // Capacity = (Contracted CFADS / Contracted DSCR) + (Merchant CFADS / Merchant DSCR)
        const schedule = generateCapacitySchedule(
            testDebt,
            debtServiceCapacity,
            totalCfads,
            debtStart,
            debtEnd,
            interestRateArray,
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
