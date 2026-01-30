// Tax & Tax Losses Module
import { resolveModuleInput } from './shared'

export const TEMPLATE = {
    type: 'tax_losses',
    name: 'Tax & Tax Losses',
    description: 'Tax calculation with loss carry-forward using CUMSUM pattern',
    inputs: [
        { key: 'taxableIncomeRef', label: 'Taxable Income Before Losses', type: 'reference', refType: 'any', required: true },
        { key: 'opsFlagRef', label: 'Operations Flag', type: 'reference', refType: 'flag', required: true },
        { key: 'taxRatePct', label: 'Tax Rate (%)', type: 'number', required: true, default: 30 }
    ],
    outputs: [],
    fullyConverted: true,
    convertedOutputs: [
        { key: 'taxable_income_before_losses', label: 'Taxable Income Before Losses', calcRef: 'R9025' },
        { key: 'losses_opening', label: 'Tax Losses - Opening', calcRef: 'R9026' },
        { key: 'losses_generated', label: 'Tax Losses - Generated', calcRef: 'R9027' },
        { key: 'losses_utilised', label: 'Tax Losses - Utilised', calcRef: 'R9028' },
        { key: 'losses_closing', label: 'Tax Losses - Closing', calcRef: 'R9029' },
        { key: 'net_taxable_income', label: 'Net Taxable Income', calcRef: 'R9030' },
        { key: 'tax_payable', label: 'Tax Payable', calcRef: 'R9031' }
    ],
    outputFormulas: {
        taxable_income_before_losses: '{taxableIncomeRef}',
        losses_opening: 'CUMSUM(MAX(0, -{taxableIncomeRef})) - SHIFT(MIN(CUMSUM(MAX(0, -{taxableIncomeRef})), CUMSUM(MAX(0, {taxableIncomeRef}))), 1)',
        losses_generated: 'MAX(0, -{taxableIncomeRef}) × {opsFlagRef}',
        losses_utilised: 'MIN(CUMSUM(losses_generated), CUMSUM(MAX(0, {taxableIncomeRef}))) - SHIFT(MIN(CUMSUM(losses_generated), CUMSUM(MAX(0, {taxableIncomeRef}))), 1)',
        losses_closing: 'CUMSUM(losses_generated) - MIN(CUMSUM(losses_generated), CUMSUM(MAX(0, {taxableIncomeRef})))',
        net_taxable_income: 'MAX(0, {taxableIncomeRef} - losses_utilised)',
        tax_payable: 'net_taxable_income × {taxRatePct}/100'
    }
}

/**
 * Tax & Tax Losses using Gold Standard CUMSUM pattern.
 * No circular dependencies - uses cumulative min to calculate utilisation.
 *
 * Key insight: Cumulative Utilised = MIN(Cumulative Generated, Cumulative Potential Utilisation)
 * This avoids circular dependencies because both sides are independent cumulative sums.
 *
 * Pattern:
 *   Generated = MAX(0, -Income)              // Loss when income is negative
 *   Potential = MAX(0, Income)               // Could use losses when income is positive
 *   CumUtilised = MIN(CUMSUM(Generated), CUMSUM(Potential))
 *   Utilised = CumUtilised - Prior CumUtilised
 *   Closing = CUMSUM(Generated) - CumUtilised
 */
export function calculate(inputs, arrayLength, context) {
    const {
        taxableIncomeRef = null,
        opsFlagRef = null,
        taxRatePct = 30
    } = inputs

    // Initialize outputs
    const outputs = {
        taxable_income_before_losses: new Array(arrayLength).fill(0),
        losses_opening: new Array(arrayLength).fill(0),
        losses_generated: new Array(arrayLength).fill(0),
        losses_utilised: new Array(arrayLength).fill(0),
        losses_closing: new Array(arrayLength).fill(0),
        net_taxable_income: new Array(arrayLength).fill(0),
        tax_payable: new Array(arrayLength).fill(0)
    }

    // Get taxable income array
    const incomeArray = taxableIncomeRef && context[taxableIncomeRef]
        ? context[taxableIncomeRef]
        : new Array(arrayLength).fill(0)

    // Debug: Log what value Tax module is receiving for taxableIncomeRef
    if (taxableIncomeRef) {
        const firstNonZero = incomeArray.findIndex(v => v !== 0)
        if (firstNonZero >= 0) {
            console.log(`[TaxModule] ${taxableIncomeRef} first non-zero at period ${firstNonZero}: ${incomeArray[firstNonZero].toFixed(4)}`)
        }
    }

    // Get operations flag array
    const opsFlag = opsFlagRef && context[opsFlagRef]
        ? context[opsFlagRef]
        : new Array(arrayLength).fill(1) // Default to always active

    // Tax rate as decimal - supports both direct values and references using shared resolver
    const taxRate = resolveModuleInput(taxRatePct, context, 0) / 100

    // Step 1: Calculate Generated and Potential for each period
    const generated = new Array(arrayLength).fill(0)
    const potential = new Array(arrayLength).fill(0)

    for (let i = 0; i < arrayLength; i++) {
        const isOps = opsFlag[i] === 1 || opsFlag[i] === true
        const income = incomeArray[i] || 0

        outputs.taxable_income_before_losses[i] = income

        if (isOps) {
            // Generated = -MIN(Income, 0) = MAX(-Income, 0) = loss amount when negative
            generated[i] = Math.max(0, -income)
            // Potential = MAX(Income, 0) = income amount when positive (could offset with losses)
            potential[i] = Math.max(0, income)
        }
    }

    // Step 2: Calculate cumulative sums (CUMSUM pattern)
    const cumGenerated = new Array(arrayLength).fill(0)
    const cumPotential = new Array(arrayLength).fill(0)
    let runningGenerated = 0
    let runningPotential = 0

    for (let i = 0; i < arrayLength; i++) {
        runningGenerated += generated[i]
        runningPotential += potential[i]
        cumGenerated[i] = runningGenerated
        cumPotential[i] = runningPotential
    }

    // Step 3: Calculate cumulative utilised = MIN(cumGenerated, cumPotential)
    // This is the key insight - no circular dependency!
    const cumUtilised = new Array(arrayLength).fill(0)
    for (let i = 0; i < arrayLength; i++) {
        cumUtilised[i] = Math.min(cumGenerated[i], cumPotential[i])
    }

    // Step 4: Calculate period values from cumulative (Gold Standard pattern)
    for (let i = 0; i < arrayLength; i++) {
        const isOps = opsFlag[i] === 1 || opsFlag[i] === true

        // Generated for this period
        outputs.losses_generated[i] = generated[i]

        // Utilised = CumUtilised[i] - CumUtilised[i-1]
        const priorCumUtilised = i > 0 ? cumUtilised[i - 1] : 0
        outputs.losses_utilised[i] = cumUtilised[i] - priorCumUtilised

        // Closing = CumGenerated - CumUtilised
        outputs.losses_closing[i] = cumGenerated[i] - cumUtilised[i]

        // Opening = Prior Closing (using CUMSUM - X pattern)
        const priorCumGenerated = i > 0 ? cumGenerated[i - 1] : 0
        outputs.losses_opening[i] = priorCumGenerated - priorCumUtilised

        // Net Taxable Income = MAX(0, Income - Utilised) = Income + Utilised (since utilised offsets)
        // Actually: Net = Income + Utilised (utilised is positive, reduces taxable income)
        // Or: Net = MAX(0, Income) - Utilised when income is positive
        if (isOps) {
            const income = incomeArray[i] || 0
            // Net taxable = Taxable income reduced by losses utilised
            // If income is negative, net taxable is 0 (loss carried forward)
            // If income is positive, reduce by utilised amount
            outputs.net_taxable_income[i] = Math.max(0, income - outputs.losses_utilised[i])

            // Tax Payable = Net Taxable Income * Rate
            outputs.tax_payable[i] = outputs.net_taxable_income[i] * taxRate
        }
    }

    return outputs
}
