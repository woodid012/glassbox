// Depreciation & Amortization Module
import { resolveModuleInput } from './shared'

export const TEMPLATE = {
    type: 'depreciation_amortization',
    name: 'Depreciation & Amortization',
    description: 'CUMSUM-based ledger pattern - no circular dependencies',
    inputs: [
        // Capital additions reference (e.g., V1 for CAPEX)
        { key: 'additionsRef', label: 'Capital Additions Reference', type: 'reference', refType: 'any', required: true },
        // Operations flag (when depreciation starts)
        { key: 'opsFlagRef', label: 'Operations Flag', type: 'reference', refType: 'flag', required: true },
        // Depreciation life
        { key: 'lifeYears', label: 'Useful Life (years)', type: 'number', required: true, default: 25 },
        // Method toggle
        { key: 'method', label: 'Depreciation Method', type: 'select', options: [
            { value: 'straight_line', label: 'Straight Line' },
            { value: 'declining_balance', label: 'Declining Balance' }
        ], required: true, default: 'straight_line' },
        // Declining balance multiplier (only used when method = declining_balance)
        { key: 'dbMultiplier', label: 'DB Multiplier', type: 'select', options: [
            { value: 2.0, label: 'Double (2x)' },
            { value: 1.5, label: '150% (1.5x)' },
            { value: 1.0, label: '100% (1x)' }
        ], required: false, default: 2.0 }
    ],
    outputs: [],
    fullyConverted: true,
    convertedOutputs: [
        { key: 'opening_book_value', label: 'Opening Book Value', calcRef: 'R9001' },
        { key: 'capital_addition', label: 'Capital Addition', calcRef: 'R9002' },
        { key: 'depreciation', label: 'Depreciation Expense', calcRef: 'R9003' },
        { key: 'accumulated_depreciation', label: 'Accumulated Depreciation', calcRef: 'R9004' },
        { key: 'closing_book_value', label: 'Closing Book Value', calcRef: 'R9005' }
    ],
    outputFormulas: {
        opening: 'MAX(0, (CUMSUM({additionsRef}) - {additionsRef}) - CUMSUM({additionsRef}) / {lifeYears} / T.MiY × (CUMSUM({opsFlagRef}) - {opsFlagRef}))',
        addition: 'CUMSUM({additionsRef}) × {opsFlagRef}.Start',
        depreciation: 'MIN(opening + addition, CUMSUM({additionsRef}) / {lifeYears} / T.MiY) × {opsFlagRef}',
        accumulated: 'CUMSUM(depreciation)',
        closing: 'MAX(0, CUMSUM({additionsRef}) - CUMSUM({additionsRef}) / {lifeYears} / T.MiY × CUMSUM({opsFlagRef}))'
    }
}

/**
 * Depreciation & Amortization using Gold Standard CUMSUM pattern.
 * No circular dependencies - Closing calculated first, Opening derived.
 *
 * Pattern:
 *   Closing = MAX(0, CUMSUM(Addition) - Rate * CUMSUM(OpsFlag))
 *   Opening = MAX(0, (CUMSUM(Addition) - Addition) - Rate * (CUMSUM(OpsFlag) - OpsFlag))
 *   Addition = TotalCapex * OpsFlag.Start (one-time at COD)
 *   Depreciation = MIN(Opening + Addition, Rate) * OpsFlag
 */
export function calculate(inputs, arrayLength, context) {
    const {
        additionsRef = null,
        opsFlagRef = null,
        lifeYears = 25,
        method = 'straight_line',
        dbMultiplier = 2.0
    } = inputs

    // Initialize outputs
    const outputs = {
        opening: new Array(arrayLength).fill(0),
        addition: new Array(arrayLength).fill(0),
        depreciation: new Array(arrayLength).fill(0),
        accumulated: new Array(arrayLength).fill(0),
        closing: new Array(arrayLength).fill(0)
    }

    // Get additions array (e.g., V1 capex inputs)
    const additionsArray = additionsRef && context[additionsRef]
        ? context[additionsRef]
        : new Array(arrayLength).fill(0)

    // Get operations flag array
    const opsFlag = opsFlagRef && context[opsFlagRef]
        ? context[opsFlagRef]
        : new Array(arrayLength).fill(0)

    // Resolve numeric inputs using shared resolver
    const resolvedLifeYears = resolveModuleInput(lifeYears, context, 25)
    const resolvedDbMultiplier = resolveModuleInput(dbMultiplier, context, 2.0)

    // Calculate cumulative additions (total capex over time)
    const cumsumAdditions = new Array(arrayLength).fill(0)
    let runningTotal = 0
    for (let i = 0; i < arrayLength; i++) {
        runningTotal += additionsArray[i] || 0
        cumsumAdditions[i] = runningTotal
    }

    // Find F.Start (first period where flag = 1)
    const opsStart = opsFlag.findIndex(f => f === 1 || f === true)
    if (opsStart < 0) {
        // No operations period - no depreciation
        return outputs
    }

    // Calculate cumulative ops flag
    const cumsumOpsFlag = new Array(arrayLength).fill(0)
    let opsFlagTotal = 0
    for (let i = 0; i < arrayLength; i++) {
        opsFlagTotal += (opsFlag[i] === 1 || opsFlag[i] === true) ? 1 : 0
        cumsumOpsFlag[i] = opsFlagTotal
    }

    // Total capital at COD (used for rate calculation)
    const totalCapitalAtCOD = cumsumAdditions[opsStart] || 0

    if (method === 'declining_balance') {
        // Declining Balance Method (Gold Standard - geometric series)
        // Uses closed-form formula: Closing = Capital * (1 - r)^n
        // No iteration needed - each period calculated independently

        // Annual rate = multiplier / life (e.g., 2/25 = 8% for DDB with 25-year life)
        const annualRate = resolvedDbMultiplier / resolvedLifeYears
        const monthlyDbRate = annualRate / 12

        // Retention factor per period
        const retentionFactor = 1 - monthlyDbRate

        for (let i = 0; i < arrayLength; i++) {
            const isOps = opsFlag[i] === 1 || opsFlag[i] === true
            const isOpsStart = i === opsStart
            const periodsIntoOps = cumsumOpsFlag[i]
            const priorPeriodsIntoOps = periodsIntoOps - (isOps ? 1 : 0)

            // Addition: One-time at COD (F.Start pattern)
            if (isOpsStart) {
                outputs.addition[i] = totalCapitalAtCOD
            }

            // Closing = Capital * (1 - r)^n
            // Using geometric series - no circular dependency
            if (i >= opsStart) {
                outputs.closing[i] = Math.max(0, totalCapitalAtCOD * Math.pow(retentionFactor, periodsIntoOps))
            }

            // Opening = Capital * (1 - r)^(n-1) for n > 0, else 0
            // At opsStart (n=1), priorPeriodsIntoOps = 0, so Opening = Capital * 1 = 0 (before addition)
            if (i >= opsStart && priorPeriodsIntoOps > 0) {
                outputs.opening[i] = totalCapitalAtCOD * Math.pow(retentionFactor, priorPeriodsIntoOps)
            }

            // Depreciation = (Opening + Addition) * rate
            if (isOps) {
                const bookValue = outputs.opening[i] + outputs.addition[i]
                outputs.depreciation[i] = Math.max(0, bookValue * monthlyDbRate)
            }

            // Accumulated = CUMSUM(Depreciation)
            outputs.accumulated[i] = (i > 0 ? outputs.accumulated[i - 1] : 0) + outputs.depreciation[i]
        }
    } else {
        // Straight Line Method (Gold Standard - CUMSUM pattern)
        // Rate = TotalCapital / Life / 12
        const monthlyRate = resolvedLifeYears > 0 ? totalCapitalAtCOD / resolvedLifeYears / 12 : 0

        for (let i = 0; i < arrayLength; i++) {
            const isOps = opsFlag[i] === 1 || opsFlag[i] === true
            const isOpsStart = i === opsStart

            // Addition: One-time at COD (F.Start pattern)
            if (isOpsStart) {
                outputs.addition[i] = totalCapitalAtCOD
            }

            // Closing = MAX(0, CUMSUM(Addition) - Rate * CUMSUM(OpsFlag))
            // Since Addition is one-time at COD, CUMSUM(Addition) = totalCapital for all ops periods
            const cumsumAdditionValue = i >= opsStart ? totalCapitalAtCOD : 0
            outputs.closing[i] = Math.max(0, cumsumAdditionValue - monthlyRate * cumsumOpsFlag[i])

            // Opening = MAX(0, (CUMSUM(Addition) - Addition) - Rate * (CUMSUM(OpsFlag) - OpsFlag))
            // This gives prior period's cumulative values
            const priorCumsumAddition = cumsumAdditionValue - outputs.addition[i]
            const priorCumsumOpsFlag = cumsumOpsFlag[i] - (isOps ? 1 : 0)
            outputs.opening[i] = Math.max(0, priorCumsumAddition - monthlyRate * priorCumsumOpsFlag)

            // Depreciation = MIN(Opening + Addition, Rate) * OpsFlag
            if (isOps) {
                outputs.depreciation[i] = Math.min(outputs.opening[i] + outputs.addition[i], monthlyRate)
            }

            // Accumulated = CUMSUM(Depreciation)
            outputs.accumulated[i] = (i > 0 ? outputs.accumulated[i - 1] : 0) + outputs.depreciation[i]
        }
    }

    return outputs
}
