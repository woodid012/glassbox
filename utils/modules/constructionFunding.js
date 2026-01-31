// Construction Funding Module
import { resolveModuleInput, resolveModuleInputArray } from './shared'

/**
 * Formula sets for each drawdown method.
 * When the user toggles drawdownMethod, these formulas are swapped
 * into the corresponding calculation IDs in model-calculations.json.
 */
export const DRAWDOWN_FORMULAS = {
    prorata: {
        // Pro-rata: debt draws at gearing % of each period's cost, equity fills the gap
        9024: "MAX(0, R9023 - PREVVAL(R9023)) * C1.19 / 100 * F1",
        9020: "MIN(R9024, MAX(0, M1.1 - (CUMSUM(R9024) - R9024))) * F1",
        9021: "MAX(0, R9017 - PREVVAL(R9017)) * F1",
        9017: "R9015 - R9016",
    },
    equity_first: {
        // Equity-first: draw all equity first (up to target), then debt
        9024: "M4.1",
        9099: "MAXVAL(R9023) - M1.1",
        9020: "MAX(0, CUMSUM(R9024) - R9099) - MAX(0, CUMSUM(R9024) - R9024 - R9099)",
        9021: "(R9024 - R9020) * R9999",
        9017: "CUMSUM(R9021) + CUMSUM(R9022)",
    }
}

export const TEMPLATE = {
    type: 'construction_funding',
    name: 'Construction Funding',
    description: 'Construction funding waterfall with IDC equity-funded',
    inputs: [
        { key: 'constructionCostsRef', label: 'Construction Costs (cumulative)', type: 'reference', refType: 'any', required: true },
        { key: 'gstPaidRef', label: 'GST Paid (cumulative)', type: 'reference', refType: 'any', required: false },
        { key: 'feesRef', label: 'Fees/Other Uses (cumulative)', type: 'reference', refType: 'any', required: false },
        { key: 'gstAmountRef', label: 'GST Amount (period)', type: 'reference', refType: 'any', required: false },
        { key: 'gstReceivedRef', label: 'GST Received (period)', type: 'reference', refType: 'any', required: false },
        { key: 'sizedDebtRef', label: 'Sized Debt (from Debt Module)', type: 'reference', refType: 'any', required: true },
        { key: 'gearingCapPct', label: 'Gearing Cap (%)', type: 'number', required: true, default: 65 },
        { key: 'interestRatePct', label: 'IDC Interest Rate (%)', type: 'number', required: true, default: 5 },
        { key: 'drawdownMethod', label: 'Drawdown Method', type: 'select', options: [
            { value: 'prorata', label: 'Pro-rata' },
            { value: 'equity_first', label: 'Equity First' }
        ], default: 'prorata' },
        { key: 'constructionFlagRef', label: 'Construction Flag', type: 'reference', refType: 'flag', required: true }
    ],
    outputs: [
        { key: 'net_period_cost', label: 'Net Period Cost (GST-netted)', type: 'flow', isSolver: true }
    ],
    partiallyConverted: true,
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
        { key: 'uncapped_debt_drawdown', label: 'Period Cost', calcRef: 'R9024' },
        { key: 'equity_target', label: 'Equity Target (ex-IDC)', calcRef: 'R9099' }
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
 * Construction Funding solver: computes net period costs after GST refunds.
 *
 * This is a single forward pass (not iterative) since all inputs are known:
 *   - Period capex (V1 * F1)
 *   - GST paid (R9007) and GST received/refunded (R9010)
 *   - Fees delta (R219[i] - R219[i-1])
 *   - GST receivable delta (R61[i] - R61[i-1])
 *
 * The net period cost = capex + GST paid - GST received + fees delta
 * This nets out the 1-period GST timing difference so construction cash ≈ 0.
 */
export function calculate(inputs, arrayLength, context) {
    const {
        constructionCostsRef = null,
        feesRef = null,
        gstAmountRef = null,
        gstReceivedRef = null,
        constructionFlagRef = null
    } = inputs

    // Initialize output
    const net_period_cost = new Array(arrayLength).fill(0)

    // Get input arrays from context
    const constructionFlag = constructionFlagRef && context[constructionFlagRef]
        ? context[constructionFlagRef]
        : new Array(arrayLength).fill(0)

    const gstAmount = gstAmountRef && context[gstAmountRef]
        ? context[gstAmountRef]
        : new Array(arrayLength).fill(0)

    const gstReceived = gstReceivedRef && context[gstReceivedRef]
        ? context[gstReceivedRef]
        : new Array(arrayLength).fill(0)

    const fees = feesRef && context[feesRef]
        ? context[feesRef]
        : new Array(arrayLength).fill(0)

    // Get V1 (period capex) from context
    const v1 = context['V1'] || new Array(arrayLength).fill(0)

    // Find construction period
    const consStart = constructionFlag.findIndex(f => f === 1 || f === true)
    if (consStart < 0) return { net_period_cost }

    for (let i = 0; i < arrayLength; i++) {
        const isCons = constructionFlag[i] === 1 || constructionFlag[i] === true
        if (!isCons) continue

        // Period capex (ex-GST)
        const capex = v1[i] || 0

        // GST: paid this period minus refund received this period
        const gstPaidThisPeriod = gstAmount[i] || 0
        const gstReceivedThisPeriod = gstReceived[i] || 0

        // Fees delta (cumulative fees change)
        const feesDelta = (fees[i] || 0) - (i > 0 ? (fees[i - 1] || 0) : 0)

        // Net period cost = capex + net GST outflow + fees change
        net_period_cost[i] = Math.max(0, capex + gstPaidThisPeriod - gstReceivedThisPeriod + feesDelta)
    }

    return { net_period_cost }
}
