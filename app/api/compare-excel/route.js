// API: substitution-based delta analysis between Excel IFS and GlassBox
import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { runServerModel } from '@/utils/serverModelEngine'
import { loadModelData } from '@/utils/loadModelData'

export const dynamic = 'force-dynamic'

// GB calc ref → { excelRow (1-based), name, section }
const LINE_MAP = {
    // ── Cash Flow Waterfall ──
    R4:   { row: 30,  name: 'Tolling Revenue',             section: 'CF' },
    R7:   { row: 32,  name: 'Merchant Revenue',            section: 'CF' },
    R8:   { row: 33,  name: 'Total Revenue',               section: 'CF' },
    R9:   { row: 37,  name: 'Total OPEX',                  section: 'CF' },
    R23:  { row: 65,  name: 'Capex (Total)',                section: 'CF' },
    R24:  { row: 63,  name: 'GST Paid on Capex',           section: 'CF' },
    R202: { row: 68,  name: 'GST Received (Construction)',  section: 'CF' },
    R25:  { row: 79,  name: 'GST Received (Operations)',    section: 'CF' },
    R29:  { row: 70,  name: 'Debt Drawdown',               section: 'CF' },
    R35:  { row: 69,  name: 'Equity Injection',             section: 'CF' },
    R32:  { row: 115, name: 'Interest Paid',                section: 'CF' },
    R31:  { row: 116, name: 'Principal Repayment',          section: 'CF' },
    R178: { row: 118, name: 'Total Debt Service',           section: 'CF' },
    R151: { row: 78,  name: 'Interest Income (CF)',         section: 'CF' },
    R155: { row: 151, name: 'Dividends Paid',               section: 'CF' },
    R154: { row: 155, name: 'Share Capital Repayment',      section: 'CF' },
    R40:  { row: 158, name: 'Net Cashflow',                 section: 'CF' },

    // ── Profit & Loss ──
    R8_PL:  { row: 165, name: 'Revenue Accrued (P&L)',      section: 'PL', gbRef: 'R8' },
    R9_PL:  { row: 166, name: 'OPEX Accrued (P&L)',         section: 'PL', gbRef: 'R9' },
    R13:    { row: 167, name: 'EBITDA',                      section: 'PL' },
    R14:    { row: 169, name: 'Depreciation',                section: 'PL' },
    R15:    { row: 170, name: 'EBIT',                        section: 'PL' },
    R151_PL:{ row: 172, name: 'Interest Income (P&L)',       section: 'PL', gbRef: 'R151' },
    R16:    { row: 173, name: 'Interest Expense',            section: 'PL' },
    R174:   { row: 176, name: 'Agency Fee',                  section: 'PL' },
    R153:   { row: 175, name: 'DSRF Fees',                   section: 'PL' },
    R17:    { row: 179, name: 'EBT',                         section: 'PL' },
    R19:    { row: 182, name: 'NPAT',                        section: 'PL' },

    // ── Balance Sheet ──
    R182:   { row: 192, name: 'Cash',                        section: 'BS' },
    R183:   { row: 216, name: 'Non-Current Assets (Total)',  section: 'BS' },
    R184:   { row: 195, name: 'Trade Receivables',           section: 'BS' },
    R189:   { row: 219, name: 'Trade Payables',              section: 'BS' },
    R188:   { row: 223, name: 'Senior Debt (Term)',          section: 'BS' },
    R198:   { row: 222, name: 'Senior Debt (Construction)',  section: 'BS' },
    R191:   { row: 234, name: 'Share Capital',               section: 'BS' },
    R192:   { row: 235, name: 'Retained Earnings',           section: 'BS' },
    R193:   { row: 236, name: 'Total Equity',                section: 'BS' },
    R195:   { row: 238, name: 'Balance Check',               section: 'BS' },
}

// Excel columns: col 0 = A. Monthly data starts at column X (index 23) = GB period 0
const EXCEL_DATA_START_COL = 23
const NUM_PERIODS = 396

// Override run definitions: each run overrides specific GB calcs with Excel values
const OVERRIDE_RUNS = [
    { name: 'Baseline', desc: 'No overrides — pure GB', overrideCalcs: [] },
    { name: 'Revenue', desc: 'Override R4,R7 with Excel revenue', overrideCalcs: ['R4', 'R7'] },
    { name: 'Revenue+OPEX', desc: 'Override R4,R7,R9 (adds OPEX)', overrideCalcs: ['R4', 'R7', 'R9'] },
    { name: 'Rev+OPEX+Debt', desc: 'Override R4,R7,R9,R29,R31,R32 (adds debt)', overrideCalcs: ['R4', 'R7', 'R9', 'R29', 'R31', 'R32'] },
]

// Mapping from source-level GB calcs to Excel rows for overrides
const SOURCE_TO_EXCEL_ROW = {
    R4: 30,   // Tolling Revenue
    R7: 32,   // Merchant Revenue
    R9: 37,   // Total OPEX
    R29: 70,  // Senior Debt drawdown
    R31: 116, // Debt Principal repayment
    R32: 115, // Debt Interest
}

function extractExcelRow(sheet, rowNum1Based) {
    const rowIdx = rowNum1Based - 1
    const values = new Float64Array(NUM_PERIODS)
    for (let i = 0; i < NUM_PERIODS; i++) {
        const colIdx = EXCEL_DATA_START_COL + i
        const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
        const cell = sheet[cellAddr]
        values[i] = cell ? (typeof cell.v === 'number' ? cell.v : 0) : 0
    }
    return Array.from(values)
}

function extractExcelRowLabels(sheet, startRow, endRow) {
    const labels = {}
    for (let r = startRow; r <= endRow; r++) {
        const parts = []
        for (let c = 0; c < 8; c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: r - 1, c })]
            if (cell && cell.v !== undefined && cell.v !== '') {
                parts.push({ col: String.fromCharCode(65 + c), val: String(cell.v).substring(0, 60) })
            }
        }
        if (parts.length > 0) {
            labels[r] = parts.map(p => `${p.col}=${p.val}`).join(' | ')
        }
    }
    return labels
}

function sumArray(arr) {
    return arr.reduce((a, b) => a + (b || 0), 0)
}

function compareArrays(gbArr, xlArr, threshold = 0.0001) {
    const gbSum = sumArray(gbArr)
    const xlSum = sumArray(xlArr)
    const delta = gbSum - xlSum
    const pctDiff = xlSum !== 0 ? (delta / Math.abs(xlSum)) * 100 : (gbSum !== 0 ? Infinity : 0)

    let firstDiffPeriod = -1
    let maxPeriodDelta = 0
    for (let i = 0; i < NUM_PERIODS; i++) {
        const d = Math.abs((gbArr[i] || 0) - (xlArr[i] || 0))
        if (d > threshold && firstDiffPeriod === -1) firstDiffPeriod = i
        if (d > maxPeriodDelta) maxPeriodDelta = d
    }

    return {
        gbSum: Math.round(gbSum * 10000) / 10000,
        xlSum: Math.round(xlSum * 10000) / 10000,
        delta: Math.round(delta * 10000) / 10000,
        pctDiff: Math.round(pctDiff * 100) / 100,
        match: Math.abs(delta) < 0.01,
        firstDiffPeriod,
        maxPeriodDelta: Math.round(maxPeriodDelta * 10000) / 10000,
    }
}

function periodToDate(periodIdx) {
    // Period 0 = model start. Assume start from key periods or 2009-01
    const startYear = 2009, startMonth = 1
    const totalMonths = startYear * 12 + (startMonth - 1) + periodIdx
    const y = Math.floor(totalMonths / 12)
    const m = (totalMonths % 12) + 1
    return `${y}-${String(m).padStart(2, '0')}`
}

function computeDrillDown(gbArr, xlArr, threshold = 0.0001) {
    const periods = []
    let firstDiffPeriod = -1
    let firstDiffDate = null
    let maxPeriodDelta = 0
    let cumulativeDelta = 0
    let periodicCount = 0
    let oneTimeCount = 0

    for (let i = 0; i < NUM_PERIODS; i++) {
        const gb = gbArr[i] || 0
        const xl = xlArr[i] || 0
        const d = gb - xl
        const absD = Math.abs(d)

        if (absD > threshold) {
            if (firstDiffPeriod === -1) {
                firstDiffPeriod = i
                firstDiffDate = periodToDate(i)
            }
            if (absD > maxPeriodDelta) maxPeriodDelta = absD
            cumulativeDelta += d
            periodicCount++
            periods.push({
                idx: i,
                date: periodToDate(i),
                gb: Math.round(gb * 10000) / 10000,
                xl: Math.round(xl * 10000) / 10000,
                delta: Math.round(d * 10000) / 10000,
            })
        }
    }

    // Detect drift pattern
    let driftPattern = 'none'
    if (periodicCount === 0) {
        driftPattern = 'none'
    } else if (periodicCount === 1) {
        driftPattern = 'one-time'
    } else {
        // Check if deltas are all same sign and growing cumulatively
        const totalDelta = Math.abs(sumArray(gbArr) - sumArray(xlArr))
        const avgPerPeriod = totalDelta / periodicCount
        const maxD = maxPeriodDelta

        if (maxD < avgPerPeriod * 3 && periodicCount > 5) {
            driftPattern = 'periodic'
        } else if (periodicCount <= 3) {
            driftPattern = 'one-time'
        } else {
            // Check if cumulative sum of deltas grows monotonically
            let growing = 0
            let cumD = 0
            for (const p of periods) {
                const prevCum = cumD
                cumD += p.delta
                if (Math.abs(cumD) > Math.abs(prevCum) + threshold) growing++
            }
            driftPattern = growing > periodicCount * 0.7 ? 'cumulative' : 'mixed'
        }
    }

    return {
        firstDiffPeriod,
        firstDiffDate,
        maxPeriodDelta: Math.round(maxPeriodDelta * 10000) / 10000,
        driftPattern,
        diffPeriodCount: periodicCount,
        periods: periods.length > 200 ? periods.slice(0, 200) : periods,
    }
}

export async function GET(request) {
    try {
        const url = new URL(request.url)
        const debug = url.searchParams.get('debug') === 'true'

        const dataDir = path.join(process.cwd(), 'data')

        // Load model data
        const { inputs, calculations: calcs } = await loadModelData(dataDir)

        // Load Excel
        const xlPath = path.join(dataDir, 'IFS_month.xlsx')
        const xlBuf = await fs.readFile(xlPath)
        const workbook = XLSX.read(xlBuf, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]

        // Pre-extract all Excel rows we need
        const excelData = {}
        for (const [lineKey, spec] of Object.entries(LINE_MAP)) {
            excelData[lineKey] = extractExcelRow(sheet, spec.row)
        }

        // Extract source-level override rows
        for (const [gbRef, xlRow] of Object.entries(SOURCE_TO_EXCEL_ROW)) {
            if (!excelData[gbRef]) {
                excelData[gbRef] = extractExcelRow(sheet, xlRow)
            }
        }

        // Run model multiple times with progressive overrides
        const runs = []

        for (const runDef of OVERRIDE_RUNS) {
            const overrides = {}
            for (const calcRef of runDef.overrideCalcs) {
                const xlRow = SOURCE_TO_EXCEL_ROW[calcRef]
                if (xlRow) {
                    overrides[calcRef] = extractExcelRow(sheet, xlRow)
                }
            }

            const hasOverrides = Object.keys(overrides).length > 0
            const results = runServerModel(inputs, calcs, hasOverrides ? { overrides } : {})
            const cr = results.calculationResults

            // Compare each mapped line
            const comparisons = {}
            for (const [lineKey, spec] of Object.entries(LINE_MAP)) {
                // For aliased lines (e.g. R8_PL → R8), use the gbRef
                const gbRef = spec.gbRef || lineKey
                const gbArr = cr[gbRef] || new Array(NUM_PERIODS).fill(0)
                const xlArr = excelData[lineKey]
                comparisons[lineKey] = {
                    name: spec.name,
                    section: spec.section,
                    excelRow: spec.row,
                    gbRef,
                    ...compareArrays(gbArr, xlArr),
                }
            }

            const matched = Object.values(comparisons).filter(c => c.match).length
            const total = Object.keys(comparisons).length

            runs.push({
                name: runDef.name,
                description: runDef.desc,
                overrides: runDef.overrideCalcs,
                matched,
                total,
                comparisons,
            })
        }

        // Build delta-movement table: for each line, show which run first makes it match
        const deltaOrigins = {}
        for (const lineKey of Object.keys(LINE_MAP)) {
            const progression = runs.map(r => r.comparisons[lineKey].match)
            let resolvedAt = null
            for (let i = 0; i < progression.length; i++) {
                if (progression[i] && (i === 0 || !progression[i - 1])) {
                    resolvedAt = runs[i].name
                    break
                }
            }
            deltaOrigins[lineKey] = {
                name: LINE_MAP[lineKey].name,
                section: LINE_MAP[lineKey].section,
                excelRow: LINE_MAP[lineKey].row,
                baseline: runs[0].comparisons[lineKey].match ? 'MATCH' : `Δ ${runs[0].comparisons[lineKey].delta}`,
                resolvedAt: resolvedAt || 'UNRESOLVED',
                progression: runs.map(r => ({
                    run: r.name,
                    match: r.comparisons[lineKey].match,
                    delta: r.comparisons[lineKey].delta,
                })),
            }
        }

        // Build period-level drill-down for baseline run (non-matching lines)
        const baselineResults = runs[0]
        const cr = runServerModel(inputs, calcs, {}).calculationResults
        const drillDown = {}

        for (const [lineKey, spec] of Object.entries(LINE_MAP)) {
            if (!baselineResults.comparisons[lineKey].match) {
                const gbRef = spec.gbRef || lineKey
                const gbArr = cr[gbRef] || new Array(NUM_PERIODS).fill(0)
                const xlArr = excelData[lineKey]
                drillDown[lineKey] = {
                    name: spec.name,
                    gbRef,
                    ...computeDrillDown(gbArr, xlArr),
                }
            }
        }

        // Build response
        const response = {
            summary: runs.map(r => ({
                name: r.name,
                description: r.description,
                overrides: r.overrides,
                matched: r.matched,
                total: r.total,
                pct: Math.round(r.matched / r.total * 100),
            })),
            deltaOrigins,
            drillDown,
            runs,
        }

        // Debug mode: include Excel row labels
        if (debug) {
            response.excelRowLabels = {
                cashFlow: extractExcelRowLabels(sheet, 28, 162),
                profitLoss: extractExcelRowLabels(sheet, 164, 188),
                balanceSheet: extractExcelRowLabels(sheet, 190, 240),
            }
        }

        return NextResponse.json(response, { status: 200 })

    } catch (err) {
        console.error('compare-excel error:', err)
        return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 })
    }
}
