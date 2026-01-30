// Distributions Module
import { resolveModuleInput } from './shared'

export const TEMPLATE = {
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
    outputs: [],
    fullyConverted: true,
    convertedOutputs: [
        { key: 'cash_available', label: 'Cash Available for Dist', calcRef: 'R9037' },
        { key: 're_opening', label: 'RE - Opening', calcRef: 'R9038' },
        { key: 're_npat', label: 'RE - NPAT', calcRef: 'R9039' },
        { key: 're_test', label: 'RE Test', calcRef: 'R9040' },
        { key: 'npat_test', label: 'NPAT Test', calcRef: 'R9041' },
        { key: 'dividend_paid', label: 'Dividend Paid', calcRef: 'R9042' },
        { key: 're_movement', label: 'RE - Movement', calcRef: 'R9043' },
        { key: 're_closing', label: 'RE - Closing', calcRef: 'R9044' },
        { key: 'sc_opening', label: 'SC - Opening', calcRef: 'R9045' },
        { key: 'post_sc_cash', label: 'Post-SC Cash Available', calcRef: 'R9046' },
        { key: 'sc_repayment', label: 'SC - Repayment', calcRef: 'R9047' },
        { key: 'sc_closing', label: 'SC - Closing', calcRef: 'R9048' },
        { key: 'total_distributions', label: 'Total Distributions', calcRef: 'R9049' },
        { key: 'withholding_tax', label: 'Withholding Tax', calcRef: 'R9050' },
        { key: 'net_to_equity', label: 'Net to Equity', calcRef: 'R9051' },
        { key: 'dscr_test', label: 'DSCR Test', calcRef: 'R9052' },
        { key: 'adscr_test', label: 'ADSCR Test', calcRef: 'R9053' },
        { key: 'dsra_test', label: 'DSRA Test', calcRef: 'R9054' },
        { key: 'all_tests_pass', label: 'All Tests Pass', calcRef: 'R9055' },
        { key: 'consecutive_pass_qtrs', label: 'Consecutive Pass Qtrs', calcRef: 'R9056' },
        { key: 'lockup_active', label: 'Lock-up Active', calcRef: 'R9057' },
        { key: 'cumulative_distributions', label: 'Cumulative Distributions', calcRef: 'R9058' },
        { key: 'cumulative_sc_repayment', label: 'Cumulative SC Repayment', calcRef: 'R9059' }
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
export function calculate(inputs, arrayLength, context) {
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
        // Auto-pass when no debt service (DSCR=0 means debt fully repaid, no covenant to test)
        const noDebtService = (debtService[i] || 0) === 0
        const dscrOk = !dscrTestOn || noDebtService || (dscr[i] >= dscrThresh)
        outputs.dscr_test[i] = (isOps && dscrTestOn) ? (dscrOk ? 1 : 0) : (isOps ? 1 : 0)

        // ADSCR test: trailing 12m ratio >= threshold
        // Auto-pass when trailing debt service is zero (debt fully repaid)
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
