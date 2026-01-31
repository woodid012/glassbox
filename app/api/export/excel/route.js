// Excel Export API Route
// Generates XLSX with 7 sheets: Constants, CAPEX, OPEX, Flags & Time, Modules, Calcs (formulas), Summary

import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { generateExportBundle } from '@/utils/exportSchema'
import { runServerModel } from '@/utils/serverModelEngine'
import { buildRefMap, convertFormula, canConvertToExcel } from '@/utils/excelFormulaConverter'
import { loadModelData } from '@/utils/loadModelData'

export const dynamic = 'force-dynamic'

// ─── ZIP & XLSX Utilities ───

function createZipArchive(files) {
    const entries = []
    let centralDir = []
    let offset = 0

    for (const [filename, content] of Object.entries(files)) {
        const fileBuffer = Buffer.from(content, 'utf-8')
        const filenameBuffer = Buffer.from(filename, 'utf-8')

        const localHeader = Buffer.alloc(30 + filenameBuffer.length)
        localHeader.writeUInt32LE(0x04034b50, 0)
        localHeader.writeUInt16LE(10, 4)
        localHeader.writeUInt16LE(0, 6)
        localHeader.writeUInt16LE(0, 8)
        localHeader.writeUInt16LE(0, 10)
        localHeader.writeUInt16LE(0, 12)
        localHeader.writeUInt32LE(crc32(fileBuffer), 14)
        localHeader.writeUInt32LE(fileBuffer.length, 18)
        localHeader.writeUInt32LE(fileBuffer.length, 22)
        localHeader.writeUInt16LE(filenameBuffer.length, 26)
        localHeader.writeUInt16LE(0, 28)
        filenameBuffer.copy(localHeader, 30)

        entries.push(localHeader)
        entries.push(fileBuffer)

        const centralEntry = Buffer.alloc(46 + filenameBuffer.length)
        centralEntry.writeUInt32LE(0x02014b50, 0)
        centralEntry.writeUInt16LE(20, 4)
        centralEntry.writeUInt16LE(10, 6)
        centralEntry.writeUInt16LE(0, 8)
        centralEntry.writeUInt16LE(0, 10)
        centralEntry.writeUInt16LE(0, 12)
        centralEntry.writeUInt16LE(0, 14)
        centralEntry.writeUInt32LE(crc32(fileBuffer), 16)
        centralEntry.writeUInt32LE(fileBuffer.length, 20)
        centralEntry.writeUInt32LE(fileBuffer.length, 24)
        centralEntry.writeUInt16LE(filenameBuffer.length, 28)
        centralEntry.writeUInt16LE(0, 30)
        centralEntry.writeUInt16LE(0, 32)
        centralEntry.writeUInt16LE(0, 34)
        centralEntry.writeUInt16LE(0, 36)
        centralEntry.writeUInt32LE(0, 38)
        centralEntry.writeUInt32LE(offset, 42)
        filenameBuffer.copy(centralEntry, 46)

        centralDir.push(centralEntry)
        offset += localHeader.length + fileBuffer.length
    }

    const centralDirSize = centralDir.reduce((sum, b) => sum + b.length, 0)
    const endRecord = Buffer.alloc(22)
    endRecord.writeUInt32LE(0x06054b50, 0)
    endRecord.writeUInt16LE(0, 4)
    endRecord.writeUInt16LE(0, 6)
    endRecord.writeUInt16LE(centralDir.length, 8)
    endRecord.writeUInt16LE(centralDir.length, 10)
    endRecord.writeUInt32LE(centralDirSize, 12)
    endRecord.writeUInt32LE(offset, 16)
    endRecord.writeUInt16LE(0, 20)

    return Buffer.concat([...entries, ...centralDir, endRecord])
}

function crc32(buffer) {
    let crc = 0xFFFFFFFF
    const table = []
    for (let i = 0; i < 256; i++) {
        let c = i
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1))
        }
        table[i] = c
    }
    for (let i = 0; i < buffer.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF]
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
}

function colToLetter(col) {
    let letter = ''
    while (col > 0) {
        const mod = (col - 1) % 26
        letter = String.fromCharCode(65 + mod) + letter
        col = Math.floor((col - 1) / 26)
    }
    return letter || 'A'
}

function escapeXml(str) {
    if (str === null || str === undefined) return ''
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

// ─── Sheet Builders ───

/**
 * Build a worksheet XML from an array of rows.
 * Each row is an array of cells. Each cell can be:
 *   - { type: 'string', value: 'text' }
 *   - { type: 'number', value: 123 }
 *   - { type: 'formula', value: '=A1+B1' }
 *   - { type: 'static', value: 123 }  — pre-computed number, styled differently
 *   - simple string/number (auto-detected)
 *
 * Style indices:  0 = normal, 1 = bold, 2 = static fill (light amber bg + italic)
 */
function buildSheetXml(rows, addString) {
    const rowsXml = []
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx]
        if (!row) continue
        const cellsXml = []
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
            let cell = row[colIdx]
            if (cell === null || cell === undefined || cell === '') continue

            const cellRef = `${colToLetter(colIdx + 1)}${rowIdx + 1}`

            // Normalize cell to { type, value }
            if (typeof cell !== 'object' || cell === null) {
                if (typeof cell === 'number') {
                    cell = { type: 'number', value: cell }
                } else {
                    cell = { type: 'string', value: String(cell) }
                }
            }

            if (cell.type === 'static') {
                // Pre-computed static value — amber background + italic font (style 2)
                cellsXml.push(`<c r="${cellRef}" s="2"><v>${cell.value}</v></c>`)
            } else if (cell.type === 'number') {
                cellsXml.push(`<c r="${cellRef}"><v>${cell.value}</v></c>`)
            } else if (cell.type === 'formula') {
                cellsXml.push(`<c r="${cellRef}"><f>${escapeXml(cell.value)}</f></c>`)
            } else {
                const idx = addString(escapeXml(cell.value))
                cellsXml.push(`<c r="${cellRef}" t="s"><v>${idx}</v></c>`)
            }
        }
        if (cellsXml.length > 0) {
            rowsXml.push(`<row r="${rowIdx + 1}">${cellsXml.join('')}</row>`)
        }
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowsXml.join('')}</sheetData>
</worksheet>`
}

// ─── Sheet Data Builders ───

/**
 * Sheet 1: Constants — Ref | Name | Value (single value per row, replicated across period columns)
 * Row 1: Header (Ref, Name, period labels...)
 * Row 2+: One row per constant
 */
function buildConstantsSheet(bundle, periodLabels) {
    const rows = []
    // Header row
    const header = ['Ref', 'Name', 'Value', 'Total', ...periodLabels]
    rows.push(header)

    const constantsGroup = Object.entries(bundle.inputs || {}).find(([, g]) => g._meta?.entryMode === 'constant')
    const refRows = [] // Track refs and their row numbers for refMap
    const periodCount = periodLabels.length
    const firstPeriodCol = colToLetter(5) // E
    const lastPeriodCol = colToLetter(4 + periodCount)

    if (constantsGroup) {
        const [, groupData] = constantsGroup
        for (const [ref, data] of Object.entries(groupData)) {
            if (ref === '_meta') continue
            const rowNum = rows.length + 1
            const row = [ref, data.name, { type: 'number', value: data.value ?? 0 }]
            // Total column: SUM of all period values
            row.push({ type: 'formula', value: `SUM(${firstPeriodCol}${rowNum}:${lastPeriodCol}${rowNum})` })
            // Replicate value across all period columns (col E onward)
            for (let i = 0; i < periodCount; i++) {
                // Reference the Value column (C) so changing C propagates
                row.push({ type: 'formula', value: `$C${rowNum}` })
            }
            refRows.push({ ref, row: rowNum }) // 1-based row
            rows.push(row)
        }
    }

    return { rows, refRows }
}

/**
 * Sheet 2: CAPEX — time series with period columns
 */
function buildSeriesSheet(bundle, periodLabels, groupFilter, referenceMap, refAliases) {
    const rows = []
    const header = ['Ref', 'Name', 'Unit', 'Total', ...periodLabels]
    rows.push(header)
    const refRows = []
    const periodCount = periodLabels.length

    // Period data starts at column E (index 4), first period col letter = E
    const firstPeriodCol = colToLetter(5) // E
    const lastPeriodCol = colToLetter(4 + periodCount)

    for (const [, groupData] of Object.entries(bundle.inputs || {})) {
        const meta = groupData._meta
        if (!meta) continue
        if (!groupFilter(meta)) continue

        for (const [ref, data] of Object.entries(groupData)) {
            if (ref === '_meta') continue
            const rowNum = rows.length + 1
            const row = [ref, data.name, data.unit || '']
            // Total column: SUM of all period values
            row.push({ type: 'formula', value: `SUM(${firstPeriodCol}${rowNum}:${lastPeriodCol}${rowNum})` })
            // Prefer server-engine referenceMap values (correctly expanded with key period linking,
            // frequency spreading, and date-to-timeline mapping) over bundle values which
            // use the simplified extractSeriesGroup() that doesn't handle these.
            // Bundle uses ID-based refs (G8.156) while referenceMap uses position-based (S2.156),
            // so also check aliases for mismatched group refs.
            const refMapValues = referenceMap[ref] || (refAliases && refAliases[ref] && referenceMap[refAliases[ref]])
            const values = refMapValues || data.values || []
            for (let i = 0; i < periodCount; i++) {
                row.push({ type: 'number', value: values[i] ?? 0 })
            }
            refRows.push({ ref, row: rowNum })
            rows.push(row)
        }
    }

    return { rows, refRows }
}

/**
 * Sheet 4: Flags & Time — flags, indices, time constants as time series
 */
function buildFlagsSheet(bundle, periodLabels, referenceMap) {
    const rows = []
    const header = ['Ref', 'Name', 'Type', 'Total', ...periodLabels]
    rows.push(header)
    const refRows = []
    const periodCount = periodLabels.length
    const firstPeriodCol = colToLetter(5) // E
    const lastPeriodCol = colToLetter(4 + periodCount)

    function addFlagRow(ref, name, type, values) {
        const rowNum = rows.length + 1
        const row = [ref, name, type]
        row.push({ type: 'formula', value: `SUM(${firstPeriodCol}${rowNum}:${lastPeriodCol}${rowNum})` })
        for (let i = 0; i < periodCount; i++) {
            row.push({ type: 'number', value: values[i] ?? 0 })
        }
        refRows.push({ ref, row: rowNum })
        rows.push(row)
    }

    // Key period flags
    for (const [ref, data] of Object.entries(bundle.keyPeriods || {})) {
        addFlagRow(ref, data.name, 'Flag', data.flag)
        addFlagRow(`${ref}.Start`, `${data.name} Start`, 'Flag', data.flagStart)
        addFlagRow(`${ref}.End`, `${data.name} End`, 'Flag', data.flagEnd)
    }

    // Indices
    for (const [ref, data] of Object.entries(bundle.indices || {})) {
        addFlagRow(ref, data.name, 'Index', data.values)
    }

    // Time constants from referenceMap
    const timeRefs = ['T.MiY', 'T.DiY', 'T.DiM', 'T.HiY', 'T.HiD', 'T.HiM', 'T.QiY', 'T.MiQ', 'T.DiQ', 'T.QE', 'T.CYE', 'T.FYE']
    const timeNames = {
        'T.MiY': 'Months in Year', 'T.DiY': 'Days in Year', 'T.DiM': 'Days in Month',
        'T.HiY': 'Hours in Year', 'T.HiD': 'Hours in Day', 'T.HiM': 'Hours in Month',
        'T.QiY': 'Quarters in Year', 'T.MiQ': 'Months in Quarter', 'T.DiQ': 'Days in Quarter',
        'T.QE': 'Quarter End', 'T.CYE': 'Calendar Year End', 'T.FYE': 'Financial Year End'
    }
    for (const ref of timeRefs) {
        const arr = referenceMap[ref]
        if (!arr) continue
        addFlagRow(ref, timeNames[ref] || ref, 'Time', arr)
    }

    // Lookup refs from referenceMap (position-based L1.1, L1.2, L2.2, L3.1, etc.)
    // These match the refs used in formulas, unlike bundle.inputs which uses ID-based refs
    const lookupRefNames = Object.keys(referenceMap).filter(k => k.startsWith('L')).sort()
    for (const ref of lookupRefNames) {
        const arr = referenceMap[ref]
        if (!arr) continue
        addFlagRow(ref, ref, 'Lookup', arr)
    }

    return { rows, refRows }
}

/**
 * Sheet 5: Calcs — interleaved calculations and module outputs in dependency order.
 * Regular calcs get Excel formulas; module outputs with GlassBox-style formulas also
 * get Excel formulas; iterative/complex modules get static values (amber-styled).
 */
function buildCalcsSheet(periodLabels, refMap, calcResults, moduleOutputs, sortedNodeMeta) {
    const rows = []
    const header = ['Ref', 'Name', 'Formula', 'Total', ...periodLabels]
    rows.push(header)
    const refRows = []
    const periodCount = periodLabels.length

    // Period data starts at column E (index 4), first period col letter = E
    const firstPeriodCol = colToLetter(5) // E
    const lastPeriodCol = colToLetter(4 + periodCount)

    // All results in one map for static fallback lookup
    const allResults = { ...calcResults, ...moduleOutputs }

    for (const node of sortedNodeMeta) {
        const ref = node.ref
        const rowNum = rows.length + 1 // 1-based
        refRows.push({ ref, row: rowNum })

        const glassFormula = node.formula ?? null
        const canConvert = glassFormula && canConvertToExcel(glassFormula)

        const row = [ref, node.name, glassFormula || '(pre-computed)']
        // Total column: SUM of all period values
        row.push({ type: 'formula', value: `SUM(${firstPeriodCol}${rowNum}:${lastPeriodCol}${rowNum})` })

        if (canConvert && glassFormula !== '0') {
            // Try to convert each period to an Excel formula
            for (let i = 0; i < periodCount; i++) {
                const { formula: excelFormula } = convertFormula(glassFormula, refMap, i, 'Calcs')
                if (excelFormula) {
                    row.push({ type: 'formula', value: excelFormula.substring(1) }) // Remove leading '='
                } else {
                    // Fallback to static value (styled differently)
                    const staticValues = allResults[ref] || []
                    row.push({ type: 'static', value: staticValues[i] ?? 0 })
                }
            }
        } else if (glassFormula === '0') {
            // Zero-formula rows — plain numbers, nothing to convert
            for (let i = 0; i < periodCount; i++) {
                row.push({ type: 'number', value: 0 })
            }
        } else {
            // Static values: null formula (pre-computed module) or unconvertible
            const staticValues = allResults[ref] || []
            for (let i = 0; i < periodCount; i++) {
                row.push({ type: 'static', value: staticValues[i] ?? 0 })
            }
        }

        rows.push(row)
    }

    return { rows, refRows }
}

/**
 * Sheet 7: Summary
 */
function buildSummarySheet(bundle) {
    return [
        ['Glass Box Financial Model Export'],
        [`Exported: ${bundle.exported_at}`],
        [''],
        ['Timeline'],
        ['Start Year', { type: 'number', value: bundle.timeline.startYear }],
        ['Start Month', { type: 'number', value: bundle.timeline.startMonth }],
        ['End Year', { type: 'number', value: bundle.timeline.endYear }],
        ['End Month', { type: 'number', value: bundle.timeline.endMonth }],
        ['Total Periods', { type: 'number', value: bundle.timeline.periods }],
        [''],
        ['Sheet Guide'],
        ['Sheet', 'Contents'],
        ['Constants', 'Single-value inputs (C1.X) replicated across periods'],
        ['CAPEX', 'Capital expenditure time series (V1.X)'],
        ['OPEX', 'Operating expenditure time series (S1.X)'],
        ['Flags & Time', 'Period flags (F), indices (I), time constants (T), lookups (L)'],
        ['Calcs', 'Calculations (R) + module outputs (M) interleaved in dependency order'],
        [''],
        ['Formula Notes'],
        ['- Calcs sheet contains R-calcs and remaining M-module outputs in topological order'],
        ['- Most module outputs are now transparent GlassBox formulas (converted to Excel)'],
        ['- Solver outputs (debt sizing, forward-looking sums) use pre-computed static values'],
        ['- Change a constant on the Constants sheet and Calcs will recalculate'],
        ['- Amber/italic cells = pre-computed static values (solver output, too complex for Excel)']
    ]
}

/**
 * Build a mapping from bundle-style refs (G8.156, G101.141) to server-engine position-based refs (S2.156, S3.141).
 * This allows buildSeriesSheet to find values in the referenceMap for groups that use different naming.
 */
function buildBundleToServerAliases(inputs) {
    const aliases = {}
    const inputGlassGroups = inputs.inputGlassGroups || []
    const inputGlass = inputs.inputGlass || []

    const modeIndices = { values: 0, series: 0, constant: 0, timing: 0, lookup: 0 }
    const activeGroups = inputGlassGroups.filter(group =>
        inputGlass.some(input => input.groupId === group.id)
    )

    for (const group of activeGroups) {
        const groupInputs = inputGlass.filter(input => input.groupId === group.id)

        let normalizedMode
        if (group.groupType === 'timing') normalizedMode = 'timing'
        else if (group.groupType === 'constant') normalizedMode = 'constant'
        else {
            const groupMode = group.entryMode || groupInputs[0]?.mode || 'values'
            if (groupMode === 'lookup' || groupMode === 'lookup2') normalizedMode = 'lookup'
            else normalizedMode = groupMode
        }

        modeIndices[normalizedMode]++
        const modePrefix = normalizedMode === 'timing' ? 'T' :
                          normalizedMode === 'series' ? 'S' :
                          normalizedMode === 'constant' ? 'C' :
                          normalizedMode === 'lookup' ? 'L' : 'V'
        const serverRef = `${modePrefix}${modeIndices[normalizedMode]}`

        // Bundle ref
        const entryMode = group.entryMode || group.groupType || 'series'
        let bundleRef
        if (group.id === 100 || entryMode === 'constant') bundleRef = 'C1'
        else if (group.id === 1) bundleRef = 'V1'
        else if (group.id === 2) bundleRef = 'S1'
        else if (entryMode === 'lookup') bundleRef = `L${group.id}`
        else bundleRef = `G${group.id}`

        if (serverRef === bundleRef) continue

        // Map bundle group total → server group total
        aliases[bundleRef] = serverRef

        // Map per-input refs
        for (const input of groupInputs) {
            const inputNum = group.id === 100 ? input.id - 99 : input.id
            aliases[`${bundleRef}.${inputNum}`] = `${serverRef}.${inputNum}`
        }
    }

    return aliases
}

/**
 * Add aliases for position-based refs that the formula engine uses but the export bundle doesn't.
 * The formula engine uses position-based refs (S1, S2, S3...) while the export bundle
 * uses ID-based refs for non-standard groups (G8, G101). This bridges the gap.
 *
 * Replays the same group classification logic as serverModelEngine.buildReferenceMap
 * to build a mapping of position-based ref → export-bundle ref, then adds aliases.
 */
function addPositionBasedAliases(refMap, bundle, referenceMap, inputs) {
    const inputGlassGroups = inputs.inputGlassGroups || []
    const inputGlass = inputs.inputGlass || []

    // Replay position-based ref assignment (same logic as serverModelEngine.buildReferenceMap)
    const modeIndices = { values: 0, series: 0, constant: 0, timing: 0, lookup: 0 }
    const activeGroups = inputGlassGroups.filter(group =>
        inputGlass.some(input => input.groupId === group.id)
    )

    for (const group of activeGroups) {
        const groupInputs = inputGlass.filter(input => input.groupId === group.id)

        let normalizedMode
        if (group.groupType === 'timing') normalizedMode = 'timing'
        else if (group.groupType === 'constant') normalizedMode = 'constant'
        else {
            const groupMode = group.entryMode || groupInputs[0]?.mode || 'values'
            if (groupMode === 'lookup' || groupMode === 'lookup2') normalizedMode = 'lookup'
            else normalizedMode = groupMode
        }

        modeIndices[normalizedMode]++
        const modePrefix = normalizedMode === 'timing' ? 'T' :
                          normalizedMode === 'series' ? 'S' :
                          normalizedMode === 'constant' ? 'C' :
                          normalizedMode === 'lookup' ? 'L' : 'V'
        const positionRef = `${modePrefix}${modeIndices[normalizedMode]}` // e.g., S3

        // Determine the export bundle ref for this group
        const entryMode = group.entryMode || group.groupType || 'series'
        let exportRef
        if (group.id === 100 || entryMode === 'constant') exportRef = 'C1'
        else if (group.id === 1) exportRef = 'V1'
        else if (group.id === 2) exportRef = 'S1'
        else if (entryMode === 'lookup') exportRef = `L${group.id}`
        else exportRef = `G${group.id}`

        // Skip if position ref === export ref (no alias needed)
        if (positionRef === exportRef) continue

        // Add alias: position-based group subtotal → export bundle's row
        if (refMap.has(exportRef) && !refMap.has(positionRef)) {
            refMap.set(positionRef, refMap.get(exportRef))
        }

        // Add aliases for per-input refs
        // Position-based: S3.{inputNum}, Export-based: G101.{inputNum}
        for (const input of groupInputs) {
            const inputNum = group.id === 100 ? input.id - 99 : input.id
            const posInputRef = `${positionRef}.${inputNum}`
            const exportInputRef = `${exportRef}.${inputNum}`

            if (refMap.has(exportInputRef) && !refMap.has(posInputRef)) {
                refMap.set(posInputRef, refMap.get(exportInputRef))
            }
        }
    }
}

// ─── Main Generator ───

function generateXlsxFiles(bundle, modelResults, rawInputs) {
    const files = {}
    const periodLabels = bundle.timeline.periodLabels || []
    const { calculationResults, moduleOutputs, referenceMap, sortedNodeMeta } = modelResults

    // Shared string table
    const strings = []
    const stringIndex = {}
    function addString(s) {
        const str = String(s)
        if (!(str in stringIndex)) {
            stringIndex[str] = strings.length
            strings.push(str)
        }
        return stringIndex[str]
    }

    // ─── Build bundle-ref → server-ref aliases ───
    // The export bundle uses ID-based refs (G8.156, G101.141) while the server engine's
    // referenceMap uses position-based refs (S2.156, S3.141). Build a mapping to bridge them.
    const refAliases = buildBundleToServerAliases(rawInputs)

    // ─── Build sheet data ───

    // Sheet 1: Constants
    const constants = buildConstantsSheet(bundle, periodLabels)

    // Sheet 2: CAPEX
    const capex = buildSeriesSheet(bundle, periodLabels, (meta) =>
        meta.refPrefix === 'V1' && meta.entryMode !== 'constant'
    , referenceMap, refAliases)

    // Sheet 3: OPEX (S1 + any other series groups like S3)
    const opex = buildSeriesSheet(bundle, periodLabels, (meta) =>
        (meta.refPrefix?.startsWith('S') || meta.refPrefix?.startsWith('G')) && meta.entryMode !== 'constant'
    , referenceMap, refAliases)

    // Sheet 4: Flags & Time
    const flags = buildFlagsSheet(bundle, periodLabels, referenceMap)

    // ─── Build refMap for formula conversion ───
    // First, register all input refs from sheets 1-4,
    // then pre-register all Calcs rows (interleaved calcs + modules) for self-references

    const sheetLayout = {
        constants: { sheetName: 'Constants', refs: constants.refRows },
        capex: { sheetName: 'CAPEX', refs: capex.refRows },
        opex: { sheetName: 'OPEX', refs: opex.refRows },
        flags: { sheetName: 'Flags & Time', refs: flags.refRows }
    }

    // Pre-register all Calcs rows (both R-refs and M-refs) based on sortedNodeMeta order
    const calcsRefRows = sortedNodeMeta.map((node, idx) => ({ ref: node.ref, row: idx + 2 })) // Row 1 is header
    sheetLayout.calcs = { sheetName: 'Calcs', refs: calcsRefRows }

    const refMap = buildRefMap(sheetLayout)

    // Add position-based ref aliases (e.g., S3 → G101's row on OPEX sheet)
    // The formula engine uses position-based refs (S1, S2, S3...) while the export
    // bundle uses ID-based refs (S1, G8, G101). Bridge them here.
    addPositionBasedAliases(refMap, bundle, referenceMap, rawInputs)

    // Sheet 5: Calcs (interleaved calcs + modules, with formulas)
    const calcs = buildCalcsSheet(periodLabels, refMap, calculationResults, moduleOutputs, sortedNodeMeta)

    // Sheet 6: Summary
    const summaryRows = buildSummarySheet(bundle)

    // ─── Generate worksheet XML files ───
    const sheetNames = ['Constants', 'CAPEX', 'OPEX', 'Flags & Time', 'Calcs', 'Summary']
    const sheetData = [constants.rows, capex.rows, opex.rows, flags.rows, calcs.rows, summaryRows]

    for (let i = 0; i < sheetNames.length; i++) {
        files[`xl/worksheets/sheet${i + 1}.xml`] = buildSheetXml(sheetData[i], addString)
    }

    // ─── XLSX package files ───

    const sheetCount = sheetNames.length

    // [Content_Types].xml
    const sheetOverrides = sheetNames.map((_, i) =>
        `  <Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join('\n')

    files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheetOverrides}
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

    files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

    // Workbook rels
    const wbRels = sheetNames.map((_, i) =>
        `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    ).join('\n')

    files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${wbRels}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId${sheetCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

    // Workbook
    const sheetEntries = sheetNames.map((name, i) =>
        `    <sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    ).join('\n')

    files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${sheetEntries}
  </sheets>
</workbook>`

    // Styles
    // Style index 0 = normal, 1 = bold, 2 = static (amber bg + italic + gray text)
    files['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
    <font><i/><sz val="11"/><name val="Calibri"/><color rgb="FF888888"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF3E0"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border/>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`

    // Shared strings
    files['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${strings.map(s => `<si><t>${escapeXml(s)}</t></si>`).join('\n')}
</sst>`

    return files
}

// ─── API Route ───

export async function GET() {
    try {
        const dataDir = path.join(process.cwd(), 'data')
        const { inputs, calculations } = await loadModelData(dataDir)

        // Run server-side model to get all computed results
        const modelResults = runServerModel(inputs, calculations)

        // Generate export bundle (for metadata, structured groups, module info)
        const bundle = generateExportBundle(inputs, calculations)

        // Generate XLSX files with formula-based Calcs sheet
        const xlsxFiles = generateXlsxFiles(bundle, modelResults, inputs)

        // Create ZIP archive
        const zipBuffer = createZipArchive(xlsxFiles)

        return new NextResponse(zipBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="GlassBox_Model.xlsx"',
                'Content-Length': zipBuffer.length.toString()
            }
        })
    } catch (error) {
        console.error('Excel export error:', error)
        return NextResponse.json(
            { error: 'Failed to generate Excel export', details: error.message, stack: error.stack },
            { status: 500 }
        )
    }
}
