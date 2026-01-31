// Temporary API: substitution-based delta analysis between Excel IFS and GlassBox
import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { runServerModel } from '@/utils/serverModelEngine'
import { loadModelData } from '@/utils/loadModelData'

export const dynamic = 'force-dynamic'

// GB calc ref → Excel row (0-indexed internally, but specified as 1-based row numbers from the sheet)
const CF_MAP = {
    R300: 29, R301: 31, R302: 32, R303: 35, R305: 41,
    R306: 43, R313: 50, R314: 52, R316: 57, R318: 59,
    R319: 60, R320: 62, R321: 64, R325: 67, R326: 68,
    R327: 69, R328: 73, R330: 75, R331: 77,
    R340: 114, R341: 115, R342: 116, R343: 117, R344: 132,
    R350: 150, R351: 154, R352: 157, R353: 160,
}
const PL_MAP = {
    R360: 164, R361: 165, R362: 166, R363: 168, R364: 169,
    R365: 171, R366: 172, R367: 174, R368: 175, R369: 178,
    R370: 180, R371: 181,
}
const BS_MAP = { R195: 237 }
const ALL_MAP = { ...CF_MAP, ...PL_MAP, ...BS_MAP }

// Excel columns: col 0 = A. Monthly data starts at column X (index 23) = GB period 0
const EXCEL_DATA_START_COL = 23
const NUM_PERIODS = 396

// Override run definitions: each run overrides specific GB calcs with Excel values
// These are the SOURCE calcs whose values we substitute (not the debug-tab calcs)
const OVERRIDE_RUNS = [
    { name: 'Baseline', desc: 'No overrides — pure GB', overrideCalcs: [] },
    { name: 'Revenue', desc: 'Override R4,R7 with Excel revenue', overrideCalcs: ['R4', 'R7'] },
    { name: 'Revenue+OPEX', desc: 'Override R4,R7,R9 (adds OPEX)', overrideCalcs: ['R4', 'R7', 'R9'] },
    { name: 'Rev+OPEX+Debt', desc: 'Override R4,R7,R9,R29,R31,R32 (adds debt)', overrideCalcs: ['R4', 'R7', 'R9', 'R29', 'R31', 'R32'] },
]

// Mapping from source-level GB calcs to Excel rows for overrides
// These are the actual model calcs (not debug tab), mapped to their Excel equivalents
const SOURCE_TO_EXCEL_ROW = {
    R4: 29,   // Contracted Revenue
    R7: 31,   // Merchant Revenue
    R9: 35,   // OPEX
    R29: 69,  // Senior Debt drawdown
    R31: 115, // Debt Principal repayment
    R32: 114, // Debt Interest
}

function extractExcelRow(sheet, rowNum1Based) {
    // rowNum1Based is 1-based row number as seen in Excel
    const rowIdx = rowNum1Based - 1  // 0-based
    const values = new Float64Array(NUM_PERIODS)
    for (let i = 0; i < NUM_PERIODS; i++) {
        const colIdx = EXCEL_DATA_START_COL + i
        const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
        const cell = sheet[cellAddr]
        values[i] = cell ? (typeof cell.v === 'number' ? cell.v : 0) : 0
    }
    return Array.from(values)
}

function sumArray(arr) {
    return arr.reduce((a, b) => a + (b || 0), 0)
}

function compareArrays(gbArr, xlArr) {
    const gbSum = sumArray(gbArr)
    const xlSum = sumArray(xlArr)
    const delta = gbSum - xlSum
    const pctDiff = xlSum !== 0 ? (delta / Math.abs(xlSum)) * 100 : (gbSum !== 0 ? Infinity : 0)

    // Find first period where they diverge
    let firstDiffPeriod = -1
    for (let i = 0; i < NUM_PERIODS; i++) {
        if (Math.abs((gbArr[i] || 0) - (xlArr[i] || 0)) > 0.0001) {
            firstDiffPeriod = i
            break
        }
    }

    // Max absolute period delta
    let maxPeriodDelta = 0
    for (let i = 0; i < NUM_PERIODS; i++) {
        const d = Math.abs((gbArr[i] || 0) - (xlArr[i] || 0))
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

export async function GET() {
    try {
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

        // Extract debug-tab comparison rows
        for (const [gbRef, xlRow] of Object.entries(ALL_MAP)) {
            excelData[gbRef] = extractExcelRow(sheet, xlRow)
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
            // Build overrides object
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
            for (const [gbRef, xlRow] of Object.entries(ALL_MAP)) {
                const gbArr = cr[gbRef] || new Array(NUM_PERIODS).fill(0)
                const xlArr = excelData[gbRef]
                comparisons[gbRef] = {
                    excelRow: xlRow,
                    ...compareArrays(gbArr, xlArr),
                }
            }

            // Summary stats
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
        for (const gbRef of Object.keys(ALL_MAP)) {
            const progression = runs.map(r => r.comparisons[gbRef].match)
            let resolvedAt = null
            for (let i = 0; i < progression.length; i++) {
                if (progression[i] && (i === 0 || !progression[i - 1])) {
                    resolvedAt = runs[i].name
                    break
                }
            }
            deltaOrigins[gbRef] = {
                excelRow: ALL_MAP[gbRef],
                baseline: runs[0].comparisons[gbRef].match ? 'MATCH' : `Δ ${runs[0].comparisons[gbRef].delta}`,
                resolvedAt: resolvedAt || 'UNRESOLVED',
                progression: runs.map(r => ({
                    run: r.name,
                    match: r.comparisons[gbRef].match,
                    delta: r.comparisons[gbRef].delta,
                })),
            }
        }

        return NextResponse.json({
            summary: runs.map(r => ({
                name: r.name,
                description: r.description,
                overrides: r.overrides,
                matched: r.matched,
                total: r.total,
                pct: Math.round(r.matched / r.total * 100),
            })),
            deltaOrigins,
            runs,
        }, { status: 200 })

    } catch (err) {
        console.error('compare-excel error:', err)
        return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 })
    }
}
