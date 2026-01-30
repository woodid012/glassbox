// Construction Funding Module
import { resolveModuleInput, resolveModuleInputArray } from './shared'

export const TEMPLATE = {
    type: 'construction_funding',
    name: 'Construction Funding',
    description: 'Construction funding waterfall with IDC equity-funded',
    inputs: [
        { key: 'constructionCostsRef', label: 'Construction Costs (cumulative)', type: 'reference', refType: 'any', required: true },
        { key: 'gstPaidRef', label: 'GST Paid (cumulative)', type: 'reference', refType: 'any', required: false },
        { key: 'feesRef', label: 'Fees/Other Uses (cumulative)', type: 'reference', refType: 'any', required: false },
        { key: 'sizedDebtRef', label: 'Sized Debt (from Debt Module)', type: 'reference', refType: 'any', required: true },
        { key: 'gearingCapPct', label: 'Gearing Cap (%)', type: 'number', required: true, default: 65 },
        { key: 'interestRatePct', label: 'IDC Interest Rate (%)', type: 'number', required: true, default: 5 },
        { key: 'drawdownMethod', label: 'Drawdown Method', type: 'select', options: [
            { value: 'prorata', label: 'Pro-rata' },
            { value: 'equity_first', label: 'Equity First' }
        ], default: 'prorata' },
        { key: 'constructionFlagRef', label: 'Construction Flag', type: 'reference', refType: 'flag', required: true }
    ],
    outputs: [],
    fullyConverted: true,
    convertedOutputs: [
        { key: 'total_funding', label: 'Total Funding Requirements', calcRef: 'R9015' },
        { key: 'senior_debt', label: 'Senior Debt', calcRef: 'R9016' },
        { key: 'equity', label: 'Equity', calcRef: 'R9017' },
        { key: 'gearing_pct', label: 'Gearing %', calcRef: 'R9018' },
        { key: 'idc', label: 'IDC', calcRef: 'R9019' },
        { key: 'debt_drawdown', label: 'Debt Drawdown', calcRef: 'R9020' },
        { key: 'equity_drawdown', label: 'Equity Drawdown', calcRef: 'R9021' },
        { key: 'idc_period', label: 'IDC (Period)', calcRef: 'R9022' },
        { key: 'total_uses_ex_idc', label: 'Total Uses (ex-IDC)', calcRef: 'R9023' },
        { key: 'uncapped_debt_drawdown', label: 'Uncapped Debt Drawdown', calcRef: 'R9024' }
    ],
    outputFormulas: {
        total_uses_ex_idc: '{constructionCostsRef} + CUMSUM({gstPaidRef}) + CUMSUM({feesRef})',
        senior_debt: 'MIN({sizedDebtRef}, total_uses_ex_idc × {gearingCapPct}/100)',
        debt_drawdown: 'senior_debt - SHIFT(senior_debt, 1)',
        gearing_pct: 'senior_debt / total_uses_ex_idc × 100',
        idc: 'SHIFT(senior_debt, 1) × {interestRatePct}/100 / T.MiY × {constructionFlagRef}',
        cumulative_idc: 'CUMSUM(idc)',
        total_uses_incl_idc: 'total_uses_ex_idc + cumulative_idc',
        equity: 'total_uses_incl_idc - senior_debt',
        equity_drawdown: 'equity - SHIFT(equity, 1)'
    }
}

/**
 * Construction Funding using Gold Standard CUMSUM pattern.
 * Calculates debt/equity split with IDC equity-funded.
 *
 * Key Formula:
 *   Senior Debt = MIN(Sized Debt from DSCR module, Total Uses × Gearing Cap)
 *   Drawdown is PRO-RATA at gearing cap % (debt draws at gearing %, equity fills the gap)
 *   If sized debt is reached, remaining costs funded 100% by equity
 *   IDC = calculated on debt drawdown during construction (equity-funded)
 *   Equity = Total Uses (incl IDC) - Senior Debt
 *
 * This breaks the circular dependency because:
 *   - Debt sizing uses Total Uses EX-IDC
 *   - IDC is calculated AFTER debt is sized
 *   - IDC is funded by equity, not added to debt
 */
export function calculate(inputs, arrayLength, context) {
    const {
        constructionCostsRef = null,
        gstPaidRef = null,
        feesRef = null,
        sizedDebtRef = null,
        gearingCapPct = 65,
        interestRatePct = 5,
        drawdownMethod = 'prorata',
        constructionFlagRef = null
    } = inputs

    // Initialize outputs
    const outputs = {
        total_uses_ex_idc: new Array(arrayLength).fill(0),
        senior_debt: new Array(arrayLength).fill(0),
        debt_drawdown: new Array(arrayLength).fill(0),
        gearing_pct: new Array(arrayLength).fill(0),
        idc: new Array(arrayLength).fill(0),
        cumulative_idc: new Array(arrayLength).fill(0),
        total_uses_incl_idc: new Array(arrayLength).fill(0),
        equity: new Array(arrayLength).fill(0),
        equity_drawdown: new Array(arrayLength).fill(0)
    }

    // Get input arrays
    const constructionCosts = constructionCostsRef && context[constructionCostsRef]
        ? context[constructionCostsRef]
        : new Array(arrayLength).fill(0)

    const gstPaid = gstPaidRef && context[gstPaidRef]
        ? context[gstPaidRef]
        : new Array(arrayLength).fill(0)

    const fees = feesRef && context[feesRef]
        ? context[feesRef]
        : new Array(arrayLength).fill(0)

    const sizedDebt = sizedDebtRef && context[sizedDebtRef]
        ? context[sizedDebtRef]
        : new Array(arrayLength).fill(0)

    const constructionFlag = constructionFlagRef && context[constructionFlagRef]
        ? context[constructionFlagRef]
        : new Array(arrayLength).fill(0)

    // Rates - support both direct values and references using shared resolver
    const gearingCap = resolveModuleInput(gearingCapPct, context, 0) / 100
    // Interest rate as time-series array (supports time-varying rates like R171)
    const interestRateArray = resolveModuleInputArray(interestRatePct, context, arrayLength, 0)

    // Find construction period
    const consStart = constructionFlag.findIndex(f => f === 1 || f === true)
    if (consStart < 0) return outputs

    let consEnd = consStart
    for (let i = arrayLength - 1; i >= consStart; i--) {
        if (constructionFlag[i] === 1 || constructionFlag[i] === true) {
            consEnd = i
            break
        }
    }

    // Get the sized debt amount (constant from debt module)
    // Use the value at construction end (when debt is sized)
    const sizedDebtAmount = sizedDebt[consEnd] || sizedDebt[0] || 0

    // Step 1: Calculate cumulative uses (ex-IDC) during construction
    for (let i = 0; i < arrayLength; i++) {
        // Cumulative construction costs + GST + fees
        const cumCosts = constructionCosts[i] || 0
        const cumGst = gstPaid[i] || 0
        const cumFees = fees[i] || 0

        outputs.total_uses_ex_idc[i] = cumCosts + cumGst + cumFees
    }

    // Step 2: Calculate max debt = MIN(Sized Debt, Total Uses × Gearing Cap)
    const totalUsesAtEnd = outputs.total_uses_ex_idc[consEnd]
    const maxDebtByGearing = totalUsesAtEnd * gearingCap
    const maxSeniorDebt = Math.min(sizedDebtAmount, maxDebtByGearing)

    // For equity first: calculate total equity requirement
    const totalEquityRequired = totalUsesAtEnd * (1 - gearingCap)

    // Step 3: Calculate debt and equity drawdowns based on method
    let cumDebtDrawdown = 0
    let cumEquityDrawdown = 0
    let cumIDC = 0

    for (let i = 0; i < arrayLength; i++) {
        const isCons = constructionFlag[i] === 1 || constructionFlag[i] === true

        if (isCons) {
            // Period uses = change in cumulative uses
            const priorUses = i > 0 ? outputs.total_uses_ex_idc[i - 1] : 0
            const periodUses = outputs.total_uses_ex_idc[i] - priorUses

            let periodDebt = 0
            let periodEquityBase = 0

            if (drawdownMethod === 'equity_first') {
                // EQUITY FIRST: Draw equity until equity target reached, then debt
                const remainingEquityTarget = Math.max(0, totalEquityRequired - cumEquityDrawdown)
                periodEquityBase = Math.min(periodUses, remainingEquityTarget)

                // Debt fills the remainder, capped at sized debt
                const remainingDebtCapacity = Math.max(0, maxSeniorDebt - cumDebtDrawdown)
                periodDebt = Math.min(periodUses - periodEquityBase, remainingDebtCapacity)
            } else {
                // PRO-RATA: Debt draws at gearing %, equity fills gap
                const targetDebtDraw = periodUses * gearingCap
                const remainingDebtCapacity = Math.max(0, maxSeniorDebt - cumDebtDrawdown)
                periodDebt = Math.min(targetDebtDraw, remainingDebtCapacity)
                periodEquityBase = periodUses - periodDebt
            }

            cumDebtDrawdown += periodDebt
            outputs.debt_drawdown[i] = periodDebt

            // IDC = opening debt balance × monthly rate (period-specific)
            // Opening debt = cumulative drawdown at start of period
            const openingDebt = cumDebtDrawdown - periodDebt
            const monthlyRate = (interestRateArray[i] || 0) / 100 / 12
            const periodIDC = openingDebt * monthlyRate
            cumIDC += periodIDC
            outputs.idc[i] = periodIDC
            outputs.cumulative_idc[i] = cumIDC

            // Equity drawdown = base equity + IDC (equity funds all IDC)
            const periodEquity = periodEquityBase + periodIDC
            cumEquityDrawdown += periodEquity
            outputs.equity_drawdown[i] = periodEquity
        }

        // Update cumulative values
        outputs.senior_debt[i] = cumDebtDrawdown
        outputs.total_uses_incl_idc[i] = outputs.total_uses_ex_idc[i] + cumIDC
        outputs.equity[i] = cumEquityDrawdown

        // Gearing % = actual gearing (Debt / Total Uses ex-IDC)
        const totalUses = outputs.total_uses_ex_idc[i]
        if (drawdownMethod === 'equity_first') {
            // For equity first, show actual gearing (changes over time)
            outputs.gearing_pct[i] = totalUses > 0 ? (cumDebtDrawdown / totalUses) * 100 : 0
        } else {
            // For pro-rata, show constant gearing cap
            outputs.gearing_pct[i] = isCons ? gearingCap * 100 : (i > 0 ? outputs.gearing_pct[i - 1] : 0)
        }
    }

    return outputs
}
