// MRA (Maintenance Reserve Account) Module
import { resolveModuleInput } from './shared'

export const TEMPLATE = {
    type: 'mra_reserve',
    name: 'MRA (Look-Forward Reserve)',
    description: 'Maintenance Reserve Account with look-forward target calculation',
    inputs: [
        { key: 'accountName', label: 'Account Name', type: 'text', placeholder: 'e.g., MRA', default: 'MRA', required: true },
        { key: 'maintenanceRef', label: 'Maintenance Capex', type: 'reference', refType: 'any', required: true },
        { key: 'reservePeriodMonths', label: 'Reserve Period (months)', type: 'number', default: 12, required: true },
        { key: 'reservePortion', label: 'Reserve Portion (%)', type: 'percentage', default: 100, required: true },
        { key: 'activeFlagRef', label: 'Active Flag (e.g., F2)', type: 'reference', refType: 'flag', required: true },
        { key: 'releaseFlagRef', label: 'Release Flag (e.g., F2.End)', type: 'reference', refType: 'flag', required: false }
    ],
    outputs: [
        { key: 'opening', label: 'Opening Balance', type: 'stock_start' },
        { key: 'target', label: 'Target Balance', type: 'stock' },
        { key: 'funding', label: 'Funding/Top-up', type: 'flow' },
        { key: 'drawdown', label: 'Drawdown', type: 'flow' },
        { key: 'release', label: 'Release', type: 'flow' },
        { key: 'closing', label: 'Closing Balance', type: 'stock' }
    ],
    outputFormulas: {
        target: 'SUM(maintenance[i] to maintenance[i+reservePeriod-1]) × reservePortion/100',
        opening: 'SHIFT(closing, 1)',
        funding: 'MAX(0, target - opening) × activeFlag',
        drawdown: 'MIN(maintenance, opening + funding) × activeFlag',
        release: 'closing × releaseFlag',
        closing: 'CUMSUM(funding) - CUMSUM(drawdown) - CUMSUM(release)'
    }
}

/**
 * MRA (Maintenance Reserve Account) with Look-Forward Target Calculation.
 * The target balance is calculated by summing upcoming maintenance capex
 * over the reserve period and applying the reserve portion percentage.
 *
 * Key Formula:
 *   Target[i] = SUM(Maintenance[i] to Maintenance[i + reservePeriod - 1]) × reservePortion/100
 *   Funding = MAX(0, Target - Opening) × ActiveFlag
 *   Drawdown = MIN(Maintenance, Available) × ActiveFlag
 *   Release = Closing × ReleaseFlag
 *
 * This ensures sufficient funds are always available for upcoming maintenance.
 */
export function calculate(inputs, arrayLength, context) {
    const {
        maintenanceRef = null,
        reservePeriodMonths = 12,
        reservePortion = 100,
        activeFlagRef = null,
        releaseFlagRef = null
    } = inputs

    // Initialize outputs
    const outputs = {
        opening: new Array(arrayLength).fill(0),
        target: new Array(arrayLength).fill(0),
        funding: new Array(arrayLength).fill(0),
        drawdown: new Array(arrayLength).fill(0),
        release: new Array(arrayLength).fill(0),
        closing: new Array(arrayLength).fill(0)
    }

    // Get maintenance array
    const maintenanceArray = maintenanceRef && context[maintenanceRef]
        ? context[maintenanceRef]
        : new Array(arrayLength).fill(0)

    // Get active flag array
    const activeFlag = activeFlagRef && context[activeFlagRef]
        ? context[activeFlagRef]
        : new Array(arrayLength).fill(0)

    // Get release flag array (optional)
    const releaseFlag = releaseFlagRef && context[releaseFlagRef]
        ? context[releaseFlagRef]
        : new Array(arrayLength).fill(0)

    // Parse parameters using shared resolver - supports refs like C1.X
    const reservePeriod = Math.round(resolveModuleInput(reservePeriodMonths, context, 12))
    const portionPct = resolveModuleInput(reservePortion, context, 100) / 100

    // Step 1: Calculate look-forward target for each period
    // Target[i] = sum of maintenance from period i to (i + reservePeriod - 1)
    for (let i = 0; i < arrayLength; i++) {
        const isActive = activeFlag[i] === 1 || activeFlag[i] === true
        if (isActive) {
            let lookForwardSum = 0
            for (let j = i; j < Math.min(i + reservePeriod, arrayLength); j++) {
                lookForwardSum += Math.abs(maintenanceArray[j] || 0)
            }
            outputs.target[i] = lookForwardSum * portionPct
        }
    }

    // Step 2: Process each period sequentially (funding depends on opening, which depends on prior closing)
    let cumFunding = 0
    let cumDrawdown = 0
    let cumRelease = 0

    for (let i = 0; i < arrayLength; i++) {
        const isActive = activeFlag[i] === 1 || activeFlag[i] === true
        const isRelease = releaseFlag[i] === 1 || releaseFlag[i] === true

        // Opening = prior closing
        outputs.opening[i] = i > 0 ? outputs.closing[i - 1] : 0

        if (isActive && !isRelease) {
            // Funding = MAX(0, Target - Opening)
            // Fund to meet target if there's a shortfall
            const shortfall = outputs.target[i] - outputs.opening[i]
            outputs.funding[i] = Math.max(0, shortfall)

            // Drawdown = MIN(Maintenance, Available Balance)
            // Draw down for maintenance expenses (use absolute value as maintenance may be negative in capex)
            const maintenanceAmount = Math.abs(maintenanceArray[i] || 0)
            const availableBalance = outputs.opening[i] + outputs.funding[i]
            outputs.drawdown[i] = Math.min(maintenanceAmount, availableBalance)
        }

        cumFunding += outputs.funding[i]
        cumDrawdown += outputs.drawdown[i]

        // Release remaining balance when release flag is active
        if (isRelease) {
            const balanceBeforeRelease = cumFunding - cumDrawdown - cumRelease
            outputs.release[i] = Math.max(0, balanceBeforeRelease)
        }

        cumRelease += outputs.release[i]

        // Closing = Cumulative Funding - Cumulative Drawdown - Cumulative Release
        outputs.closing[i] = cumFunding - cumDrawdown - cumRelease
    }

    return outputs
}
