// DSRF (Debt Service Reserve Facility) Module
import { resolveModuleInput } from './shared'

export const TEMPLATE = {
    type: 'dsrf',
    name: 'Debt Service Reserve Facility (DSRF)',
    description: 'Standby facility guaranteeing debt service with refinancing schedule',
    inputs: [
        { key: 'dsrfActiveRef', label: 'DSRF Active (1/0)', type: 'number_or_ref', required: true, default: 1 },
        { key: 'debtServiceRef', label: 'Base Debt Service (pre-DSRF)', type: 'reference', refType: 'any', required: true },
        { key: 'operationsFlagRef', label: 'Operations Flag', type: 'reference', refType: 'flag', required: true },
        { key: 'establishmentFeePctRef', label: 'Establishment Fee (%)', type: 'number_or_ref', required: true, default: 1.35 },
        { key: 'commitmentFeePctOfMarginRef', label: 'Commitment Fee (% of Margin)', type: 'number_or_ref', required: true, default: 40 },
        { key: 'baseMarginPctRef', label: 'Base Margin (%)', type: 'number_or_ref', required: true, default: 1.75 },
        { key: 'facilityMonthsRef', label: 'Facility Months of DS', type: 'number_or_ref', required: true, default: 6 },
        { key: 'refinancingSchedule', label: 'Refinancing Schedule', type: 'array', required: false, default: [] }
    ],
    outputs: [
        { key: 'facility_limit', label: 'Facility Limit', type: 'stock' },
        { key: 'establishment_fee', label: 'Establishment Fee', type: 'flow' },
        { key: 'commitment_fee', label: 'Commitment Fee', type: 'flow' },
        { key: 'refi_fees', label: 'Refinancing Fees', type: 'flow' },
        { key: 'effective_margin', label: 'Effective Margin (%)', type: 'stock' },
        { key: 'total_dsrf_fees', label: 'Total DSRF Fees', type: 'flow' },
        { key: 'total_dsrf_fees_cumulative', label: 'Total DSRF Fees (Cumulative)', type: 'stock' },
        { key: 'ds_plus_dsrf', label: 'DS + DSRF Fees', type: 'flow' },
        { key: 'adjusted_dscr', label: 'Adjusted DSCR', type: 'stock' }
    ],
    outputFormulas: {
        facility_limit: 'Forward-looking sum of next N months DS (recalc at each refi)',
        establishment_fee: 'facility_limit × establishmentFeePct / 100 × F2.Start',
        commitment_fee: 'facility_limit × effective_margin / 100 × commitmentFeePct / 100 / 4 × T.QE × F2',
        refi_fees: 'facility_limit × refiFeePct / 100 at each refi date',
        effective_margin: 'Steps from base margin to refi margin at each date',
        total_dsrf_fees: 'establishment_fee + commitment_fee + refi_fees',
        total_dsrf_fees_cumulative: 'CUMSUM(total_dsrf_fees)',
        ds_plus_dsrf: 'debtService + total_dsrf_fees',
        adjusted_dscr: 'CFADS / ds_plus_dsrf'
    }
}

/**
 * DSRF (Debt Service Reserve Facility) calculation.
 * Models a standby facility that guarantees debt service payments.
 *
 * The facility limit is sized on base debt service (without DSRF fees)
 * as a forward-looking sum of the next N months of DS.
 * The facility limit is recalculated at each refinancing date.
 *
 * Fees:
 *   Establishment fee = one-time at ops start on facility limit
 *   Commitment fee = quarterly at QE = limit * effective_margin * commitPct / 4
 *   Refi fees = one-time at each refinancing date on facility limit
 *
 * Effective margin steps from base margin to each refi margin at refi dates.
 */
export function calculate(inputs, arrayLength, context) {
    const {
        dsrfActiveRef = 1,
        debtServiceRef = null,
        operationsFlagRef = null,
        establishmentFeePctRef = 1.35,
        commitmentFeePctOfMarginRef = 40,
        baseMarginPctRef = 1.75,
        facilityMonthsRef = 6,
        refinancingSchedule = []
    } = inputs

    // Initialize outputs
    const outputs = {
        facility_limit: new Array(arrayLength).fill(0),
        establishment_fee: new Array(arrayLength).fill(0),
        commitment_fee: new Array(arrayLength).fill(0),
        refi_fees: new Array(arrayLength).fill(0),
        effective_margin: new Array(arrayLength).fill(0),
        total_dsrf_fees: new Array(arrayLength).fill(0),
        total_dsrf_fees_cumulative: new Array(arrayLength).fill(0),
        ds_plus_dsrf: new Array(arrayLength).fill(0),
        adjusted_dscr: new Array(arrayLength).fill(0)
    }

    // Check if DSRF is active
    const dsrfActive = resolveModuleInput(dsrfActiveRef, context, 1)
    if (!dsrfActive) return outputs

    // Get input arrays
    const debtService = debtServiceRef && context[debtServiceRef]
        ? context[debtServiceRef]
        : new Array(arrayLength).fill(0)

    const opsFlag = operationsFlagRef && context[operationsFlagRef]
        ? context[operationsFlagRef]
        : new Array(arrayLength).fill(0)

    // Resolve scalar parameters
    const estFeePct = resolveModuleInput(establishmentFeePctRef, context, 1.35) / 100
    const commitFeePctOfMargin = resolveModuleInput(commitmentFeePctOfMarginRef, context, 40) / 100
    const baseMarginPct = resolveModuleInput(baseMarginPctRef, context, 1.75)
    const facilityMonths = Math.round(resolveModuleInput(facilityMonthsRef, context, 6))

    // Find ops start (first period where opsFlag = 1)
    const opsStart = opsFlag.findIndex(f => f === 1 || f === true)
    if (opsStart < 0) return outputs

    // Build sorted active refinancing events
    const activeRefis = (refinancingSchedule || [])
        .filter(r => r.active && r.monthIndex > 0)
        .sort((a, b) => a.monthIndex - b.monthIndex)

    // Step 1: Build effective margin time series
    // Starts at base margin, steps to each refi margin at the refi month index
    let currentMargin = baseMarginPct
    let nextRefiIdx = 0
    for (let i = 0; i < arrayLength; i++) {
        // Check if we've hit a refinancing date
        if (nextRefiIdx < activeRefis.length && i >= activeRefis[nextRefiIdx].monthIndex) {
            currentMargin = activeRefis[nextRefiIdx].marginPct
            nextRefiIdx++
        }
        outputs.effective_margin[i] = currentMargin
    }

    // Step 2: Calculate facility limit
    // Forward-looking sum of next N months of absolute debt service
    // Recalculated at ops start and at each refi date
    // Between recalc points, the limit stays constant

    // Collect recalc points: ops start + each active refi date
    const recalcPoints = [opsStart]
    for (const refi of activeRefis) {
        if (refi.monthIndex > opsStart && refi.monthIndex < arrayLength) {
            recalcPoints.push(refi.monthIndex)
        }
    }

    let currentLimit = 0
    let nextRecalcIdx = 0

    for (let i = 0; i < arrayLength; i++) {
        const isOps = opsFlag[i] === 1 || opsFlag[i] === true
        if (!isOps) continue

        // Check if we need to recalculate the facility limit
        if (nextRecalcIdx < recalcPoints.length && i >= recalcPoints[nextRecalcIdx]) {
            // Forward-looking sum of next N months of DS (absolute values)
            let forwardSum = 0
            for (let j = i; j < Math.min(i + facilityMonths, arrayLength); j++) {
                forwardSum += Math.abs(debtService[j] || 0)
            }
            currentLimit = forwardSum
            // Advance past any recalc points at or before current period
            while (nextRecalcIdx < recalcPoints.length && recalcPoints[nextRecalcIdx] <= i) {
                nextRecalcIdx++
            }
        }

        outputs.facility_limit[i] = currentLimit
    }

    // Step 3: Calculate establishment fee (one-time at ops start)
    if (opsStart < arrayLength) {
        outputs.establishment_fee[opsStart] = outputs.facility_limit[opsStart] * estFeePct
    }

    // Step 4: Calculate refinancing fees (one-time at each refi date)
    for (const refi of activeRefis) {
        const idx = refi.monthIndex
        if (idx >= 0 && idx < arrayLength && (opsFlag[idx] === 1 || opsFlag[idx] === true)) {
            const refiFeePct = (refi.feePct || 0) / 100
            outputs.refi_fees[idx] = outputs.facility_limit[idx] * refiFeePct
        }
    }

    // Step 5: Calculate commitment fee (quarterly - paid at quarter end)
    // commitment_fee = facility_limit * effective_margin% * commitFeePctOfMargin / 4 (quarterly)
    const qeFlag = context['T.QE'] || new Array(arrayLength).fill(0)
    for (let i = 0; i < arrayLength; i++) {
        const isOps = opsFlag[i] === 1 || opsFlag[i] === true
        const isQE = qeFlag[i] === 1
        if (isOps && isQE && outputs.facility_limit[i] > 0) {
            outputs.commitment_fee[i] = outputs.facility_limit[i] *
                (outputs.effective_margin[i] / 100) *
                commitFeePctOfMargin / 4
        }
    }

    // Step 6: Aggregate totals
    let cumFees = 0
    for (let i = 0; i < arrayLength; i++) {
        const totalFee = outputs.establishment_fee[i] + outputs.commitment_fee[i] + outputs.refi_fees[i]
        outputs.total_dsrf_fees[i] = totalFee
        cumFees += totalFee
        outputs.total_dsrf_fees_cumulative[i] = cumFees

        // DS + DSRF = base debt service + DSRF fees (both as absolutes for reporting)
        const absDS = Math.abs(debtService[i] || 0)
        outputs.ds_plus_dsrf[i] = absDS + totalFee

        // Adjusted DSCR = not directly computable here (needs CFADS from context)
        // Will be 0 - downstream calculations can compute if needed
    }

    return outputs
}
