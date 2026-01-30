// Migration script: Convert modules to regular calculations
// Run with: node scripts/migrateModules.mjs

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const dataDir = join(process.cwd(), 'data')

// Read model data
const calcPath = join(dataDir, 'model-calculations.json')
const inputsPath = join(dataDir, 'model-inputs.json')
const calcData = JSON.parse(readFileSync(calcPath, 'utf-8'))
const inputsData = JSON.parse(readFileSync(inputsPath, 'utf-8'))

// Build constants lookup: "C1.X" -> numeric value
const constantsLookup = {}
const constants = (inputsData.inputGlass || []).filter(i => i.groupId === 100)
for (const c of constants) {
    const ref = `C1.${c.id - 99}`
    constantsLookup[ref] = c.value
}
console.log(`Built constants lookup: ${Object.keys(constantsLookup).length} constants`)

const modules = calcData.modules || []
const calculations = calcData.calculations || []
const groups = calcData.calculationsGroups || []

// Module output definitions with CORRECTED formulas
// These must match the outputs array ORDER from the template (defines M-ref numbering)
const MODULE_OUTPUT_DEFS = {
    depreciation_amortization: {
        tabId: 1,
        outputs: [
            { key: 'opening', label: 'Opening Book Value', type: 'stock_start' },
            { key: 'addition', label: 'Capital Addition', type: 'flow' },
            { key: 'depreciation', label: 'Depreciation Expense', type: 'flow' },
            { key: 'accumulated', label: 'Accumulated Depreciation', type: 'stock' },
            { key: 'closing', label: 'Closing Book Value', type: 'stock' }
        ],
        // CUMSUM Gold Standard: Closing computed FIRST, no SHIFT cycles
        outputFormulas: {
            addition: 'CUMSUM({additionsRef}) * {opsFlagRef}.Start',
            closing: 'MAX(0, CUMSUM(addition) - CUMSUM({additionsRef}) / {lifeYears} / T.MiY * CUMSUM({opsFlagRef}))',
            opening: 'MAX(0, (CUMSUM(addition) - addition) - CUMSUM({additionsRef}) / {lifeYears} / T.MiY * (CUMSUM({opsFlagRef}) - {opsFlagRef}))',
            depreciation: 'MIN(opening + addition, CUMSUM({additionsRef}) / {lifeYears} / T.MiY) * {opsFlagRef}',
            accumulated: 'CUMSUM(depreciation)'
        }
    },
    gst_receivable: {
        tabId: 1,
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
        // CUMSUM Gold Standard: receivable_opening uses CUMSUM-X, not SHIFT
        outputFormulas: {
            gst_base: '{gstBaseRef}',
            gst_amount: '{gstBaseRef} * {gstRatePct} / 100 * {activeFlagRef}',
            gst_paid: '-gst_amount',
            gst_received: 'SHIFT(gst_amount, {receiptDelayMonths})',
            receivable_closing: 'CUMSUM(gst_amount) - CUMSUM(gst_received)',
            receivable_opening: '(CUMSUM(gst_amount) - gst_amount) - (CUMSUM(gst_received) - gst_received)',
            net_gst_cashflow: 'gst_paid + gst_received',
            gst_received_construction: 'gst_received * {constructionFlagRef}',
            gst_received_operations: 'gst_received * {operationsFlagRef}'
        }
    },
    construction_funding: {
        tabId: 2,
        outputs: [
            { key: 'total_uses_incl_idc', label: 'Total Funding Requirements', type: 'stock' },
            { key: 'senior_debt', label: 'Senior Debt', type: 'stock' },
            { key: 'equity', label: 'Equity', type: 'stock' },
            { key: 'gearing_pct', label: 'Gearing %', type: 'stock' },
            { key: 'cumulative_idc', label: 'IDC', type: 'stock' },
            { key: 'debt_drawdown', label: 'Debt Drawdown', type: 'flow' },
            { key: 'equity_drawdown', label: 'Equity Drawdown', type: 'flow' },
            { key: 'idc', label: 'IDC (Period)', type: 'flow' },
            { key: 'total_uses_ex_idc', label: 'Total Uses (ex-IDC)', type: 'stock' },
            { key: 'uncapped_drawdown', label: 'Uncapped Debt Drawdown', type: 'flow' }
        ],
        // CUMSUM Gold Standard: No SHIFT cycles. Uses uncapped trick for debt drawdowns.
        outputFormulas: {
            total_uses_ex_idc: '{constructionCostsRef} + {gstPaidRef} + {feesRef}',
            uncapped_drawdown: 'MAX(0, total_uses_ex_idc - SHIFT(total_uses_ex_idc, 1)) * {gearingCapPct} / 100 * {constructionFlagRef}',
            debt_drawdown: 'MIN(uncapped_drawdown, MAX(0, {sizedDebtRef} - (CUMSUM(uncapped_drawdown) - uncapped_drawdown))) * {constructionFlagRef}',
            senior_debt: 'CUMSUM(debt_drawdown)',
            idc: 'SHIFT(senior_debt, 1) * {interestRatePct} / 100 / T.MiY * {constructionFlagRef}',
            cumulative_idc: 'CUMSUM(idc)',
            total_uses_incl_idc: 'total_uses_ex_idc + cumulative_idc',
            equity: 'total_uses_incl_idc - senior_debt',
            equity_drawdown: 'MAX(0, equity - SHIFT(equity, 1)) * {constructionFlagRef}',
            gearing_pct: 'senior_debt / MAX(total_uses_ex_idc, 0.0001) * 100'
        }
    },
    tax_losses: {
        tabId: 1,
        outputs: [
            { key: 'taxable_income_before_losses', label: 'Taxable Income Before Losses', type: 'flow' },
            { key: 'losses_opening', label: 'Tax Losses - Opening', type: 'stock_start' },
            { key: 'losses_generated', label: 'Tax Losses - Generated', type: 'flow' },
            { key: 'losses_utilised', label: 'Tax Losses - Utilised', type: 'flow' },
            { key: 'losses_closing', label: 'Tax Losses - Closing', type: 'stock' },
            { key: 'net_taxable_income', label: 'Net Taxable Income', type: 'flow' },
            { key: 'tax_payable', label: 'Tax Payable', type: 'flow' }
        ],
        // CUMSUM Gold Standard: No SHIFT cycles. Closing first, Opening from CUMSUM-X.
        outputFormulas: {
            taxable_income_before_losses: '{taxableIncomeRef}',
            losses_generated: 'MAX(0, -{taxableIncomeRef}) * {opsFlagRef}',
            losses_closing: 'CUMSUM(losses_generated) - MIN(CUMSUM(losses_generated), CUMSUM(MAX(0, {taxableIncomeRef}) * {opsFlagRef}))',
            losses_opening: '(CUMSUM(losses_generated) - losses_generated) - MIN(CUMSUM(losses_generated) - losses_generated, CUMSUM(MAX(0, {taxableIncomeRef}) * {opsFlagRef}) - MAX(0, {taxableIncomeRef}) * {opsFlagRef})',
            losses_utilised: 'MIN(CUMSUM(losses_generated), CUMSUM(MAX(0, {taxableIncomeRef}) * {opsFlagRef})) - MIN(CUMSUM(losses_generated) - losses_generated, CUMSUM(MAX(0, {taxableIncomeRef}) * {opsFlagRef}) - MAX(0, {taxableIncomeRef}) * {opsFlagRef})',
            net_taxable_income: 'MAX(0, {taxableIncomeRef} - losses_utilised) * {opsFlagRef}',
            tax_payable: 'net_taxable_income * {taxRatePct} / 100'
        }
    },
    reserve_account: {
        tabId: 2,
        outputs: [
            { key: 'opening', label: 'Opening Balance', type: 'stock_start' },
            { key: 'funding', label: 'Funding', type: 'flow' },
            { key: 'drawdown', label: 'Drawdown', type: 'flow' },
            { key: 'release', label: 'Release', type: 'flow' },
            { key: 'closing', label: 'Closing Balance', type: 'stock' }
        ],
        // CUMSUM Gold Standard: No SHIFT cycles. Uses uncapped trick for capped drawdowns.
        outputFormulas: {
            funding: '{fundingAmountRef} * {fundingFlagRef}',
            drawdown: 'MIN(ABS({drawdownRef}) * {drawdownFlagRef} * (1 - {releaseFlagRef}), MAX(0, CUMSUM(funding) - (CUMSUM(ABS({drawdownRef}) * {drawdownFlagRef} * (1 - {releaseFlagRef})) - ABS({drawdownRef}) * {drawdownFlagRef} * (1 - {releaseFlagRef})))) * {drawdownFlagRef} * (1 - {releaseFlagRef})',
            release: 'MAX(0, CUMSUM(funding) - CUMSUM(drawdown)) * {releaseFlagRef}',
            closing: 'MAX(0, CUMSUM(funding) - CUMSUM(drawdown) - CUMSUM(release))',
            opening: 'MAX(0, (CUMSUM(funding) - funding) - (CUMSUM(drawdown) - drawdown) - (CUMSUM(release) - release))'
        }
    },
    distributions: {
        tabId: 2,
        outputs: [
            { key: 'cash_available', label: 'Cash Available for Dist', type: 'flow' },
            { key: 're_opening', label: 'RE - Opening', type: 'stock_start' },
            { key: 're_npat', label: 'RE - NPAT', type: 'flow' },
            { key: 're_test', label: 'RE Test', type: 'stock' },
            { key: 'npat_test', label: 'NPAT Test', type: 'stock' },
            { key: 'dividend_paid', label: 'Dividend Paid', type: 'flow' },
            { key: 're_movement', label: 'RE - Movement', type: 'flow' },
            { key: 're_closing', label: 'RE - Closing', type: 'stock' },
            { key: 'sc_opening', label: 'SC - Opening', type: 'stock_start' },
            { key: 'sc_cash_available', label: 'Post-SC Cash Available', type: 'flow' },
            { key: 'sc_repayment', label: 'SC - Repayment', type: 'flow' },
            { key: 'sc_closing', label: 'SC - Closing', type: 'stock' },
            { key: 'total_distributions', label: 'Total Distributions', type: 'flow' },
            { key: 'withholding_tax', label: 'Withholding Tax', type: 'flow' },
            { key: 'net_to_equity', label: 'Net to Equity', type: 'flow' },
            { key: 'dscr_test', label: 'DSCR Test', type: 'stock' },
            { key: 'adscr_test', label: 'ADSCR Test', type: 'stock' },
            { key: 'dsra_test', label: 'DSRA Test', type: 'stock' },
            { key: 'all_tests_pass', label: 'All Tests Pass', type: 'stock' },
            { key: 'consec_pass_qtrs', label: 'Consecutive Pass Qtrs', type: 'stock' },
            { key: 'lockup_active', label: 'Lock-up Active', type: 'stock' },
            { key: 'cumulative_distributions', label: 'Cumulative Distributions', type: 'stock' },
            { key: 'cumulative_sc_repayment', label: 'Cumulative SC Repayment', type: 'stock' }
        ],
        outputFormulas: {
            dscr_test: 'MAX(({dscrRef} >= {dscrThreshold}), (ABS({debtServiceRef}) < 0.001)) * {opsFlagRef}',
            adscr_test: '{opsFlagRef}',
            dsra_test: '{opsFlagRef}',
            all_tests_pass: 'dscr_test * adscr_test * dsra_test * {quarterEndFlagRef}',
            consec_pass_qtrs: 'SHIFT(consec_pass_qtrs, 1) * (all_tests_pass + (1 - {quarterEndFlagRef})) + all_tests_pass',
            lockup_active: '(consec_pass_qtrs < {lockupReleasePeriods}) * {opsFlagRef}',
            re_npat: '{npatRef}',
            cash_available: 'MAX(0, CUMSUM({availableCashRef}) - SHIFT(cumulative_distributions, 1) - {minCashReserve}) * {opsFlagRef}',
            re_opening: 'SHIFT(re_closing, 1)',
            re_test: '(re_opening + re_npat > 0)',
            npat_test: '(re_npat > 0)',
            sc_opening: '{equityContributedRef}',
            sc_repayment: 'MIN(cash_available, MAX(0, sc_opening - SHIFT(cumulative_sc_repayment, 1))) * {opsFlagRef} * (1 - lockup_active)',
            sc_closing: 'MAX(0, sc_opening - CUMSUM(sc_repayment))',
            sc_cash_available: 'MAX(0, cash_available - sc_repayment)',
            dividend_paid: 'MIN(sc_cash_available, MAX(0, re_npat)) * {opsFlagRef} * re_test * npat_test * (1 - lockup_active)',
            re_movement: 're_npat - dividend_paid',
            re_closing: 'SHIFT(re_closing, 1) + re_movement',
            total_distributions: 'dividend_paid + sc_repayment',
            cumulative_distributions: 'CUMSUM(total_distributions)',
            cumulative_sc_repayment: 'CUMSUM(sc_repayment)',
            withholding_tax: 'total_distributions * {withholdingTaxPct} / 100',
            net_to_equity: 'total_distributions - withholding_tax'
        }
    }
}

// Modules that should NOT be converted
const SKIP_TEMPLATES = ['iterative_debt_sizing', 'dsrf']

// Find the next available IDs
let nextCalcId = Math.max(...calculations.map(c => c.id), 0) + 1
nextCalcId = Math.max(nextCalcId, 9001)

let nextGroupId = Math.max(...groups.map(g => g.id), 0) + 1
nextGroupId = Math.max(nextGroupId, 50)

const allMRefMap = {}
const newCalcs = []
const newGroups = []

console.log('=== Module Migration ===')
console.log(`Starting calc ID: ${nextCalcId}, group ID: ${nextGroupId}`)
console.log('')

modules.forEach((mod, idx) => {
    const moduleNum = idx + 1
    console.log(`M${moduleNum}: ${mod.name} (${mod.templateId})`)

    if (SKIP_TEMPLATES.includes(mod.templateId)) {
        console.log(`  → SKIPPED (${mod.templateId} stays as JS module)`)
        return
    }

    if (mod.converted) {
        // Still rebuild mRefMap from existing calcIds + outputs
        const def = MODULE_OUTPUT_DEFS[mod.templateId]
        if (def && mod.calcIds) {
            const existingOutputs = mod.outputs || def.outputs.map(o => o.key)
            existingOutputs.forEach((outputKey, i) => {
                if (i < mod.calcIds.length) {
                    const mRef = `M${moduleNum}.${i + 1}`
                    allMRefMap[mRef] = `R${mod.calcIds[i]}`
                }
            })
            console.log(`  → SKIPPED (already converted) - rebuilt ${existingOutputs.length} M-ref mappings`)
        } else {
            console.log(`  → SKIPPED (already converted)`)
        }
        return
    }

    const def = MODULE_OUTPUT_DEFS[mod.templateId]
    if (!def) {
        console.log(`  → SKIPPED (no output definition found)`)
        return
    }

    const inputs = mod.inputs || {}
    const groupId = nextGroupId
    const tabId = def.tabId

    // Map output keys to their R-ref IDs
    const outputKeyToId = {}
    const outputKeyToRef = {}
    def.outputs.forEach((output, i) => {
        const calcId = nextCalcId + i
        outputKeyToId[output.key] = calcId
        outputKeyToRef[output.key] = `R${calcId}`
    })

    // Build M-ref map
    const mRefMap = {}
    def.outputs.forEach((output, i) => {
        const mRef = `M${moduleNum}.${i + 1}`
        mRefMap[mRef] = `R${outputKeyToId[output.key]}`
    })

    // Check if module is disabled — generated calcs should produce zeros
    const isDisabled = mod.enabled === false

    // Generate calculations
    const calcs = def.outputs.map((output, i) => {
        let formula = isDisabled ? '0' : (def.outputFormulas[output.key] || '0')

        // Step 1: Substitute {inputKey} with configured values
        for (const [inputKey, inputValue] of Object.entries(inputs)) {
            formula = formula.replace(new RegExp(`\\{${inputKey}\\}`, 'g'), String(inputValue))
        }

        // Step 2: Replace internal output key refs with R-refs (longest first)
        const sortedKeys = Object.keys(outputKeyToRef).sort((a, b) => b.length - a.length)
        for (const key of sortedKeys) {
            formula = formula.replace(new RegExp(`\\b${key}\\b`, 'g'), outputKeyToRef[key])
        }

        // Step 3: Clean up display chars
        formula = formula.replace(/×/g, '*')

        // Step 4: Resolve constant references in SHIFT offsets to literal numbers
        formula = formula.replace(
            /SHIFT\s*\(([^,]+),\s*(C\d+\.\d+)\s*\)/gi,
            (match, ref, constRef) => {
                const val = constantsLookup[constRef]
                if (val !== undefined && val !== null) {
                    console.log(`    Resolved SHIFT offset: ${constRef} → ${Math.round(val)}`)
                    return `SHIFT(${ref}, ${Math.round(val)})`
                }
                console.log(`    WARNING: Could not resolve SHIFT offset: ${constRef}`)
                return match
            }
        )

        return {
            id: nextCalcId + i,
            groupId: groupId,
            name: `${mod.name}: ${output.label}`,
            formula: formula,
            type: output.type || 'flow',
            _moduleId: `M${moduleNum}`,
            _moduleOutputKey: output.key
        }
    })

    // Generate group
    const group = {
        id: groupId,
        tabId: tabId,
        name: mod.name,
        _isModuleGroup: true,
        _moduleTemplateId: mod.templateId
    }

    newCalcs.push(...calcs)
    newGroups.push(group)
    Object.assign(allMRefMap, mRefMap)

    // Mark module as converted
    mod.converted = true
    mod.calcIds = calcs.map(c => c.id)

    console.log(`  → Generated ${calcs.length} calcs (R${calcs[0].id}-R${calcs[calcs.length - 1].id}), group ${groupId}`)

    // Print generated formulas for verification
    calcs.forEach(c => {
        console.log(`    R${c.id} [${c._moduleOutputKey}]: ${c.formula}`)
    })

    nextCalcId += calcs.length
    nextGroupId++
})

// Merge into calcData
calcData.calculations = [...calculations, ...newCalcs]
calcData.calculationsGroups = [...groups, ...newGroups]
calcData._mRefMap = allMRefMap

console.log('')
console.log(`=== Summary ===`)
console.log(`New calcs: ${newCalcs.length}`)
console.log(`New groups: ${newGroups.length}`)
console.log(`M-ref mappings: ${Object.keys(allMRefMap).length}`)
console.log('')

// Write back
const backup = calcPath.replace('.json', '.backup.json')
writeFileSync(backup, readFileSync(calcPath, 'utf-8'))
console.log(`Backup saved to: ${backup}`)

writeFileSync(calcPath, JSON.stringify(calcData, null, 2))
console.log(`Updated: ${calcPath}`)
