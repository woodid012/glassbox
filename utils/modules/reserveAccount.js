// Reserve Account Module
export const TEMPLATE = {
    type: 'reserve_account',
    name: 'Reserve Account',
    description: 'Reserve account (MRA/DSRA) with funding and drawdown using CUMSUM pattern',
    inputs: [
        { key: 'accountName', label: 'Account Name', type: 'text', placeholder: 'e.g., MRA, DSRA', required: true },
        { key: 'fundingAmountRef', label: 'Funding Amount', type: 'reference', refType: 'any', required: true },
        { key: 'fundingFlagRef', label: 'Funding Flag (e.g., F1.End)', type: 'reference', refType: 'flag', required: true },
        { key: 'drawdownRef', label: 'Drawdown Amount (e.g., Maintenance)', type: 'reference', refType: 'any', required: false },
        { key: 'drawdownFlagRef', label: 'Drawdown Flag (e.g., F2)', type: 'reference', refType: 'flag', required: false },
        { key: 'releaseFlagRef', label: 'Release Flag (e.g., F2.End)', type: 'reference', refType: 'flag', required: false }
    ],
    outputs: [],
    fullyConverted: true,
    convertedOutputs: [
        { key: 'opening_balance', label: 'Opening Balance', calcRef: 'R9032' },
        { key: 'funding', label: 'Funding', calcRef: 'R9033' },
        { key: 'drawdown', label: 'Drawdown', calcRef: 'R9034' },
        { key: 'release', label: 'Release', calcRef: 'R9035' },
        { key: 'closing_balance', label: 'Closing Balance', calcRef: 'R9036' }
    ],
    outputFormulas: {
        opening: 'SHIFT(closing, 1)',
        funding: '{fundingAmountRef} × {fundingFlagRef}',
        drawdown: 'MIN({drawdownRef}, opening + funding) × {drawdownFlagRef}',
        release: 'closing × {releaseFlagRef}',
        closing: 'CUMSUM(funding) - CUMSUM(drawdown) - CUMSUM(release)'
    }
}

/**
 * Reserve Account (MRA/DSRA) using Gold Standard CUMSUM pattern.
 * Tracks funding, drawdowns, and releases for reserve accounts.
 *
 * Pattern:
 *   Funding = Amount × Funding Flag (one-time or periodic)
 *   Drawdown = MIN(Drawdown Amount, Available Balance) × Drawdown Flag
 *   Release = Closing Balance × Release Flag (releases remaining balance)
 *   Closing = CUMSUM(Funding) - CUMSUM(Drawdown) - CUMSUM(Release)
 *   Opening = Prior Closing (CUMSUM - X pattern)
 */
export function calculate(inputs, arrayLength, context) {
    const {
        fundingAmountRef = null,
        fundingFlagRef = null,
        drawdownRef = null,
        drawdownFlagRef = null,
        releaseFlagRef = null
    } = inputs

    // Initialize outputs
    const outputs = {
        opening: new Array(arrayLength).fill(0),
        funding: new Array(arrayLength).fill(0),
        drawdown: new Array(arrayLength).fill(0),
        release: new Array(arrayLength).fill(0),
        closing: new Array(arrayLength).fill(0)
    }

    // Get funding amount array
    const fundingAmountArray = fundingAmountRef && context[fundingAmountRef]
        ? context[fundingAmountRef]
        : new Array(arrayLength).fill(0)

    // Get funding flag array
    const fundingFlag = fundingFlagRef && context[fundingFlagRef]
        ? context[fundingFlagRef]
        : new Array(arrayLength).fill(0)

    // Get drawdown amount array (optional)
    const drawdownArray = drawdownRef && context[drawdownRef]
        ? context[drawdownRef]
        : new Array(arrayLength).fill(0)

    // Get drawdown flag array (optional)
    const drawdownFlag = drawdownFlagRef && context[drawdownFlagRef]
        ? context[drawdownFlagRef]
        : new Array(arrayLength).fill(1)

    // Get release flag array (optional)
    const releaseFlag = releaseFlagRef && context[releaseFlagRef]
        ? context[releaseFlagRef]
        : new Array(arrayLength).fill(0)

    // Step 1: Calculate funding for each period
    const fundingAmounts = new Array(arrayLength).fill(0)
    for (let i = 0; i < arrayLength; i++) {
        const isFunding = fundingFlag[i] === 1 || fundingFlag[i] === true
        if (isFunding) {
            // Use cumulative if it's a .End flag (get total), otherwise use period value
            fundingAmounts[i] = fundingAmountArray[i] || 0
        }
    }

    // Step 2: Calculate cumulative funding
    const cumFunding = new Array(arrayLength).fill(0)
    let runningFunding = 0
    for (let i = 0; i < arrayLength; i++) {
        runningFunding += fundingAmounts[i]
        cumFunding[i] = runningFunding
    }

    // Step 3: Calculate drawdowns and releases (need to process sequentially due to balance constraint)
    // But we can still use CUMSUM pattern for the final values
    const drawdownAmounts = new Array(arrayLength).fill(0)
    const releaseAmounts = new Array(arrayLength).fill(0)
    const cumDrawdown = new Array(arrayLength).fill(0)
    const cumRelease = new Array(arrayLength).fill(0)
    let runningDrawdown = 0
    let runningRelease = 0

    for (let i = 0; i < arrayLength; i++) {
        const isDrawdown = drawdownFlag[i] === 1 || drawdownFlag[i] === true
        const isRelease = releaseFlag[i] === 1 || releaseFlag[i] === true

        // Available balance before drawdown/release
        const availableBalance = cumFunding[i] - runningDrawdown - runningRelease

        // Drawdown = MIN(requested amount, available balance) during drawdown flag
        if (isDrawdown && !isRelease) {
            const requestedDrawdown = Math.abs(drawdownArray[i] || 0)
            drawdownAmounts[i] = Math.min(requestedDrawdown, Math.max(0, availableBalance))
        }

        runningDrawdown += drawdownAmounts[i]
        cumDrawdown[i] = runningDrawdown

        // Release = remaining balance when release flag is active
        if (isRelease) {
            const balanceBeforeRelease = cumFunding[i] - runningDrawdown - runningRelease
            releaseAmounts[i] = Math.max(0, balanceBeforeRelease)
        }

        runningRelease += releaseAmounts[i]
        cumRelease[i] = runningRelease
    }

    // Step 4: Calculate period values from cumulative (Gold Standard pattern)
    for (let i = 0; i < arrayLength; i++) {
        outputs.funding[i] = fundingAmounts[i]
        outputs.drawdown[i] = drawdownAmounts[i]
        outputs.release[i] = releaseAmounts[i]

        // Closing = CumFunding - CumDrawdown - CumRelease
        outputs.closing[i] = cumFunding[i] - cumDrawdown[i] - cumRelease[i]

        // Opening = Prior Closing (CUMSUM - X pattern)
        const priorCumFunding = i > 0 ? cumFunding[i - 1] : 0
        const priorCumDrawdown = i > 0 ? cumDrawdown[i - 1] : 0
        const priorCumRelease = i > 0 ? cumRelease[i - 1] : 0
        outputs.opening[i] = priorCumFunding - priorCumDrawdown - priorCumRelease
    }

    return outputs
}
