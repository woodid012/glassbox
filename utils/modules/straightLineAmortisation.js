// Straight-Line Amortisation Module
// Supersedes depreciation_amortization — supports both one-time and periodic addition modes
import { resolveModuleInput } from './shared'

export const TEMPLATE = {
    type: 'straight_line_amortisation',
    name: 'Straight-Line Amortisation',
    description: 'CUMSUM-based ledger pattern for depreciation/amortisation — supports one-time and periodic additions',
    inputs: [
        { key: 'capitalisedRef', label: 'Capitalised Cost Reference', type: 'reference', refType: 'any', required: true },
        { key: 'onsetFlag', label: 'Onset Flag (e.g. F2)', type: 'reference', refType: 'flag', required: true },
        { key: 'lifeRef', label: 'Useful Life (years)', type: 'number_or_ref', required: true, default: 15 },
        { key: 'additionMode', label: 'Addition Mode', type: 'select', options: [
            { value: 'one_time', label: 'One-time at onset' },
            { value: 'periodic', label: 'Periodic additions' }
        ], required: true, default: 'one_time' },
        // Periodic mode inputs
        { key: 'periodicAdditionRef', label: 'Periodic Addition Reference', type: 'reference', refType: 'any', required: false },
        { key: 'activeFlag', label: 'Active Flag (periodic mode)', type: 'reference', refType: 'flag', required: false }
    ],
    outputs: [],
    fullyConverted: true,
    convertedOutputs: [
        { key: 'total_capitalised', label: 'Total Capitalised', calcRef: null },
        { key: 'addition', label: 'Addition', calcRef: null },
        { key: 'opening', label: 'Opening NBV', calcRef: null },
        { key: 'expense', label: 'Amortisation/Depreciation Expense', calcRef: null },
        { key: 'accumulated', label: 'Accumulated Amortisation', calcRef: null },
        { key: 'closing', label: 'Closing NBV', calcRef: null }
    ],
    outputFormulas: {
        // one_time mode formulas
        one_time: {
            total_capitalised: '{capitalisedRef}',
            addition: '{capitalisedRef} * {onsetFlag}.Start',
            opening: 'MAX(0, (CUMSUM(addition) - addition) - {capitalisedRef} / {lifeRef} / T.MiY * (CUMSUM({onsetFlag}) - {onsetFlag}))',
            expense: 'MIN(opening + addition, {capitalisedRef} / {lifeRef} / T.MiY) * {onsetFlag}',
            accumulated: 'CUMSUM(expense)',
            closing: 'MAX(0, CUMSUM(addition) - {capitalisedRef} / {lifeRef} / T.MiY * CUMSUM({onsetFlag}))'
        },
        // periodic mode formulas
        periodic: {
            active_flag: '{onsetFlag} * (CUMSUM({activeFlag}) > 0)',
            total_capitalised: 'CUMSUM({periodicAdditionRef})',
            addition: '{periodicAdditionRef}',
            opening: 'MAX(0, (CUMSUM(addition) - addition) - (CUMSUM(addition) - addition) / {lifeRef} / T.MiY * (CUMSUM(active_flag) - active_flag))',
            closing: 'MAX(0, CUMSUM(addition) - CUMSUM(addition) / {lifeRef} / T.MiY * CUMSUM(active_flag))',
            expense: 'opening + addition - closing',
            accumulated: 'CUMSUM(expense)'
        }
    }
}

/**
 * Straight-Line Amortisation using Gold Standard CUMSUM pattern.
 * Supports two modes:
 *   one_time:  costs capitalised during construction, transferred as one-time addition at onset
 *   periodic:  ongoing additions with stock-identity depreciation
 */
export function calculate(inputs, arrayLength, context) {
    const {
        capitalisedRef = null,
        onsetFlag = null,
        lifeRef = 15,
        additionMode = 'one_time',
        periodicAdditionRef = null,
        activeFlag = null
    } = inputs

    const outputs = {
        total_capitalised: new Array(arrayLength).fill(0),
        addition: new Array(arrayLength).fill(0),
        opening: new Array(arrayLength).fill(0),
        expense: new Array(arrayLength).fill(0),
        accumulated: new Array(arrayLength).fill(0),
        closing: new Array(arrayLength).fill(0)
    }

    // Resolve life in years
    const resolvedLife = resolveModuleInput(lifeRef, context, 15)
    if (resolvedLife <= 0) return outputs

    // Get onset flag array
    const onsetArr = onsetFlag && context[onsetFlag]
        ? context[onsetFlag]
        : new Array(arrayLength).fill(0)

    // Find onset start (first period where flag = 1)
    const onsetStart = onsetArr.findIndex(f => f === 1 || f === true)
    if (onsetStart < 0) return outputs

    // Cumulative onset flag
    const cumsumOnset = new Array(arrayLength).fill(0)
    let onsetTotal = 0
    for (let i = 0; i < arrayLength; i++) {
        onsetTotal += (onsetArr[i] === 1 || onsetArr[i] === true) ? 1 : 0
        cumsumOnset[i] = onsetTotal
    }

    if (additionMode === 'periodic') {
        return calculatePeriodic(inputs, arrayLength, context, outputs, resolvedLife, onsetArr, onsetStart, cumsumOnset)
    }

    return calculateOneTime(inputs, arrayLength, context, outputs, resolvedLife, onsetArr, onsetStart, cumsumOnset)
}

function calculateOneTime(inputs, arrayLength, context, outputs, life, onsetArr, onsetStart, cumsumOnset) {
    const { capitalisedRef } = inputs

    // Get capitalised cost array
    const capArr = capitalisedRef && context[capitalisedRef]
        ? context[capitalisedRef]
        : new Array(arrayLength).fill(0)

    // Total capitalised = the capitalised ref value (cumulative cost at onset)
    for (let i = 0; i < arrayLength; i++) {
        outputs.total_capitalised[i] = capArr[i] || 0
    }

    // Total capital at onset
    const totalCapital = capArr[onsetStart] || 0
    if (totalCapital === 0) return outputs

    const monthlyRate = totalCapital / life / 12

    for (let i = 0; i < arrayLength; i++) {
        const isOnset = onsetArr[i] === 1 || onsetArr[i] === true
        const isOnsetStart = i === onsetStart

        // Addition: one-time at onset start
        if (isOnsetStart) {
            outputs.addition[i] = totalCapital
        }

        // Closing = MAX(0, CUMSUM(Addition) - Rate * CUMSUM(OnsetFlag))
        const cumsumAddition = i >= onsetStart ? totalCapital : 0
        outputs.closing[i] = Math.max(0, cumsumAddition - monthlyRate * cumsumOnset[i])

        // Opening = prior period's cumulative
        const priorCumsumAddition = cumsumAddition - outputs.addition[i]
        const priorCumsumOnset = cumsumOnset[i] - (isOnset ? 1 : 0)
        outputs.opening[i] = Math.max(0, priorCumsumAddition - monthlyRate * priorCumsumOnset)

        // Expense = MIN(Opening + Addition, Rate) * OnsetFlag
        if (isOnset) {
            outputs.expense[i] = Math.min(outputs.opening[i] + outputs.addition[i], monthlyRate)
        }

        // Accumulated
        outputs.accumulated[i] = (i > 0 ? outputs.accumulated[i - 1] : 0) + outputs.expense[i]
    }

    return outputs
}

function calculatePeriodic(inputs, arrayLength, context, outputs, life, onsetArr, onsetStart, cumsumOnset) {
    const { periodicAdditionRef, activeFlag: activeFlagRef } = inputs

    // Get periodic addition array
    const addArr = periodicAdditionRef && context[periodicAdditionRef]
        ? context[periodicAdditionRef]
        : new Array(arrayLength).fill(0)

    // Get active flag array (gates when depreciation runs)
    const activeArr = activeFlagRef && context[activeFlagRef]
        ? context[activeFlagRef]
        : new Array(arrayLength).fill(0)

    // Add active_flag output for periodic mode
    outputs.active_flag = new Array(arrayLength).fill(0)

    // Build active flag: onsetFlag * (CUMSUM(activeFlag) > 0)
    let cumsumActive = 0
    for (let i = 0; i < arrayLength; i++) {
        cumsumActive += (activeArr[i] === 1 || activeArr[i] === true) ? 1 : 0
        const isOnset = onsetArr[i] === 1 || onsetArr[i] === true
        outputs.active_flag[i] = isOnset && cumsumActive > 0 ? 1 : 0
    }

    // Cumulative active flag
    const cumsumActiveFlag = new Array(arrayLength).fill(0)
    let activeTotal = 0
    for (let i = 0; i < arrayLength; i++) {
        activeTotal += outputs.active_flag[i]
        cumsumActiveFlag[i] = activeTotal
    }

    // Cumulative additions
    const cumsumAdditions = new Array(arrayLength).fill(0)
    let runningAdd = 0
    for (let i = 0; i < arrayLength; i++) {
        runningAdd += addArr[i] || 0
        cumsumAdditions[i] = runningAdd
    }

    for (let i = 0; i < arrayLength; i++) {
        outputs.addition[i] = addArr[i] || 0
        outputs.total_capitalised[i] = cumsumAdditions[i]

        // Prior cumulative addition
        const priorCumsumAdd = cumsumAdditions[i] - outputs.addition[i]
        const priorCumsumActive = cumsumActiveFlag[i] - outputs.active_flag[i]

        // Opening = MAX(0, priorCumsumAdd - priorCumsumAdd / life / 12 * priorCumsumActive)
        outputs.opening[i] = life > 0 && priorCumsumActive > 0
            ? Math.max(0, priorCumsumAdd - priorCumsumAdd / life / 12 * priorCumsumActive)
            : Math.max(0, priorCumsumAdd)

        // Closing = MAX(0, cumsumAdd - cumsumAdd / life / 12 * cumsumActive)
        outputs.closing[i] = life > 0 && cumsumActiveFlag[i] > 0
            ? Math.max(0, cumsumAdditions[i] - cumsumAdditions[i] / life / 12 * cumsumActiveFlag[i])
            : Math.max(0, cumsumAdditions[i])

        // Expense = Opening + Addition - Closing (stock identity)
        outputs.expense[i] = outputs.opening[i] + outputs.addition[i] - outputs.closing[i]

        // Accumulated
        outputs.accumulated[i] = (i > 0 ? outputs.accumulated[i - 1] : 0) + outputs.expense[i]
    }

    return outputs
}
