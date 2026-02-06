/**
 * Module Formula Templates
 *
 * Parameterized formula templates for all module types.
 * Each template is a function that takes module inputs and returns
 * output definitions with formulas using placeholder syntax:
 *
 *   $input.X       - replaced with module input value (e.g., "R112")
 *   $input.X.Start - input value + suffix (e.g., "F2.Start")
 *   $self.Y        - R-ref of output Y in this module (e.g., "R125")
 *   $MN.key        - R-ref of output key from module N (cross-module)
 *   M_SELF.N       - this module's own M-ref (solver output, M1 only)
 *
 * Templates are derived from the working model-modules.json formulas.
 */

/**
 * Straight-Line Amortisation / Depreciation
 *
 * Two modes:
 *   one_time  - single capitalised amount at onset (5 calcs)
 *   periodic  - ongoing additions during active period (7 calcs)
 *
 * Uses CUMSUM ledger pattern (no circular deps).
 */
function straightLineAmortisation(inputs) {
  const mode = inputs.additionMode || 'one_time'

  if (mode === 'periodic') {
    return [
      {
        key: 'active_flag',
        name: 'Active Flag',
        type: 'flag',
        formula: '$input.onsetFlag * (CUMSUM($input.activeFlag) > 0)'
      },
      {
        key: 'total_capitalised',
        name: 'Total Capitalised',
        type: 'stock',
        formula: 'CUMSUM($input.periodicAdditionRef)'
      },
      {
        key: 'addition',
        name: 'Addition',
        type: 'flow',
        formula: '$input.periodicAdditionRef'
      },
      {
        key: 'opening',
        name: 'Opening',
        type: 'stock_start',
        formula: 'MAX(0, (CUMSUM($self.addition) - $self.addition) - (CUMSUM($self.addition) - $self.addition) / $input.lifeRef / T.MiY * (CUMSUM($self.active_flag) - $self.active_flag))'
      },
      {
        key: 'expense',
        name: 'Depreciation Expense',
        type: 'flow',
        formula: '$self.opening + $self.addition - $self.closing'
      },
      {
        key: 'accumulated',
        name: 'Accumulated',
        type: 'stock',
        formula: 'CUMSUM($self.expense)'
      },
      {
        key: 'closing',
        name: 'Closing NBV',
        type: 'stock',
        formula: 'MAX(0, CUMSUM($self.addition) - CUMSUM($self.addition) / $input.lifeRef / T.MiY * CUMSUM($self.active_flag))'
      }
    ]
  }

  // one_time mode (default)
  return [
    {
      key: 'addition',
      name: 'Capital Addition',
      type: 'flow',
      formula: 'CUMSUM($input.capitalisedRef) * $input.onsetFlag.Start'
    },
    {
      key: 'opening',
      name: 'Opening Book Value',
      type: 'stock_start',
      formula: 'MAX(0, (CUMSUM($self.addition) - $self.addition) - CUMSUM($input.capitalisedRef) / $input.lifeRef / T.MiY * (CUMSUM($input.onsetFlag) - $input.onsetFlag))'
    },
    {
      key: 'expense',
      name: 'Depreciation Expense',
      type: 'flow',
      formula: 'MIN($self.opening + $self.addition, CUMSUM($input.capitalisedRef) / $input.lifeRef / T.MiY) * $input.onsetFlag'
    },
    {
      key: 'accumulated',
      name: 'Accumulated Depreciation',
      type: 'stock',
      formula: 'CUMSUM($self.expense)'
    },
    {
      key: 'closing',
      name: 'Closing Book Value',
      type: 'stock',
      formula: 'MAX(0, CUMSUM($self.addition) - CUMSUM($input.capitalisedRef) / $input.lifeRef / T.MiY * CUMSUM($input.onsetFlag))'
    }
  ]
}

/**
 * GST Receivable
 *
 * GST ledger with configurable receipt delay using CUMSUM pattern.
 * 9 calcs: gst_base, gst_amount, gst_paid, receivable_opening,
 *          gst_received, receivable_closing, net_gst_cashflow,
 *          gst_received_construction, gst_received_operations
 */
function gstReceivable(inputs) {
  return [
    {
      key: 'gst_base',
      name: 'GST Base Amount',
      type: 'flow',
      formula: '$input.gstBaseRef'
    },
    {
      key: 'gst_amount',
      name: 'GST Amount',
      type: 'flow',
      formula: '$input.gstBaseRef * $input.gstRatePct / 100 * $input.activeFlagRef'
    },
    {
      key: 'gst_paid',
      name: 'GST Paid (Outflow)',
      type: 'flow',
      formula: '-$self.gst_amount'
    },
    {
      key: 'receivable_opening',
      name: 'GST Receivable - Opening',
      type: 'stock_start',
      formula: '(CUMSUM($self.gst_amount) - $self.gst_amount) - (CUMSUM($self.gst_received) - $self.gst_received)'
    },
    {
      key: 'gst_received',
      name: 'GST Received (Inflow)',
      type: 'flow',
      formula: 'PREVVAL($self.gst_amount)'
    },
    {
      key: 'receivable_closing',
      name: 'GST Receivable - Closing',
      type: 'stock',
      formula: 'CUMSUM($self.gst_amount) - CUMSUM($self.gst_received)'
    },
    {
      key: 'net_gst_cashflow',
      name: 'Net GST Cash Flow',
      type: 'flow',
      formula: '$self.gst_paid + $self.gst_received'
    },
    {
      key: 'gst_received_construction',
      name: 'GST Received (Construction)',
      type: 'flow',
      formula: '$self.gst_received * $input.constructionFlagRef'
    },
    {
      key: 'gst_received_operations',
      name: 'GST Received (Operations)',
      type: 'flow',
      formula: '$self.gst_received * $input.operationsFlagRef'
    }
  ]
}

/**
 * Construction Funding (equity_first mode)
 *
 * Construction funding waterfall with IDC.
 * Equity is drawn first, then debt fills the remainder.
 * 11 calcs including equity target using MAXVAL.
 */
function constructionFunding(inputs) {
  // R229 is the Funding Window flag (constructionFlagRef in the model)
  const consFlagExpr = '$input.constructionFlagRef'
  return [
    {
      key: 'period_cost',
      name: 'Period Cost',
      type: 'flow',
      formula: `MAX(0, V1 + $input.gstAmountRef - $input.gstReceivedRef + ($input.feesRef - SHIFT($input.feesRef, 1))) * ${consFlagExpr}`
    },
    {
      key: 'total_uses_ex_idc',
      name: 'Total Uses (ex-IDC)',
      type: 'stock',
      formula: 'CUMSUM($self.period_cost)',
      description: 'Cumulative net period costs (GST-netted)'
    },
    {
      key: 'equity_target',
      name: 'Equity Target (ex-IDC)',
      type: 'stock',
      formula: 'MAXVAL($self.total_uses_ex_idc) - $input.sizedDebtRef',
      description: 'Equity target: total construction uses minus sized debt'
    },
    {
      key: 'debt_drawdown',
      name: 'Debt Drawdown',
      type: 'flow',
      formula: 'MAX(0, CUMSUM($self.period_cost) - $self.equity_target) - MAX(0, CUMSUM($self.period_cost) - $self.period_cost - $self.equity_target)'
    },
    {
      key: 'equity_drawdown',
      name: 'Equity Drawdown',
      type: 'flow',
      formula: `($self.period_cost - $self.debt_drawdown) * ${consFlagExpr}`
    },
    {
      key: 'idc',
      name: 'IDC (Period)',
      type: 'flow',
      formula: `(CUMSUM($self.debt_drawdown) - $self.debt_drawdown) * $input.interestRatePct / 100 / T.MiY * ${consFlagExpr}`
    },
    {
      key: 'senior_debt',
      name: 'Senior Debt',
      type: 'stock',
      formula: 'CUMSUM($self.debt_drawdown)'
    },
    {
      key: 'equity',
      name: 'Equity',
      type: 'stock',
      formula: 'CUMSUM($self.equity_drawdown) + CUMSUM($self.idc)'
    },
    {
      key: 'total_uses_incl_idc',
      name: 'Total Funding Requirements',
      type: 'stock',
      formula: '$self.total_uses_ex_idc + CUMSUM($self.idc)'
    },
    {
      key: 'cumulative_idc',
      name: 'Cumulative IDC',
      type: 'stock',
      formula: 'CUMSUM($self.idc)'
    },
    {
      key: 'gearing_pct',
      name: 'Gearing %',
      type: 'stock',
      formula: '$input.gearingCapPct * (CUMSUM(F1) > 0)'
    }
  ]
}

/**
 * Tax Losses
 *
 * Tax calculation with loss carry-forward using CUMSUM pattern.
 * 7 calcs: taxable_income through tax_payable.
 */
function taxLosses(inputs) {
  return [
    {
      key: 'taxable_income',
      name: 'Taxable Income Before Losses',
      type: 'flow',
      formula: '$input.taxableIncomeRef'
    },
    {
      key: 'losses_opening',
      name: 'Tax Losses - Opening',
      type: 'stock_start',
      formula: 'MAX(0, (CUMSUM($self.losses_generated) - $self.losses_generated) - (CUMSUM($self.losses_utilised) - $self.losses_utilised))'
    },
    {
      key: 'losses_generated',
      name: 'Tax Losses - Generated',
      type: 'flow',
      formula: 'MAX(0, -$self.taxable_income) * $input.opsFlagRef'
    },
    {
      key: 'losses_utilised',
      name: 'Tax Losses - Utilised',
      type: 'flow',
      formula: 'MIN($self.losses_opening, MAX(0, $self.taxable_income)) * $input.opsFlagRef'
    },
    {
      key: 'losses_closing',
      name: 'Tax Losses - Closing',
      type: 'stock',
      formula: 'MAX(0, CUMSUM($self.losses_generated) - CUMSUM($self.losses_utilised))'
    },
    {
      key: 'net_taxable',
      name: 'Net Taxable Income',
      type: 'flow',
      formula: 'MAX(0, $self.taxable_income - $self.losses_utilised) * $input.opsFlagRef'
    },
    {
      key: 'tax_payable',
      name: 'Tax Payable',
      type: 'flow',
      formula: '$self.net_taxable * $input.taxRatePct / 100'
    }
  ]
}

/**
 * Reserve Account
 *
 * Generic reserve account (MRA/DSRA) with funding, drawdown, and release.
 * 5 calcs using CUMSUM pattern.
 */
function reserveAccount(inputs) {
  return [
    {
      key: 'opening',
      name: 'Opening Balance',
      type: 'stock_start',
      formula: 'MAX(0, (CUMSUM($self.funding) - $self.funding) - (CUMSUM($self.drawdown) - $self.drawdown) - (CUMSUM($self.release) - $self.release))'
    },
    {
      key: 'funding',
      name: 'Funding',
      type: 'flow',
      formula: '$input.fundingAmountRef * $input.fundingFlagRef'
    },
    {
      key: 'drawdown',
      name: 'Drawdown',
      type: 'flow',
      formula: 'MIN($input.drawdownRef * $input.indexRef * $input.drawdownFlagRef, MAX(0, CUMSUM($self.funding) - (CUMSUM($input.drawdownRef * $input.indexRef * $input.drawdownFlagRef) - $input.drawdownRef * $input.indexRef * $input.drawdownFlagRef))) * $input.drawdownFlagRef'
    },
    {
      key: 'release',
      name: 'Release',
      type: 'flow',
      formula: 'MAX(0, CUMSUM($self.funding) - CUMSUM($self.drawdown)) * $input.releaseFlagRef'
    },
    {
      key: 'closing',
      name: 'Closing Balance',
      type: 'stock',
      formula: 'MAX(0, CUMSUM($self.funding) - CUMSUM($self.drawdown) - CUMSUM($self.release))'
    }
  ]
}

/**
 * Distributions
 *
 * Full shareholder distributions waterfall with:
 * - Retained earnings test
 * - NPAT test
 * - Share capital repayment
 * - Lock-up covenants (DSCR, ADSCR, DSRA)
 * - Withholding tax
 * 23 calcs total.
 */
function distributions(inputs) {
  return [
    {
      key: 'cash_available',
      name: 'Cash Available for Dist',
      type: 'stock',
      formula: 'MAX(0, CUMSUM($input.availableCashRef) - PREVSUM($self.total_distributions) - $input.minCashReserve) * $input.opsFlagRef'
    },
    {
      key: 're_opening',
      name: 'RE - Opening',
      type: 'stock_start',
      formula: 'PREVSUM($self.re_movement)'
    },
    {
      key: 're_npat',
      name: 'RE - NPAT',
      type: 'flow',
      formula: '$input.npatRef'
    },
    {
      key: 're_test',
      name: 'RE Test',
      type: 'stock',
      formula: '($self.re_opening + $self.re_npat > 0)'
    },
    {
      key: 'npat_test',
      name: 'NPAT Test',
      type: 'stock',
      formula: '($self.re_npat > 0)'
    },
    {
      key: 'dividend_paid',
      name: 'Dividend Paid',
      type: 'flow',
      formula: 'MIN($self.sc_cash_available, MAX(0, $self.re_npat)) * $input.opsFlagRef * $self.re_test * $self.npat_test * (1 - $self.lockup_active)'
    },
    {
      key: 're_movement',
      name: 'RE - Movement',
      type: 'flow',
      formula: '$self.re_npat - $self.dividend_paid'
    },
    {
      key: 're_closing',
      name: 'RE - Closing',
      type: 'stock',
      formula: 'PREVSUM($self.re_movement) + $self.re_movement'
    },
    {
      key: 'sc_opening',
      name: 'SC - Opening',
      type: 'stock_start',
      formula: '$input.equityContributedRef'
    },
    {
      key: 'sc_cash_available',
      name: 'Post-SC Cash Available',
      type: 'stock',
      formula: 'MAX(0, $self.cash_available - $self.sc_repayment)'
    },
    {
      key: 'sc_repayment',
      name: 'SC - Repayment',
      type: 'flow',
      formula: 'MIN($self.cash_available, MAX(0, $self.sc_opening - PREVSUM($self.sc_repayment))) * $input.opsFlagRef * (1 - $self.lockup_active)'
    },
    {
      key: 'sc_closing',
      name: 'SC - Closing',
      type: 'stock',
      formula: 'MAX(0, $self.sc_opening - CUMSUM($self.sc_repayment))'
    },
    {
      key: 'total_distributions',
      name: 'Total Distributions',
      type: 'flow',
      formula: '$self.dividend_paid + $self.sc_repayment'
    },
    {
      key: 'withholding_tax',
      name: 'Withholding Tax',
      type: 'flow',
      formula: '$self.total_distributions * $input.withholdingTaxPct / 100'
    },
    {
      key: 'net_to_equity',
      name: 'Net to Equity',
      type: 'flow',
      formula: '$self.total_distributions - $self.withholding_tax'
    },
    {
      key: 'dscr_test',
      name: 'DSCR Test',
      type: 'stock',
      formula: 'MAX(($input.dscrRef >= $input.dscrThreshold), (ABS($input.debtServiceRef) < 0.001)) * $input.opsFlagRef'
    },
    {
      key: 'adscr_test',
      name: 'ADSCR Test',
      type: 'stock',
      formula: '$input.opsFlagRef'
    },
    {
      key: 'dsra_test',
      name: 'DSRA Test',
      type: 'stock',
      formula: '$input.opsFlagRef'
    },
    {
      key: 'all_tests_pass',
      name: 'All Tests Pass',
      type: 'stock',
      formula: '(PREVVAL($self.all_tests_pass) * (1 - $input.quarterEndFlagRef) + $self.dscr_test * $self.adscr_test * $self.dsra_test * $input.quarterEndFlagRef) * $input.opsFlagRef + PREVVAL($self.all_tests_pass) * (1 - $input.opsFlagRef) * (CUMSUM($input.opsFlagRef) > 0)'
    },
    {
      key: 'consec_pass_qtrs',
      name: 'Consecutive Pass Qtrs',
      type: 'stock',
      formula: 'PREVVAL($self.consec_pass_qtrs) * ($self.all_tests_pass * $input.quarterEndFlagRef + (1 - $input.quarterEndFlagRef)) + $self.all_tests_pass * $input.quarterEndFlagRef'
    },
    {
      key: 'lockup_active',
      name: 'Lock-up Active',
      type: 'stock',
      formula: 'MAX(($self.consec_pass_qtrs < $input.lockupReleasePeriods) * $input.opsFlagRef, $input.constructionFlagRef)'
    },
    {
      key: 'cumulative_distributions',
      name: 'Cumulative Distributions',
      type: 'stock',
      formula: 'CUMSUM($self.total_distributions)'
    },
    {
      key: 'cumulative_sc_repayment',
      name: 'Cumulative SC Repayment',
      type: 'stock',
      formula: 'CUMSUM($self.sc_repayment)'
    }
  ]
}

/**
 * Iterative Debt Sizing
 *
 * DSCR-sculpted debt with quarterly payment patterns.
 * First output (sized_debt) has isSolver: true and formula "0" (binary search fills it).
 * 14 calcs total including payment period flag and accruals.
 */
function iterativeDebtSizing(inputs) {
  return [
    {
      key: 'sized_debt',
      name: 'Sized Debt',
      type: 'flow',
      formula: '0',
      isSolver: true,
      description: 'Binary search solver output — replaced at runtime'
    },
    {
      key: 'ds_capacity_monthly',
      name: 'DS Capacity (Monthly)',
      type: 'flow',
      formula: '($input.contractedCfadsRef / $input.contractedDSCR + $input.merchantCfadsRef / $input.merchantDSCR) * $input.debtFlagRef'
    },
    {
      key: 'monthly_interest',
      name: 'Monthly Interest',
      type: 'flow',
      formula: '$self.opening_balance * $input.interestRatePct / 100 / T.MiY * $input.debtFlagRef'
    },
    {
      key: 'accrued_interest',
      name: 'Accrued Interest (Intra-Qtr)',
      type: 'stock',
      formula: '(PREVVAL($self.accrued_interest) * (1 - PREVVAL(T.QE)) + $self.monthly_interest) * $input.debtFlagRef'
    },
    {
      key: 'opening_balance',
      name: 'Opening Balance',
      type: 'stock_start',
      formula: 'PREVVAL($self.closing_balance) + M_SELF.1 * $input.debtFlagRef.Start'
    },
    {
      key: 'accrued_capacity',
      name: 'Accrued Capacity (Intra-Qtr)',
      type: 'stock',
      formula: '(PREVVAL($self.accrued_capacity) * (1 - PREVVAL(T.QE)) + $self.ds_capacity_monthly) * $input.debtFlagRef'
    },
    {
      key: 'remaining_periods',
      name: 'Remaining Payment Periods',
      type: 'stock',
      formula: 'IF($input.debtFlagRef.Start, $input.tenorYears * T.QiY, MAX(1, PREVVAL($self.remaining_periods) - PREVVAL($self.payment_period_flag))) * $input.debtFlagRef'
    },
    {
      key: 'interest_payment',
      name: 'Interest Payment',
      type: 'flow',
      formula: '$self.accrued_interest * $self.payment_period_flag * $input.debtFlagRef'
    },
    {
      key: 'principal_payment',
      name: 'Principal Payment',
      type: 'flow',
      formula: 'MIN(MAX(0, $self.accrued_capacity - $self.interest_payment), $self.opening_balance / MAX(1, $self.remaining_periods)) * $self.payment_period_flag * $input.debtFlagRef',
      description: 'Level principal amortization (balance / remaining periods), capped at DSCR capacity'
    },
    {
      key: 'debt_service',
      name: 'Debt Service',
      type: 'flow',
      formula: '$self.interest_payment + $self.principal_payment'
    },
    {
      key: 'accrued_cfads',
      name: 'Accrued CFADS (Intra-Qtr)',
      type: 'stock',
      formula: '(PREVVAL($self.accrued_cfads) * (1 - PREVVAL(T.QE)) + $input.contractedCfadsRef + $input.merchantCfadsRef) * $input.debtFlagRef'
    },
    {
      key: 'closing_balance',
      name: 'Closing Balance',
      type: 'stock',
      formula: 'MAX(0, $self.opening_balance - $self.principal_payment)'
    },
    {
      key: 'period_dscr',
      name: 'Period DSCR',
      type: 'stock',
      formula: '$self.accrued_cfads / MAX($self.debt_service, 0.0001) * $self.payment_period_flag * $input.debtFlagRef'
    },
    {
      key: 'cumulative_principal',
      name: 'Cumulative Principal',
      type: 'stock',
      formula: 'CUMSUM($self.principal_payment)'
    },
    {
      key: 'payment_period_flag',
      name: 'Payment Period Flag',
      type: 'flag',
      formula: '(T.QE + $input.debtFlagRef.End - T.QE * $input.debtFlagRef.End) * $input.debtFlagRef'
    }
  ]
}

/**
 * DSRF (Debt Service Reserve Facility)
 *
 * Forward-looking facility with refinancing fees and margin step-ups.
 * Recalculation triggered at ops start and each refi date.
 * 10 calcs.
 *
 * Special: requires $input.refiFlagsExpr which is a pre-built expression
 * like "F13 + F14 + F15 + F16" representing refinancing dates.
 */
function dsrf(inputs) {
  return [
    {
      key: 'recalc_trigger',
      name: 'Recalc Trigger',
      type: 'flag',
      formula: '$input.operationsFlagRef.Start + $input.refiFlagsExpr',
      description: '1 at ops start and each refinancing date'
    },
    {
      key: 'facility_limit',
      name: 'Facility Limit',
      type: 'stock',
      formula: 'PREVVAL($self.facility_limit) * (1 - $self.recalc_trigger) + FWDSUM(ABS($input.debtServiceRef), $input.facilityMonthsRef) * $self.recalc_trigger * $input.operationsFlagRef',
      description: 'Forward-looking sum of next N months DS, recalculated at ops start and refi dates'
    },
    {
      key: 'refi_fees',
      name: 'Refi Fees',
      type: 'flow',
      formula: '$self.facility_limit * ($input.refiFlagsExpr) * $input.refiFeePct / 100',
      description: 'One-time refinancing fees at each refi date'
    },
    {
      key: 'effective_margin',
      name: 'Effective Margin',
      type: 'stock',
      formula: 'PREVVAL($self.effective_margin) * (1 - $self.recalc_trigger) + ($input.baseMarginPctRef * $input.operationsFlagRef.Start + $input.refiMarginPct * ($input.refiFlagsExpr)) * $self.recalc_trigger + $input.baseMarginPctRef * (CUMSUM(1) == 1)',
      description: 'Margin steps from base to refi margin at each refi date'
    },
    {
      key: 'establishment_fee',
      name: 'Establishment Fee',
      type: 'flow',
      formula: 'MAXVAL($self.facility_limit) * $input.establishmentFeePctRef / 100 * F1.Start'
    },
    {
      key: 'commitment_fee',
      name: 'Commitment Fee',
      type: 'flow',
      formula: '$self.facility_limit * $self.effective_margin / 100 * $input.commitmentFeePctOfMarginRef / 100 / T.QiY * T.QE * $input.operationsFlagRef'
    },
    {
      key: 'total_dsrf_fees',
      name: 'Total DSRF Fees',
      type: 'flow',
      formula: '$self.establishment_fee + $self.commitment_fee + $self.refi_fees'
    },
    {
      key: 'total_dsrf_fees_cumulative',
      name: 'Total DSRF Fees (Cumulative)',
      type: 'stock',
      formula: 'CUMSUM($self.total_dsrf_fees)'
    },
    {
      key: 'ds_plus_dsrf',
      name: 'DS + DSRF Fees',
      type: 'flow',
      formula: 'ABS($input.debtServiceRef) + $self.total_dsrf_fees'
    },
    {
      key: 'adjusted_dscr',
      name: 'Adjusted DSCR',
      type: 'stock',
      formula: '($input.contractedCfadsRef + $input.merchantCfadsRef) / MAX($self.ds_plus_dsrf, 0.0001) * $input.debtFlagRef'
    }
  ]
}

// Registry of all template functions
const TEMPLATE_REGISTRY = {
  straight_line_amortisation: straightLineAmortisation,
  gst_receivable: gstReceivable,
  construction_funding: constructionFunding,
  tax_losses: taxLosses,
  reserve_account: reserveAccount,
  distributions: distributions,
  iterative_debt_sizing: iterativeDebtSizing,
  dsrf: dsrf
}

/**
 * Get parameterized formula outputs for a module template.
 *
 * @param {string} templateId - Template type (e.g., 'straight_line_amortisation')
 * @param {object} inputs - Module inputs (e.g., { capitalisedRef: "R203", lifeRef: "C1.24" })
 * @returns {Array<{key, name, type, formula, isSolver?, description?}>}
 */
export function getTemplateFormulas(templateId, inputs) {
  const templateFn = TEMPLATE_REGISTRY[templateId]
  if (!templateFn) {
    throw new Error(`Unknown module template: ${templateId}`)
  }
  return templateFn(inputs || {})
}

/**
 * Get just the output keys for a template (for backward compat).
 */
export function getTemplateOutputKeys(templateId, inputs) {
  return getTemplateFormulas(templateId, inputs || {}).map(o => o.key)
}
