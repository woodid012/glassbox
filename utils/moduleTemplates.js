// Preset Modules for Financial Modeling
// Each module takes inputs and generates multiple output time series

/**
 * Universal input resolver for module calculations.
 * Converts any input (number, string, or reference) to a numeric value.
 * Use this for ALL numeric module inputs to ensure refs like "C1.21" work.
 *
 * @param {any} value - The input value (number, string number, or reference)
 * @param {Object} context - The reference map containing resolved arrays
 * @param {number} defaultVal - Fallback value if resolution fails
 * @returns {number} The resolved numeric value
 */
function resolveModuleInput(value, context, defaultVal = 0) {
    // Already a number - use directly
    if (typeof value === 'number') return value

    if (typeof value === 'string') {
        // Check if it's a reference (C1.X, R123, etc.) in context
        if (context && context[value]) {
            const arr = context[value]
            // Get first non-zero value (constants are same across periods)
            return arr.find(v => v !== 0) || arr[0] || defaultVal
        }
        // Try parsing as a number string ("5" -> 5)
        const parsed = parseFloat(value)
        return isNaN(parsed) ? defaultVal : parsed
    }

    return defaultVal
}

/**
 * Resolves a module input to a full array (for time-series inputs like interest rates).
 * If the input is a number, returns an array filled with that value.
 * If the input is a reference, returns the referenced array.
 *
 * @param {any} value - The input value (number, string number, or reference)
 * @param {Object} context - The reference map containing resolved arrays
 * @param {number} arrayLength - The expected length of the output array
 * @param {number} defaultVal - Fallback value if resolution fails
 * @returns {number[]} The resolved array of values
 */
function resolveModuleInputArray(value, context, arrayLength, defaultVal = 0) {
    // If it's a reference string and exists in context, return the array
    if (typeof value === 'string' && context && context[value]) {
        return context[value]
    }

    // If it's a number or can be parsed as one, return a filled array
    const numValue = typeof value === 'number' ? value : parseFloat(value)
    if (!isNaN(numValue)) {
        return new Array(arrayLength).fill(numValue)
    }

    // Default: return array filled with default value
    return new Array(arrayLength).fill(defaultVal)
}

/**
 * Module Template Structure:
 * {
 *   type: 'iterative_debt_sizing',
 *   name: 'Iterative Debt Sizing (DSCR Sculpted)',
 *   description: 'Binary search to find optimal debt with DSCR-sculpted repayments',
 *   inputs: [
 *     { key: 'cfadsRef', label: 'CFADS Reference', type: 'reference', refType: 'any', required: true },
 *     ...
 *   ],
 *   outputs: [
 *     { key: 'sized_debt', label: 'Sized Debt Amount', type: 'stock' },
 *     ...
 *   ]
 * }
 */

export const MODULE_TEMPLATES = {
    construction_funding: {
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
        outputs: [
            { key: 'total_uses_incl_idc', label: 'Total Funding Requirements', type: 'stock' },
            { key: 'senior_debt', label: 'Senior Debt', type: 'stock' },
            { key: 'equity', label: 'Equity', type: 'stock' },
            { key: 'gearing_pct', label: 'Gearing %', type: 'stock' },
            { key: 'cumulative_idc', label: 'IDC', type: 'stock' },
            { key: 'debt_drawdown', label: 'Debt Drawdown', type: 'flow' },
            { key: 'equity_drawdown', label: 'Equity Drawdown', type: 'flow' },
            { key: 'idc', label: 'IDC (Period)', type: 'flow' },
            { key: 'total_uses_ex_idc', label: 'Total Uses (ex-IDC)', type: 'stock' }
        ],
        // Auditable formula descriptions for each output
        // These use input keys as placeholders: {constructionCostsRef}, {gearingCapPct}, etc.
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
    },
    reserve_account: {
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
        outputs: [
            { key: 'opening', label: 'Opening Balance', type: 'stock_start' },
            { key: 'funding', label: 'Funding', type: 'flow' },
            { key: 'drawdown', label: 'Drawdown', type: 'flow' },
            { key: 'release', label: 'Release', type: 'flow' },
            { key: 'closing', label: 'Closing Balance', type: 'stock' }
        ],
        outputFormulas: {
            opening: 'SHIFT(closing, 1)',
            funding: '{fundingAmountRef} × {fundingFlagRef}',
            drawdown: 'MIN({drawdownRef}, opening + funding) × {drawdownFlagRef}',
            release: 'closing × {releaseFlagRef}',
            closing: 'CUMSUM(funding) - CUMSUM(drawdown) - CUMSUM(release)'
        }
    },
    mra_reserve: {
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
    },
    gst_receivable: {
        type: 'gst_receivable',
        name: 'GST Paid/Received',
        description: 'GST ledger with configurable receipt delay using CUMSUM pattern',
        inputs: [
            { key: 'gstBaseRef', label: 'GST Base Amount (e.g., Capex)', type: 'reference', refType: 'any', required: true },
            { key: 'activeFlagRef', label: 'Active Period Flag', type: 'reference', refType: 'flag', required: true },
            { key: 'gstRatePct', label: 'GST Rate (%)', type: 'number', required: true, default: 10 },
            { key: 'receiptDelayMonths', label: 'Receipt Delay (months)', type: 'number', required: false, default: 1 },
            { key: 'constructionFlagRef', label: 'Construction Period Flag', type: 'reference', refType: 'flag', required: false },
            { key: 'operationsFlagRef', label: 'Operations Period Flag', type: 'reference', refType: 'flag', required: false }
        ],
        outputs: [
            { key: 'gst_base', label: 'GST Base Amount', type: 'flow' },
            { key: 'gst_amount', label: 'GST Amount', type: 'flow' },
            { key: 'gst_paid', label: 'GST Paid (Outflow)', type: 'flow' },
            { key: 'receivable_opening', label: 'GST Receivable - Opening', type: 'stock_start' },
            { key: 'gst_received', label: 'GST Received (Inflow)', type: 'flow' },
            { key: 'receivable_closing', label: 'GST Receivable - Closing', type: 'stock' },
            { key: 'net_gst_cashflow', label: 'Net GST Cash Flow', type: 'flow' },
            { key: 'gst_received_construction', label: 'GST Received (Construction)', type: 'flow' },
            { key: 'gst_received_operations', label: 'GST Received (Operations)', type: 'flow' }
        ],
        outputFormulas: {
            gst_base: '{gstBaseRef}',
            gst_amount: '{gstBaseRef} × {gstRatePct}/100',
            gst_paid: '-gst_amount × {activeFlagRef}',
            receivable_opening: 'SHIFT(receivable_closing, 1)',
            gst_received: 'SHIFT(CUMSUM(-gst_paid), {receiptDelayMonths}) - SHIFT(CUMSUM(-gst_paid), {receiptDelayMonths}+1)',
            receivable_closing: 'CUMSUM(-gst_paid) - CUMSUM(gst_received)',
            net_gst_cashflow: 'gst_paid + gst_received',
            gst_received_construction: 'gst_received × {constructionFlagRef}',
            gst_received_operations: 'gst_received × {operationsFlagRef}'
        }
    },
    tax_losses: {
        type: 'tax_losses',
        name: 'Tax & Tax Losses',
        description: 'Tax calculation with loss carry-forward using CUMSUM pattern',
        inputs: [
            { key: 'taxableIncomeRef', label: 'Taxable Income Before Losses', type: 'reference', refType: 'any', required: true },
            { key: 'opsFlagRef', label: 'Operations Flag', type: 'reference', refType: 'flag', required: true },
            { key: 'taxRatePct', label: 'Tax Rate (%)', type: 'number', required: true, default: 30 }
        ],
        outputs: [
            { key: 'taxable_income_before_losses', label: 'Taxable Income Before Losses', type: 'flow' },
            { key: 'losses_opening', label: 'Tax Losses - Opening', type: 'stock_start' },
            { key: 'losses_generated', label: 'Tax Losses - Generated', type: 'flow' },
            { key: 'losses_utilised', label: 'Tax Losses - Utilised', type: 'flow' },
            { key: 'losses_closing', label: 'Tax Losses - Closing', type: 'stock' },
            { key: 'net_taxable_income', label: 'Net Taxable Income', type: 'flow' },
            { key: 'tax_payable', label: 'Tax Payable', type: 'flow' }
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
    },
    depreciation_amortization: {
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
        outputs: [
            { key: 'opening', label: 'Opening Book Value', type: 'stock_start' },
            { key: 'addition', label: 'Capital Addition', type: 'flow' },
            { key: 'depreciation', label: 'Depreciation Expense', type: 'flow' },
            { key: 'accumulated', label: 'Accumulated Depreciation', type: 'stock' },
            { key: 'closing', label: 'Closing Book Value', type: 'stock' }
        ],
        outputFormulas: {
            opening: 'MAX(0, (CUMSUM({additionsRef}) - {additionsRef}) - CUMSUM({additionsRef}) / {lifeYears} / T.MiY × (CUMSUM({opsFlagRef}) - {opsFlagRef}))',
            addition: 'CUMSUM({additionsRef}) × {opsFlagRef}.Start',
            depreciation: 'MIN(opening + addition, CUMSUM({additionsRef}) / {lifeYears} / T.MiY) × {opsFlagRef}',
            accumulated: 'CUMSUM(depreciation)',
            closing: 'MAX(0, CUMSUM({additionsRef}) - CUMSUM({additionsRef}) / {lifeYears} / T.MiY × CUMSUM({opsFlagRef}))'
        }
    },
    distributions: {
        type: 'distributions',
        name: 'Distributions',
        description: 'Shareholder distributions waterfall with RE test, lock-up covenants, and share capital repayment',
        inputs: [
            { key: 'availableCashRef', label: 'Available Cashflow (pre-dist)', type: 'reference', refType: 'any', required: true },
            { key: 'npatRef', label: 'NPAT', type: 'reference', refType: 'any', required: true },
            { key: 'equityContributedRef', label: 'Equity Contributed', type: 'reference', refType: 'any', required: true },
            { key: 'minCashReserve', label: 'Minimum Cash Reserve', type: 'number_or_ref', required: false, default: 0 },
            { key: 'opsFlagRef', label: 'Operations Flag', type: 'reference', refType: 'flag', required: true },
            { key: 'withholdingTaxPct', label: 'Withholding Tax %', type: 'number_or_ref', required: false, default: 0 },
            { key: 'lockupActive', label: 'Lock-up Active', type: 'boolean', default: true },
            { key: 'lockupReleasePeriods', label: 'Release After (Qtrs)', type: 'number_or_ref', default: 2 },
            { key: 'dscrTestActive', label: 'DSCR Test Active', type: 'boolean', default: true },
            { key: 'dscrRef', label: 'DSCR (periodic)', type: 'reference', refType: 'any', required: false },
            { key: 'dscrThreshold', label: 'DSCR Threshold', type: 'number_or_ref', default: 1.15 },
            { key: 'adscrTestActive', label: 'Historical ADSCR Test Active', type: 'boolean', default: true },
            { key: 'cfadsRef', label: 'Total CFADS', type: 'reference', refType: 'any', required: false },
            { key: 'debtServiceRef', label: 'Total Debt Service', type: 'reference', refType: 'any', required: false },
            { key: 'adscrThreshold', label: 'ADSCR Threshold', type: 'number_or_ref', default: 1.15 },
            { key: 'dsraTestActive', label: 'DSRA Fully Funded Test', type: 'boolean', default: false },
            { key: 'dsraBalanceRef', label: 'DSRA Balance', type: 'reference', refType: 'any', required: false },
            { key: 'dsraTargetRef', label: 'DSRA Target', type: 'reference', refType: 'any', required: false },
            { key: 'quarterEndFlagRef', label: 'Quarter End Flag', type: 'reference', refType: 'flag', required: false }
        ],
        outputs: [
            { key: 'cash_available', label: 'Cash Available for Dist', type: 'flow', section: 'Cash Available' },
            { key: 're_opening', label: 'RE - Opening', type: 'stock_start', section: 'Retained Earnings' },
            { key: 're_npat', label: 'RE - NPAT', type: 'flow', section: 'Retained Earnings' },
            { key: 're_test', label: 'RE Test', type: 'stock', section: 'Retained Earnings' },
            { key: 'npat_test', label: 'NPAT Test', type: 'stock', section: 'Retained Earnings' },
            { key: 'dividend_paid', label: 'Dividend Paid', type: 'flow', section: 'Retained Earnings' },
            { key: 're_movement', label: 'RE - Movement', type: 'flow', section: 'Retained Earnings' },
            { key: 're_closing', label: 'RE - Closing', type: 'stock', section: 'Retained Earnings' },
            { key: 'sc_opening', label: 'SC - Opening', type: 'stock_start', section: 'Share Capital' },
            { key: 'sc_cash_available', label: 'Post-SC Cash Available', type: 'flow', section: 'Share Capital' },
            { key: 'sc_repayment', label: 'SC - Repayment', type: 'flow', section: 'Share Capital' },
            { key: 'sc_closing', label: 'SC - Closing', type: 'stock', section: 'Share Capital' },
            { key: 'total_distributions', label: 'Total Distributions', type: 'flow', section: 'Totals' },
            { key: 'withholding_tax', label: 'Withholding Tax', type: 'flow', section: 'Totals' },
            { key: 'net_to_equity', label: 'Net to Equity', type: 'flow', section: 'Totals' },
            { key: 'dscr_test', label: 'DSCR Test', type: 'stock', section: 'Lock-up' },
            { key: 'adscr_test', label: 'ADSCR Test', type: 'stock', section: 'Lock-up' },
            { key: 'dsra_test', label: 'DSRA Test', type: 'stock', section: 'Lock-up' },
            { key: 'all_tests_pass', label: 'All Tests Pass', type: 'stock', section: 'Lock-up' },
            { key: 'consec_pass_qtrs', label: 'Consecutive Pass Qtrs', type: 'stock', section: 'Lock-up' },
            { key: 'lockup_active', label: 'Lock-up Active', type: 'stock', section: 'Lock-up' }
        ],
        outputFormulas: {
            cash_available: 'MAX(0, CUMSUM({availableCashRef}) - {minCashReserve}) × {opsFlagRef} - prior cumulative',
            re_opening: 'CUMSUM(NPAT) - NPAT - (CUMSUM(dividends) - dividends)',
            re_npat: '{npatRef}',
            re_test: '(re_opening + NPAT) > 0 ? 1 : 0',
            npat_test: 'NPAT > 0 ? 1 : 0',
            dividend_paid: 'MAX(0, incremental_cash) × opsFlag × re_test × npat_test',
            re_movement: 'NPAT - dividend_paid',
            re_closing: 'CUMSUM(re_movement)',
            sc_opening: '{equityContributedRef} (constant)',
            sc_cash_available: 'MAX(0, incremental_cash - dividend_paid)',
            sc_repayment: 'MIN(CUMSUM(sc_cash_available), sc_opening) - prior cumulative',
            sc_closing: 'sc_opening - cumulative_sc_repayment',
            total_distributions: 'dividend_paid + sc_repayment',
            withholding_tax: 'total_distributions × {withholdingTaxPct}/100',
            net_to_equity: 'total_distributions - withholding_tax',
            dscr_test: '{dscrRef} >= {dscrThreshold} ? 1 : 0 (at quarter end)',
            adscr_test: 'trailing_12m_CFADS / trailing_12m_DS >= {adscrThreshold} ? 1 : 0',
            dsra_test: '{dsraBalanceRef} >= {dsraTargetRef} ? 1 : 0',
            all_tests_pass: 'dscr_test × adscr_test × dsra_test (at quarter end)',
            consec_pass_qtrs: 'consecutive quarter ends where all_tests_pass = 1',
            lockup_active: 'consec_pass_qtrs < {lockupReleasePeriods} ? 1 : 0'
        }
    },
    dsrf: {
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
            commitment_fee: 'facility_limit × effective_margin / 100 × commitmentFeePct / 100 / T.MiY × F2',
            refi_fees: 'facility_limit × refiFeePct / 100 at each refi date',
            effective_margin: 'Steps from base margin to refi margin at each date',
            total_dsrf_fees: 'establishment_fee + commitment_fee + refi_fees',
            total_dsrf_fees_cumulative: 'CUMSUM(total_dsrf_fees)',
            ds_plus_dsrf: 'debtService + total_dsrf_fees',
            adjusted_dscr: 'CFADS / ds_plus_dsrf'
        }
    },
    iterative_debt_sizing: {
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
}

// Calculate module outputs
export function calculateModuleOutputs(moduleInstance, arrayLength, context) {
    const template = MODULE_TEMPLATES[moduleInstance.moduleType]
    if (!template) return {}

    const inputs = moduleInstance.inputs || {}
    const outputs = {}

    // Initialize output arrays
    template.outputs.forEach(output => {
        outputs[output.key] = new Array(arrayLength).fill(0)
    })

    switch (moduleInstance.moduleType) {
        case 'construction_funding':
            return calculateConstructionFunding(inputs, arrayLength, context)
        case 'reserve_account':
            return calculateReserveAccount(inputs, arrayLength, context)
        case 'mra_reserve':
            return calculateMraReserve(inputs, arrayLength, context)
        case 'gst_receivable':
            return calculateGstReceivable(inputs, arrayLength, context)
        case 'tax_losses':
            return calculateTaxLosses(inputs, arrayLength, context)
        case 'depreciation_amortization':
            return calculateDepreciationAmortization(inputs, arrayLength, context)
        case 'iterative_debt_sizing':
            return calculateIterativeDebtSizing(inputs, arrayLength, context)
        case 'distributions':
            return calculateDistributions(inputs, arrayLength, context)
        case 'dsrf':
            return calculateDsrf(inputs, arrayLength, context)
        default:
            return outputs
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
function calculateConstructionFunding(inputs, arrayLength, context) {
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
function calculateReserveAccount(inputs, arrayLength, context) {
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
function calculateMraReserve(inputs, arrayLength, context) {
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

/**
 * GST Paid/Received using Gold Standard CUMSUM pattern.
 * Tracks GST paid on a base amount with configurable receipt delay.
 *
 * Pattern:
 *   GST Amount = Base * Rate
 *   GST Paid = -GST Amount (outflow during active period)
 *   Cumulative Paid = CUMSUM(GST Paid)
 *   Cumulative Received = SHIFT(Cumulative Paid, delay)
 *   GST Received = Cumulative Received - Prior Cumulative Received
 *   Receivable Closing = Cumulative Paid - Cumulative Received
 *   Receivable Opening = Prior Receivable Closing
 */
function calculateGstReceivable(inputs, arrayLength, context) {
    const {
        gstBaseRef = null,
        activeFlagRef = null,
        gstRatePct = 10,
        receiptDelayMonths = 1,
        constructionFlagRef = null,
        operationsFlagRef = null
    } = inputs

    // Initialize outputs
    const outputs = {
        gst_base: new Array(arrayLength).fill(0),
        gst_amount: new Array(arrayLength).fill(0),
        gst_paid: new Array(arrayLength).fill(0),
        receivable_opening: new Array(arrayLength).fill(0),
        gst_received: new Array(arrayLength).fill(0),
        receivable_closing: new Array(arrayLength).fill(0),
        net_gst_cashflow: new Array(arrayLength).fill(0),
        gst_received_construction: new Array(arrayLength).fill(0),
        gst_received_operations: new Array(arrayLength).fill(0)
    }

    // Get base amount array
    const baseArray = gstBaseRef && context[gstBaseRef]
        ? context[gstBaseRef]
        : new Array(arrayLength).fill(0)

    // Get active flag array
    const activeFlag = activeFlagRef && context[activeFlagRef]
        ? context[activeFlagRef]
        : new Array(arrayLength).fill(1)

    // GST rate and delay - support both direct values and references using shared resolver
    const gstRate = resolveModuleInput(gstRatePct, context, 10) / 100
    const delay = Math.round(resolveModuleInput(receiptDelayMonths, context, 1))

    // Step 1: Calculate GST amounts and paid for each period
    const gstPaidAmounts = new Array(arrayLength).fill(0)

    for (let i = 0; i < arrayLength; i++) {
        const isActive = activeFlag[i] === 1 || activeFlag[i] === true
        const base = baseArray[i] || 0

        outputs.gst_base[i] = base

        if (isActive && base !== 0) {
            const gstAmount = base * gstRate
            outputs.gst_amount[i] = gstAmount
            outputs.gst_paid[i] = -gstAmount  // Outflow (negative)
            gstPaidAmounts[i] = gstAmount     // Positive for tracking
        }
    }

    // Step 2: Calculate cumulative GST paid (CUMSUM pattern)
    const cumPaid = new Array(arrayLength).fill(0)
    let runningPaid = 0
    for (let i = 0; i < arrayLength; i++) {
        runningPaid += gstPaidAmounts[i]
        cumPaid[i] = runningPaid
    }

    // Step 3: Calculate cumulative received = SHIFT(cumPaid, delay)
    const cumReceived = new Array(arrayLength).fill(0)
    for (let i = delay; i < arrayLength; i++) {
        cumReceived[i] = cumPaid[i - delay]
    }

    // Step 4: Calculate period values from cumulative (Gold Standard pattern)
    for (let i = 0; i < arrayLength; i++) {
        // Received = CumReceived[i] - CumReceived[i-1]
        const priorCumReceived = i > 0 ? cumReceived[i - 1] : 0
        outputs.gst_received[i] = cumReceived[i] - priorCumReceived

        // Receivable Closing = CumPaid - CumReceived
        outputs.receivable_closing[i] = cumPaid[i] - cumReceived[i]

        // Receivable Opening = Prior Receivable Closing (CUMSUM - X pattern)
        const priorCumPaid = i > 0 ? cumPaid[i - 1] : 0
        outputs.receivable_opening[i] = priorCumPaid - priorCumReceived

        // Net GST Cash Flow = GST Paid + GST Received (paid is negative, received is positive)
        outputs.net_gst_cashflow[i] = outputs.gst_paid[i] + outputs.gst_received[i]
    }

    // Split GST received by construction/operations flags
    const constructionFlag = constructionFlagRef && context[constructionFlagRef]
        ? context[constructionFlagRef]
        : null
    const operationsFlag = operationsFlagRef && context[operationsFlagRef]
        ? context[operationsFlagRef]
        : null

    if (constructionFlag || operationsFlag) {
        for (let i = 0; i < arrayLength; i++) {
            if (constructionFlag) {
                outputs.gst_received_construction[i] = outputs.gst_received[i] * (constructionFlag[i] || 0)
            }
            if (operationsFlag) {
                outputs.gst_received_operations[i] = outputs.gst_received[i] * (operationsFlag[i] || 0)
            }
        }
    }

    return outputs
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
function calculateTaxLosses(inputs, arrayLength, context) {
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
function calculateDepreciationAmortization(inputs, arrayLength, context) {
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

/**
 * Check if a month index is a period end for the given frequency.
 * @param {number} monthIdx - 0-based month index from model start
 * @param {string} debtPeriod - 'M', 'Q', or 'Y'
 * @param {object} timeline - Timeline object with month array
 * @returns {boolean}
 */
function isPeriodEnd(monthIdx, debtPeriod, timeline) {
    if (debtPeriod === 'M') return true // Every month is a period end

    const month = timeline?.month?.[monthIdx] || ((monthIdx % 12) + 1)

    if (debtPeriod === 'Q') {
        return month === 3 || month === 6 || month === 9 || month === 12
    }
    if (debtPeriod === 'Y') {
        return month === 12
    }
    return true
}

/**
 * Get number of months per debt service period.
 */
function getMonthsPerPeriod(debtPeriod) {
    if (debtPeriod === 'Q') return 3
    if (debtPeriod === 'Y') return 12
    return 1 // Monthly
}

/**
 * Generate a capacity-sculpted debt schedule using pre-calculated debt service capacity.
 * Capacity = (Contracted CFADS / Contracted DSCR) + (Merchant CFADS / Merchant DSCR)
 * This allows different DSCR targets for different revenue streams.
 *
 * @param {number} totalDebt - The debt amount to test
 * @param {Array} debtServiceCapacity - Pre-calculated max debt service per period
 * @param {Array} totalCfads - Total CFADS (for DSCR reporting)
 * @param {number} start - Debt start period index
 * @param {number} end - Debt end period index
 * @param {Array<number>} interestRateArray - Interest rate (%) for each period (time-series)
 * @param {number} len - Array length
 * @param {string} debtPeriod - 'M', 'Q', or 'Y'
 * @param {Object} timeline - Timeline context for period end detection
 */
function generateCapacitySchedule(totalDebt, debtServiceCapacity, totalCfads, start, end, interestRateArray, len, debtPeriod, timeline) {
    const outputs = {
        sized_debt: new Array(len).fill(0),
        opening_balance: new Array(len).fill(0),
        interest_payment: new Array(len).fill(0),
        principal_payment: new Array(len).fill(0),
        debt_service: new Array(len).fill(0),
        closing_balance: new Array(len).fill(0),
        period_dscr: new Array(len).fill(0),
        cumulative_principal: new Array(len).fill(0),
        fullyRepaid: false,
        dscrBreached: false,
        hasNegativePrincipal: false
    }

    if (totalDebt <= 0 || start < 0 || end < start) {
        return outputs
    }

    // Set sized debt as constant for all periods (for reporting)
    outputs.sized_debt.fill(totalDebt)

    let balance = totalDebt
    let dscrBreached = false
    let hasNegativePrincipal = false
    let cumulativePrincipal = 0

    // Track accrued values within a debt service period
    let accruedInterest = 0
    let accruedCapacity = 0
    let accruedCfads = 0

    for (let i = start; i <= end && i < len; i++) {
        outputs.opening_balance[i] = balance

        // Accrue interest monthly (on opening balance of each month)
        // Use period-specific rate from time-series array
        const monthlyRate = (interestRateArray[i] || 0) / 100 / 12
        const monthlyInterest = balance * monthlyRate
        accruedInterest += monthlyInterest

        // Accrue debt service capacity and CFADS
        accruedCapacity += debtServiceCapacity[i] || 0
        accruedCfads += totalCfads[i] || 0

        // Check if this is a payment period end
        const isPaymentPeriod = isPeriodEnd(i, debtPeriod, timeline) || i === end

        if (isPaymentPeriod) {
            // Calculate remaining debt service periods
            let remainingPeriods = 0
            for (let j = i; j <= end; j++) {
                if (isPeriodEnd(j, debtPeriod, timeline) || j === end) {
                    remainingPeriods++
                }
            }

            // Interest payment = accrued interest for this period
            const interest = accruedInterest
            outputs.interest_payment[i] = interest

            // Max debt service from capacity constraint (already DSCR-adjusted)
            const maxDebtService = accruedCapacity

            // Minimum principal to fully repay within tenor
            const minPrincipalForTenor = remainingPeriods > 0 ? balance / remainingPeriods : balance
            const maxPrincipalFromCapacity = Math.max(0, maxDebtService - interest)

            let principal
            if (i === end) {
                // Final period: pay off remaining balance
                principal = balance
            } else if (maxPrincipalFromCapacity >= minPrincipalForTenor) {
                // Capacity allows adequate principal - use minimum to stretch debt to full tenor
                principal = minPrincipalForTenor
            } else {
                // Capacity constraint limits principal - pay what DSCR allows
                principal = maxPrincipalFromCapacity
                if (principal < minPrincipalForTenor * 0.9) {
                    dscrBreached = true // Can't meet amortization schedule within tenor
                }
            }

            principal = Math.min(principal, balance)
            if (principal < 0) hasNegativePrincipal = true

            outputs.principal_payment[i] = principal
            outputs.debt_service[i] = interest + principal

            // Blended DSCR for this period = Total CFADS / Debt Service
            outputs.period_dscr[i] = outputs.debt_service[i] > 0
                ? accruedCfads / outputs.debt_service[i]
                : 0

            // Update balance
            balance -= principal
            cumulativePrincipal += principal

            // Reset accumulators for next period
            accruedInterest = 0
            accruedCapacity = 0
            accruedCfads = 0
        }

        outputs.closing_balance[i] = Math.max(0, balance)
        outputs.cumulative_principal[i] = cumulativePrincipal
    }

    // Carry forward cumulative principal after debt ends
    for (let i = end + 1; i < len; i++) {
        outputs.cumulative_principal[i] = cumulativePrincipal
    }

    outputs.fullyRepaid = balance < 0.001
    outputs.dscrBreached = dscrBreached
    outputs.hasNegativePrincipal = hasNegativePrincipal

    return outputs
}

/**
 * Generate a DSCR-sculpted debt schedule for a given debt amount.
 * Supports Monthly, Quarterly, or Yearly debt service periods.
 * Returns schedule arrays and viability flags.
 * @deprecated Use generateCapacitySchedule for new implementations
 */
function generateDSCRSchedule(totalDebt, cfads, start, end, monthlyRate, targetDSCR, len, debtPeriod, timeline) {
    const outputs = {
        sized_debt: new Array(len).fill(0),
        opening_balance: new Array(len).fill(0),
        interest_payment: new Array(len).fill(0),
        principal_payment: new Array(len).fill(0),
        debt_service: new Array(len).fill(0),
        closing_balance: new Array(len).fill(0),
        period_dscr: new Array(len).fill(0),
        cumulative_principal: new Array(len).fill(0),
        fullyRepaid: false,
        dscrBreached: false,
        hasNegativePrincipal: false
    }

    if (totalDebt <= 0 || start < 0 || end < start) {
        return outputs
    }

    // Set sized debt as constant for all periods (for reporting)
    outputs.sized_debt.fill(totalDebt)

    const monthsPerPeriod = getMonthsPerPeriod(debtPeriod)
    let balance = totalDebt
    let dscrBreached = false
    let hasNegativePrincipal = false
    let cumulativePrincipal = 0

    // Track accrued values within a debt service period
    let accruedInterest = 0
    let accruedCfads = 0
    let periodStartBalance = balance

    for (let i = start; i <= end && i < len; i++) {
        outputs.opening_balance[i] = balance

        // Accrue interest monthly (on opening balance of each month)
        const monthlyInterest = balance * monthlyRate
        accruedInterest += monthlyInterest

        // Accrue CFADS
        accruedCfads += cfads[i] || 0

        // Check if this is a payment period end
        const isPaymentPeriod = isPeriodEnd(i, debtPeriod, timeline) || i === end

        if (isPaymentPeriod) {
            // Calculate remaining debt service periods
            let remainingPeriods = 0
            for (let j = i; j <= end; j++) {
                if (isPeriodEnd(j, debtPeriod, timeline) || j === end) {
                    remainingPeriods++
                }
            }

            // Interest payment = accrued interest for this period
            const interest = accruedInterest
            outputs.interest_payment[i] = interest

            // Max debt service from DSCR constraint (using accrued CFADS)
            const maxDebtService = targetDSCR > 0 ? accruedCfads / targetDSCR : 0

            // Minimum principal to fully repay within tenor
            const minPrincipalForTenor = remainingPeriods > 0 ? balance / remainingPeriods : balance
            const maxPrincipalFromDSCR = Math.max(0, maxDebtService - interest)

            let principal
            if (i === end) {
                // Final period: pay off remaining balance
                principal = balance
            } else if (maxPrincipalFromDSCR >= minPrincipalForTenor) {
                // DSCR allows adequate principal payment
                principal = maxPrincipalFromDSCR
            } else {
                // DSCR constraint limits principal
                principal = maxPrincipalFromDSCR
                if (principal < minPrincipalForTenor * 0.9) {
                    dscrBreached = true // Can't meet amortization schedule
                }
            }

            principal = Math.min(principal, balance)
            if (principal < 0) hasNegativePrincipal = true

            outputs.principal_payment[i] = principal
            outputs.debt_service[i] = interest + principal

            // DSCR for this period (using accrued CFADS and total debt service)
            outputs.period_dscr[i] = outputs.debt_service[i] > 0
                ? accruedCfads / outputs.debt_service[i]
                : 0

            // Update balance
            balance -= principal
            cumulativePrincipal += principal

            // Reset accumulators for next period
            accruedInterest = 0
            accruedCfads = 0
            periodStartBalance = balance
        }

        outputs.closing_balance[i] = Math.max(0, balance)
        outputs.cumulative_principal[i] = cumulativePrincipal
    }

    // Carry forward cumulative principal after debt ends
    for (let i = end + 1; i < len; i++) {
        outputs.cumulative_principal[i] = cumulativePrincipal
    }

    outputs.fullyRepaid = balance < 0.001
    outputs.dscrBreached = dscrBreached
    outputs.hasNegativePrincipal = hasNegativePrincipal

    return outputs
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
function calculateIterativeDebtSizing(inputs, arrayLength, context) {
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

/**
 * Distributions module using Gold Standard CUMSUM pattern.
 * Handles shareholder distributions waterfall:
 * 1. Calculate cash available above minimum reserve
 * 2. Apply RE test (must have positive cumulative RE)
 * 3. Apply NPAT test (must have positive period NPAT)
 * 4. Pay dividends if tests pass
 * 5. Return share capital from remaining cash
 * 6. Apply withholding tax
 *
 * Key insight: Use CUMSUM patterns to avoid circular dependencies.
 * Available cash = CUMSUM(pre-dist cash) - prior distributions - minimum reserve
 */
function calculateDistributions(inputs, arrayLength, context) {
    const {
        availableCashRef = null,
        npatRef = null,
        equityContributedRef = null,
        minCashReserve = 0,
        opsFlagRef = null,
        withholdingTaxPct = 0,
        // Lock-up inputs
        lockupActive = true,
        lockupReleasePeriods = 2,
        dscrTestActive = true,
        dscrRef = null,
        dscrThreshold = 1.15,
        adscrTestActive = true,
        cfadsRef = null,
        debtServiceRef = null,
        adscrThreshold = 1.15,
        dsraTestActive = false,
        dsraBalanceRef = null,
        dsraTargetRef = null,
        quarterEndFlagRef = null
    } = inputs

    // Initialize outputs
    const outputs = {
        cash_available: new Array(arrayLength).fill(0),
        re_opening: new Array(arrayLength).fill(0),
        re_npat: new Array(arrayLength).fill(0),
        re_test: new Array(arrayLength).fill(0),
        npat_test: new Array(arrayLength).fill(0),
        dividend_paid: new Array(arrayLength).fill(0),
        re_movement: new Array(arrayLength).fill(0),
        re_closing: new Array(arrayLength).fill(0),
        sc_opening: new Array(arrayLength).fill(0),
        sc_cash_available: new Array(arrayLength).fill(0),
        sc_repayment: new Array(arrayLength).fill(0),
        sc_closing: new Array(arrayLength).fill(0),
        total_distributions: new Array(arrayLength).fill(0),
        withholding_tax: new Array(arrayLength).fill(0),
        net_to_equity: new Array(arrayLength).fill(0),
        // Lock-up outputs
        dscr_test: new Array(arrayLength).fill(0),
        adscr_test: new Array(arrayLength).fill(0),
        dsra_test: new Array(arrayLength).fill(0),
        all_tests_pass: new Array(arrayLength).fill(0),
        consec_pass_qtrs: new Array(arrayLength).fill(0),
        lockup_active: new Array(arrayLength).fill(0)
    }

    // Get input arrays
    const availableCash = availableCashRef && context[availableCashRef]
        ? context[availableCashRef]
        : new Array(arrayLength).fill(0)

    const npat = npatRef && context[npatRef]
        ? context[npatRef]
        : new Array(arrayLength).fill(0)

    const equityContributed = equityContributedRef && context[equityContributedRef]
        ? context[equityContributedRef]
        : new Array(arrayLength).fill(0)

    const opsFlag = opsFlagRef && context[opsFlagRef]
        ? context[opsFlagRef]
        : new Array(arrayLength).fill(0)

    // Resolve numeric inputs - support both direct values and references
    const minCash = resolveModuleInput(minCashReserve, context, 0)
    const taxRate = resolveModuleInput(withholdingTaxPct, context, 0) / 100

    // Lock-up numeric inputs
    const lockupEnabled = lockupActive === true || lockupActive === 'true'
    const releasePeriods = Math.round(resolveModuleInput(lockupReleasePeriods, context, 2))
    const dscrTestOn = dscrTestActive === true || dscrTestActive === 'true'
    const adscrTestOn = adscrTestActive === true || adscrTestActive === 'true'
    const dsraTestOn = dsraTestActive === true || dsraTestActive === 'true'
    const dscrThresh = resolveModuleInput(dscrThreshold, context, 1.15)
    const adscrThresh = resolveModuleInput(adscrThreshold, context, 1.15)

    // Lock-up reference arrays
    const dscr = dscrRef && context[dscrRef]
        ? context[dscrRef]
        : new Array(arrayLength).fill(0)

    const cfads = cfadsRef && context[cfadsRef]
        ? context[cfadsRef]
        : new Array(arrayLength).fill(0)

    const debtService = debtServiceRef && context[debtServiceRef]
        ? context[debtServiceRef]
        : new Array(arrayLength).fill(0)

    const dsraBalance = dsraBalanceRef && context[dsraBalanceRef]
        ? context[dsraBalanceRef]
        : new Array(arrayLength).fill(0)

    const dsraTarget = dsraTargetRef && context[dsraTargetRef]
        ? context[dsraTargetRef]
        : new Array(arrayLength).fill(0)

    const qeFlag = quarterEndFlagRef && context[quarterEndFlagRef]
        ? context[quarterEndFlagRef]
        : new Array(arrayLength).fill(0)

    // Get total equity contributed (constant from Construction Funding M4.7)
    // This is a cumulative value - get the final value
    let totalEquityContributed = 0
    for (let i = arrayLength - 1; i >= 0; i--) {
        if (equityContributed[i] !== 0) {
            totalEquityContributed = equityContributed[i]
            break
        }
    }
    // If not found at end, check if it's a constant array
    if (totalEquityContributed === 0 && equityContributed[0] !== 0) {
        totalEquityContributed = equityContributed[0]
    }

    // ============================================================
    // LOCK-UP: Compute covenant tests and lock-up state
    // ============================================================

    // Historical ADSCR: trailing 12-month CFADS / trailing 12-month Debt Service
    const adscr = new Array(arrayLength).fill(0)
    let trailingCfads = 0
    let trailingDs = 0
    for (let i = 0; i < arrayLength; i++) {
        trailingCfads += cfads[i] || 0
        trailingDs += debtService[i] || 0
        if (i >= 12) {
            trailingCfads -= cfads[i - 12] || 0
            trailingDs -= debtService[i - 12] || 0
        }
        adscr[i] = trailingDs > 0.0001 ? trailingCfads / trailingDs : 99
    }

    // Evaluate covenant tests and consecutive pass counter
    let consecPassing = 0
    let currentLockup = lockupEnabled ? 1 : 0  // Start locked if enabled

    for (let i = 0; i < arrayLength; i++) {
        const isOps = opsFlag[i] === 1 || opsFlag[i] === true
        const isQE = qeFlag[i] === 1 || qeFlag[i] === true

        // Individual test results (1 = pass, 0 = fail)
        // DSCR test: periodic DSCR >= threshold
        const dscrOk = !dscrTestOn || (dscr[i] >= dscrThresh)
        outputs.dscr_test[i] = (isOps && dscrTestOn) ? (dscrOk ? 1 : 0) : (isOps ? 1 : 0)

        // ADSCR test: trailing 12m ratio >= threshold
        const adscrOk = !adscrTestOn || (adscr[i] >= adscrThresh)
        outputs.adscr_test[i] = (isOps && adscrTestOn) ? (adscrOk ? 1 : 0) : (isOps ? 1 : 0)

        // DSRA test: balance >= target
        const dsraOk = !dsraTestOn || (dsraBalance[i] >= dsraTarget[i] - 0.0001)
        outputs.dsra_test[i] = (isOps && dsraTestOn) ? (dsraOk ? 1 : 0) : (isOps ? 1 : 0)

        // Evaluate consecutive pass counter at quarter ends during operations
        if (isQE && isOps) {
            const allPass = dscrOk && adscrOk && dsraOk
            outputs.all_tests_pass[i] = allPass ? 1 : 0
            if (allPass) {
                consecPassing++
            } else {
                consecPassing = 0
            }
            currentLockup = (lockupEnabled && consecPassing < releasePeriods) ? 1 : 0
        } else if (isOps) {
            // Between quarter ends, carry forward last QE evaluation
            outputs.all_tests_pass[i] = (i > 0 ? outputs.all_tests_pass[i - 1] : 0)
        }

        outputs.consec_pass_qtrs[i] = consecPassing
        outputs.lockup_active[i] = lockupEnabled ? currentLockup : 0
    }

    // ============================================================
    // STEP 1: Calculate cumulative pre-distribution cash
    // ============================================================
    const cumPreDistCash = new Array(arrayLength).fill(0)
    let runningCash = 0
    for (let i = 0; i < arrayLength; i++) {
        runningCash += availableCash[i] || 0
        cumPreDistCash[i] = runningCash
    }

    // ============================================================
    // STEP 2: Calculate RE components using CUMSUM
    // RE Closing = CUMSUM(NPAT - Dividends)
    // We need to iterate because dividends depend on RE test
    // ============================================================
    const cumNpat = new Array(arrayLength).fill(0)
    let runningNpat = 0
    for (let i = 0; i < arrayLength; i++) {
        runningNpat += npat[i] || 0
        cumNpat[i] = runningNpat
    }

    // ============================================================
    // STEP 3: Calculate distributions sequentially
    // Standard project finance waterfall:
    //   1. SC repayment FIRST (return of capital - tax efficient)
    //   2. Dividends from remaining cash (capped at NPAT, subject to RE/NPAT tests)
    //   Both gated by lock-up: blocked when lockup_active = 1
    // ============================================================
    let cumDividends = 0
    let cumScRepayment = 0
    let cumCashPosition = 0  // Running cash balance

    for (let i = 0; i < arrayLength; i++) {
        const isOps = opsFlag[i] === 1 || opsFlag[i] === true
        const isLocked = outputs.lockup_active[i] === 1
        const periodNpat = npat[i] || 0
        const periodCash = availableCash[i] || 0

        // RE - NPAT for this period
        outputs.re_npat[i] = periodNpat

        // RE - Opening = Cumulative NPAT before this period - Cumulative Dividends before this period
        const priorCumNpat = i > 0 ? cumNpat[i - 1] : 0
        const priorCumDividends = cumDividends
        outputs.re_opening[i] = priorCumNpat - priorCumDividends

        // RE Test: 1 if (Opening RE + current NPAT) > 0
        const reForTest = outputs.re_opening[i] + periodNpat
        outputs.re_test[i] = reForTest > 0 ? 1 : 0

        // NPAT Test: 1 if current period NPAT > 0
        outputs.npat_test[i] = periodNpat > 0 ? 1 : 0

        // Add this period's cash to position
        cumCashPosition += periodCash

        // Cash available for distribution = cash above minimum reserve
        const cashForDist = isOps ? Math.max(0, cumCashPosition - minCash) : 0
        outputs.cash_available[i] = cashForDist

        // ============================================================
        // Share Capital Repayment FIRST (return of capital)
        // SC gets priority on available cash until fully repaid
        // Blocked when lock-up is active
        // ============================================================
        outputs.sc_opening[i] = totalEquityContributed

        // SC repayment capped at remaining equity to return
        const scRemainingEquity = Math.max(0, totalEquityContributed - cumScRepayment)
        const periodScRepayment = isLocked ? 0 : Math.min(cashForDist, scRemainingEquity)
        outputs.sc_repayment[i] = periodScRepayment

        // Update cumulative SC repayment and reduce cash position
        cumScRepayment += periodScRepayment
        cumCashPosition -= periodScRepayment

        // SC Closing = Total contributed - cumulative repaid
        outputs.sc_closing[i] = Math.max(0, totalEquityContributed - cumScRepayment)

        // ============================================================
        // Dividends SECOND (from remaining cash after SC repayment)
        // Subject to RE test, NPAT test, and lock-up gate
        // ============================================================

        // Cash available for dividends = remaining cash above minimum (after SC)
        const postScCash = isOps ? Math.max(0, cumCashPosition - minCash) : 0
        outputs.sc_cash_available[i] = postScCash  // Repurpose as "post-SC cash available"

        // Dividend = MIN(available cash after SC, NPAT) when tests pass and not locked
        let periodDividend = 0
        if (isOps && !isLocked && outputs.re_test[i] === 1 && outputs.npat_test[i] === 1) {
            periodDividend = Math.min(postScCash, Math.max(0, periodNpat))
        }
        outputs.dividend_paid[i] = periodDividend

        // RE Movement = NPAT - Dividends
        outputs.re_movement[i] = periodNpat - periodDividend

        // Update cumulative dividends and reduce cash position
        cumDividends += periodDividend
        cumCashPosition -= periodDividend

        // RE Closing = CUMSUM(RE Movement)
        outputs.re_closing[i] = (i > 0 ? outputs.re_closing[i - 1] : 0) + outputs.re_movement[i]

        // ============================================================
        // Totals and Tax
        // ============================================================
        outputs.total_distributions[i] = outputs.dividend_paid[i] + outputs.sc_repayment[i]
        outputs.withholding_tax[i] = outputs.total_distributions[i] * taxRate
        outputs.net_to_equity[i] = outputs.total_distributions[i] - outputs.withholding_tax[i]
    }

    return outputs
}

// Get available module output references for a module instance
// Uses numeric indices: M1.1, M1.2, etc.
export function getModuleOutputRefs(moduleInstance) {
    const template = MODULE_TEMPLATES[moduleInstance.moduleType]
    if (!template) return []

    return template.outputs.map((output, index) => ({
        ref: `M${moduleInstance.id}.${index + 1}`,
        key: output.key,
        label: `${moduleInstance.name}: ${output.label}`,
        type: output.type
    }))
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
 *   Commitment fee = ongoing monthly = limit * effective_margin * commitPct / 12
 *   Refi fees = one-time at each refinancing date on facility limit
 *
 * Effective margin steps from base margin to each refi margin at refi dates.
 */
function calculateDsrf(inputs, arrayLength, context) {
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

    // Step 5: Calculate commitment fee (monthly during operations)
    // commitment_fee = facility_limit * effective_margin% * commitFeePctOfMargin / 12
    for (let i = 0; i < arrayLength; i++) {
        const isOps = opsFlag[i] === 1 || opsFlag[i] === true
        if (isOps && outputs.facility_limit[i] > 0) {
            outputs.commitment_fee[i] = outputs.facility_limit[i] *
                (outputs.effective_margin[i] / 100) *
                commitFeePctOfMargin / 12
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

// Get output key from numeric index for a module type
export function getOutputKeyByIndex(moduleType, index) {
    const template = MODULE_TEMPLATES[moduleType]
    if (!template || index < 1 || index > template.outputs.length) return null
    return template.outputs[index - 1].key
}

// Get output index from key for a module type
export function getOutputIndexByKey(moduleType, key) {
    const template = MODULE_TEMPLATES[moduleType]
    if (!template) return null
    const index = template.outputs.findIndex(o => o.key === key)
    return index >= 0 ? index + 1 : null
}
