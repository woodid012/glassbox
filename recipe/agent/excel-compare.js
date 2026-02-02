/**
 * Excel Comparison Tool
 *
 * Compares GlassBox engine output (from model JSONs) against
 * IFS_month.xlsx - the external reference BESS financial model.
 *
 * Uses synchronous file reading + vitest-compatible imports.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { runServerModel } from '../../utils/serverModelEngine.js'

/**
 * Load model data with manual merge
 */
function loadModelDataSync(dataDir) {
  const inputs = JSON.parse(readFileSync(join(dataDir, 'model-inputs.json'), 'utf-8'))
  const calcData = JSON.parse(readFileSync(join(dataDir, 'model-calculations.json'), 'utf-8'))

  try {
    const modulesData = JSON.parse(readFileSync(join(dataDir, 'model-modules.json'), 'utf-8'))
    if (modulesData.moduleGroups?.length) {
      calcData.calculationsGroups = [
        ...(calcData.calculationsGroups || []),
        ...modulesData.moduleGroups
      ]
    }
    if (modulesData.moduleCalculations?.length) {
      calcData.calculations = [
        ...(calcData.calculations || []),
        ...modulesData.moduleCalculations
      ]
    }
    if (modulesData.modules) calcData.modules = modulesData.modules
    if (modulesData._mRefMap) calcData._mRefMap = modulesData._mRefMap
  } catch (e) {
    // model-modules.json may not exist
  }

  return { inputs, calculations: calcData }
}

/**
 * IFS row-to-GlassBox ref mapping.
 *
 * Maps IFS_month.xlsx row numbers to GlassBox calculation refs.
 * sign: 1 means same sign convention, -1 means IFS sign is flipped vs GB.
 */
const IFS_ROW_MAP = [
  // === Revenue ===
  // IFS row 30 = Contracted - Base Fee; GB R4 = Tolling Revenue
  { ifsRow: 30, ref: 'R4', name: 'Contracted Revenue', sign: 1 },
  // IFS row 32 = Uncontracted; GB R7 = Merchant Revenue
  { ifsRow: 32, ref: 'R7', name: 'Merchant Revenue', sign: 1 },
  // IFS row 33 = Total Income; GB R8 = Total Revenue
  { ifsRow: 33, ref: 'R8', name: 'Total Revenue', sign: 1 },

  // === Opex ===
  // IFS row 37 = Total Opex (negative); GB R9 = Total OPEX (negative via -S1*I2)
  { ifsRow: 37, ref: 'R9', name: 'Total Opex', sign: 1 },

  // === P&L ===
  // IFS row 167 = EBITDA; GB R13 = EBITDA
  { ifsRow: 167, ref: 'R13', name: 'EBITDA', sign: 1 },
  // IFS row 169 = Depreciation (negative); GB R14 = P&L Depreciation (negative)
  { ifsRow: 169, ref: 'R14', name: 'Depreciation', sign: 1 },
  // IFS row 170 = EBIT; GB R15 = EBIT
  { ifsRow: 170, ref: 'R15', name: 'EBIT', sign: 1 },
  // IFS row 182 = NPAT; GB R19 = NPAT
  { ifsRow: 182, ref: 'R19', name: 'NPAT', sign: 1 },

  // === Cash Flow ===
  // IFS row 47 = EPC & Equipment (negative); GB R23 = Capex (negative via -V1*F1)
  { ifsRow: 47, ref: 'R23', name: 'Capex', sign: 1 },
  // IFS row 70 = Senior debt drawdown; GB R29 = Construction Debt Drawdown
  { ifsRow: 70, ref: 'R29', name: 'Senior Debt Drawdown', sign: 1 },
  // IFS row 115 = Interest (negative); GB R32 = Interest Paid (negative)
  { ifsRow: 115, ref: 'R32', name: 'Interest Paid', sign: 1 },
  // IFS row 116 = Principal (negative); GB R31 = Principal Repayment (negative)
  { ifsRow: 116, ref: 'R31', name: 'Principal Repayment', sign: 1 },
  // IFS row 151 = Dividends; GB R124 = Dividends Paid
  { ifsRow: 151, ref: 'R124', name: 'Dividends', sign: 1 },
  // IFS row 158 = Net cash flow; GB R40 = Net Cashflow
  { ifsRow: 158, ref: 'R40', name: 'Net Cash Flow', sign: 1, tolerance: 0.1 },

  // === Balance Sheet ===
  // IFS row 161 = Cash c/f; GB R42 = Cash Closing Balance
  { ifsRow: 161, ref: 'R42', name: 'Cash Balance', sign: 1 },
  // IFS row 198 = MRA; GB R186 = MRA Balance
  { ifsRow: 198, ref: 'R186', name: 'MRA', sign: 1 },
  // IFS row 188 = Retained earnings c/f; GB R192 = Retained Earnings
  { ifsRow: 188, ref: 'R192', name: 'Retained Earnings', sign: 1 },
  // IFS row 223 = Senior debt: Term (negative); GB R74 = Debt Closing Balance
  { ifsRow: 223, ref: 'R74', name: 'Ops Debt Balance', sign: -1 },
  // IFS row 238 = Balance sheet check 1; GB R195 = Balance Check
  { ifsRow: 238, ref: 'R195', name: 'BS Check', sign: 1, tolerance: 0.01 },

  // === Ratios ===
  // IFS row 255 = Periodic DSCR; GB R9071 = DSCR (via module)
  { ifsRow: 255, ref: 'R9071', name: 'Periodic DSCR', sign: 1, tolerance: 0.05 },
]

/**
 * Read IFS_month.xlsx and extract all row data.
 * Returns { periods: [{col, year, month}], rows: { [rowNum]: number[] } }
 */
export function readIFSExcel(filePath) {
  const XLSX = require('xlsx')
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets['IFS']
  const range = XLSX.utils.decode_range(ws['!ref'])

  // Row 6 (0-indexed: 5) has end-of-month dates as Excel serial numbers
  // Data columns start at index 9
  const DATA_START_COL = 9
  const dateRow = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    range: { s: { r: 5, c: DATA_START_COL }, e: { r: 5, c: range.e.c } },
    defval: 0,
    raw: true
  })[0]

  const periods = []
  for (let i = 0; i < dateRow.length; i++) {
    const serial = dateRow[i]
    if (typeof serial === 'number' && serial > 40000) {
      const d = new Date((serial - 25569) * 86400 * 1000)
      periods.push({ col: DATA_START_COL + i, year: d.getFullYear(), month: d.getMonth() + 1 })
    } else {
      break
    }
  }

  // Read all mapped rows
  const rows = {}
  for (const mapping of IFS_ROW_MAP) {
    const rowData = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      range: { s: { r: mapping.ifsRow - 1, c: DATA_START_COL }, e: { r: mapping.ifsRow - 1, c: DATA_START_COL + periods.length - 1 } },
      defval: 0,
      raw: true
    })[0]
    rows[mapping.ifsRow] = rowData || []
  }

  return { periods, rows }
}

/**
 * Compare GlassBox engine output against IFS Excel reference model.
 */
export function compareWithIFS(dataDir, ifsPath) {
  const { inputs, calculations } = loadModelDataSync(dataDir)
  const { calculationResults, timeline } = runServerModel(inputs, calculations)

  const ifs = readIFSExcel(ifsPath)
  const r = (ref) => calculationResults[ref] || new Array(timeline.periods).fill(0)

  // Build period alignment: match IFS periods to GlassBox periods by year/month
  const gbPeriodMap = {}
  for (let i = 0; i < timeline.periodLabels.length; i++) {
    gbPeriodMap[timeline.periodLabels[i]] = i
  }

  const report = {
    totalComparisons: 0,
    matches: 0,
    mismatches: [],
    skipped: 0,
    summary: []
  }

  for (const mapping of IFS_ROW_MAP) {
    const ifsValues = ifs.rows[mapping.ifsRow]
    if (!ifsValues) continue

    const gbValues = r(mapping.ref)
    const tolerance = mapping.tolerance || 0.02

    let matched = 0
    let compared = 0
    let maxDiff = 0
    let maxDiffPeriod = ''
    let maxDiffIFS = 0
    let maxDiffGB = 0

    for (let p = 0; p < ifs.periods.length; p++) {
      const period = ifs.periods[p]
      const label = `${period.year}-${String(period.month).padStart(2, '0')}`
      const gbIdx = gbPeriodMap[label]

      if (gbIdx === undefined) continue

      const ifsVal = (ifsValues[p] || 0) * mapping.sign
      const gbVal = gbValues[gbIdx] || 0

      compared++
      const diff = Math.abs(ifsVal - gbVal)
      if (diff <= tolerance) {
        matched++
      }
      if (diff > maxDiff) {
        maxDiff = diff
        maxDiffPeriod = label
        maxDiffIFS = ifsValues[p] || 0
        maxDiffGB = gbVal
      }
    }

    report.totalComparisons += compared
    report.matches += matched

    const entry = {
      name: mapping.name,
      ref: mapping.ref,
      ifsRow: mapping.ifsRow,
      compared,
      matched,
      matchPct: compared > 0 ? ((matched / compared) * 100).toFixed(1) : 'N/A',
      maxDiff: maxDiff.toFixed(6),
      maxDiffPeriod,
      maxDiffIFS: maxDiffIFS.toFixed(4),
      maxDiffGB: maxDiffGB.toFixed(4)
    }

    report.summary.push(entry)
    if (matched < compared) {
      report.mismatches.push(entry)
    }
  }

  report.overallMatchPct = report.totalComparisons > 0
    ? ((report.matches / report.totalComparisons) * 100).toFixed(1)
    : 'N/A'

  return report
}

/**
 * Print IFS comparison report.
 */
export function printIFSReport(report) {
  console.log('\n=== IFS vs GlassBox Comparison ===')
  console.log(`Overall match: ${report.overallMatchPct}% (${report.matches}/${report.totalComparisons} period-values)`)

  console.log('\nRow-by-row summary:')
  for (const entry of report.summary) {
    const status = entry.matched === entry.compared ? 'MATCH' : 'DIFF'
    console.log(`  ${status} ${entry.name} (${entry.ref}, IFS row ${entry.ifsRow}): ${entry.matchPct}% match, max diff ${entry.maxDiff} at ${entry.maxDiffPeriod}`)
    if (entry.matched < entry.compared) {
      console.log(`       IFS: ${entry.maxDiffIFS}, GB: ${entry.maxDiffGB}`)
    }
  }

  if (report.mismatches.length > 0) {
    console.log(`\n${report.mismatches.length} rows with differences`)
  } else {
    console.log('\nAll mapped rows match within tolerance!')
  }
}
