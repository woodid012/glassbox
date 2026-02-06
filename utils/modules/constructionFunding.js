// Construction Funding Module — template metadata and drawdown formula sets
// Solver removed: this module is fullyConverted (all outputs are R9000+ calcs)

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
        // Note: R9024 (Period Cost) is NOT swapped — it always uses the net-period-cost formula
        9099: "MAXVAL(R9023) - M1.1",
        9020: "MAX(0, CUMSUM(R9024) - R9099) - MAX(0, CUMSUM(R9024) - R9024 - R9099)",
        9021: "(R9024 - R9020) * R229",
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
        { key: 'uncapped_debt_drawdown', label: 'Period Cost', calcRef: 'R9024' },
        { key: 'equity_target', label: 'Equity Target (ex-IDC)', calcRef: 'R9099' }
    ],
    outputFormulas: {}
}

