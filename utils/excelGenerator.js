// Excel Generator - Generate Excel workbook from Glass Box model
// Creates self-calculating workbook with formulas, named ranges, and cross-sheet references

/**
 * Generate Excel workbook structure from export bundle
 * This returns a structure that can be used with ExcelJS or similar library
 * @param {Object} bundle - Export bundle from generateExportBundle
 * @returns {Object} Workbook structure with sheets and data
 */
export function generateExcelWorkbook(bundle) {
    const workbook = {
        metadata: {
            title: 'Glass Box Financial Model',
            exported: bundle.exported_at,
            version: bundle.version
        },
        sheets: [],
        namedRanges: {}
    }

    // Generate named ranges map
    const namedRanges = buildNamedRanges(bundle)
    workbook.namedRanges = namedRanges

    // Sheet 1: Summary Dashboard
    workbook.sheets.push(generateSummarySheet(bundle, namedRanges))

    // Sheet 2: Timeline
    workbook.sheets.push(generateTimelineSheet(bundle))

    // Sheet 3: Constants
    workbook.sheets.push(generateConstantsSheet(bundle, namedRanges))

    // Sheet 4: Inputs - CAPEX
    workbook.sheets.push(generateInputSheet(bundle, 'V1', 'CAPEX', namedRanges))

    // Sheet 5: Inputs - OPEX
    workbook.sheets.push(generateInputSheet(bundle, 'S1', 'OPEX', namedRanges))

    // Sheet 6: Flags & Indices
    workbook.sheets.push(generateFlagsSheet(bundle, namedRanges))

    // Calculation sheets by tab
    const calcsByTab = organizeCalculationsByTab(bundle)
    Object.entries(calcsByTab).forEach(([tabName, groups]) => {
        workbook.sheets.push(generateCalculationSheet(bundle, tabName, groups, namedRanges))
    })

    // Module output sheets
    bundle.modules.forEach(mod => {
        workbook.sheets.push(generateModuleSheet(bundle, mod, namedRanges))
    })

    return workbook
}

/**
 * Build named ranges map for all references
 */
function buildNamedRanges(bundle) {
    const ranges = {}
    const periods = bundle.timeline.periods

    // Constants: C1.{idx} -> Const_C1_{idx}
    Object.keys(bundle.inputs.constants || {}).forEach(ref => {
        const safeName = ref.replace(/\./g, '_')
        ranges[ref] = `Const_${safeName}`
    })

    // CAPEX: V1.{id} -> CAPEX_V1_{id}
    Object.keys(bundle.inputs.capex || {}).forEach(ref => {
        const safeName = ref.replace(/\./g, '_')
        ranges[ref] = `CAPEX_${safeName}`
    })

    // OPEX: S1.{id} -> OPEX_S1_{id}
    Object.keys(bundle.inputs.opex || {}).forEach(ref => {
        const safeName = ref.replace(/\./g, '_')
        ranges[ref] = `OPEX_${safeName}`
    })

    // Lookups
    Object.keys(bundle.inputs.lookups || {}).forEach(ref => {
        const safeName = ref.replace(/\./g, '_')
        ranges[ref] = `Lookup_${safeName}`
    })

    // Flags
    Object.keys(bundle.inputs.keyPeriods || {}).forEach(ref => {
        const safeName = ref.replace(/\./g, '_')
        ranges[ref] = `Flag_${safeName}`
        ranges[`${ref}.Start`] = `Flag_${safeName}_Start`
        ranges[`${ref}.End`] = `Flag_${safeName}_End`
    })

    // Indices
    Object.keys(bundle.inputs.indices || {}).forEach(ref => {
        const safeName = ref.replace(/\./g, '_')
        ranges[ref] = `Index_${safeName}`
    })

    // Calculations
    Object.keys(bundle.calculations.items || {}).forEach(ref => {
        ranges[ref] = `Calc_${ref}`
    })

    // Module outputs
    bundle.modules.forEach(mod => {
        mod.outputs.forEach(out => {
            const safeName = out.ref.replace(/\./g, '_')
            ranges[out.ref] = `Module_${safeName}`
        })
    })

    // Time constants
    ranges['T.MiY'] = '12'  // Direct value
    ranges['T.DiY'] = '365'
    ranges['T.DiM'] = '30'
    ranges['T.QiY'] = '4'
    ranges['T.HiD'] = '24'
    ranges['T.HiY'] = '8760'
    ranges['T.MiQ'] = '3'

    return ranges
}

/**
 * Generate Summary Dashboard sheet
 */
function generateSummarySheet(bundle, namedRanges) {
    return {
        name: 'Summary',
        columns: [
            { header: 'Metric', width: 30 },
            { header: 'Value', width: 20 },
            { header: 'Unit', width: 15 }
        ],
        rows: [
            ['Glass Box Financial Model', '', ''],
            [`Exported: ${bundle.exported_at}`, '', ''],
            ['', '', ''],
            ['KEY METRICS', '', ''],
            ['Total Revenue', { formula: `=SUM(Calc_R8)` }, '$M'],
            ['Total OPEX', { formula: `=SUM(Calc_R9)` }, '$M'],
            ['Total EBITDA', { formula: `=SUM(Calc_R13)` }, '$M'],
            ['Net Income', { formula: `=SUM(Calc_R19)` }, '$M'],
            ['', '', ''],
            ['DEBT', '', ''],
            ['Sized Debt', { formula: `=INDEX(Module_M1_1,1)` }, '$M'],
            ['Total Interest', { formula: `=SUM(Module_M1_3)` }, '$M'],
            ['Total Principal', { formula: `=SUM(Module_M1_4)` }, '$M'],
            ['', '', ''],
            ['TIMELINE', '', ''],
            ['Start', `${bundle.timeline.startYear}-${String(bundle.timeline.startMonth).padStart(2, '0')}`, ''],
            ['End', `${bundle.timeline.endYear}-${String(bundle.timeline.endMonth).padStart(2, '0')}`, ''],
            ['Periods', bundle.timeline.periods, 'months']
        ]
    }
}

/**
 * Generate Timeline sheet
 */
function generateTimelineSheet(bundle) {
    const headerRow = ['Period', 'Year', 'Month', 'Label']

    const dataRows = bundle.timeline.year.map((year, i) => [
        i + 1,
        year,
        bundle.timeline.month[i],
        bundle.timeline.periodLabels[i]
    ])

    return {
        name: 'Timeline',
        columns: [
            { header: 'Period', width: 10 },
            { header: 'Year', width: 10 },
            { header: 'Month', width: 10 },
            { header: 'Label', width: 15 }
        ],
        rows: dataRows,
        namedRanges: {
            'Timeline_Period': { row: 2, col: 1, height: bundle.timeline.periods },
            'Timeline_Year': { row: 2, col: 2, height: bundle.timeline.periods },
            'Timeline_Month': { row: 2, col: 3, height: bundle.timeline.periods }
        }
    }
}

/**
 * Generate Constants sheet
 */
function generateConstantsSheet(bundle, namedRanges) {
    const constants = bundle.inputs.constants || {}

    // Build header row with period columns
    const headerRow = ['Reference', 'Name', 'Value', 'Unit']

    const dataRows = Object.entries(constants).map(([ref, data]) => [
        ref,
        data.name,
        data.value,
        data.unit || ''
    ])

    // Named ranges for constants (single cell values)
    const sheetNamedRanges = {}
    Object.entries(constants).forEach(([ref, data], i) => {
        const safeName = `Const_${ref.replace(/\./g, '_')}`
        sheetNamedRanges[safeName] = { row: i + 2, col: 3, height: 1, width: 1 }
    })

    return {
        name: 'Constants',
        columns: [
            { header: 'Reference', width: 15 },
            { header: 'Name', width: 30 },
            { header: 'Value', width: 15 },
            { header: 'Unit', width: 10 }
        ],
        rows: dataRows,
        namedRanges: sheetNamedRanges
    }
}

/**
 * Generate Input sheet (CAPEX or OPEX)
 */
function generateInputSheet(bundle, prefix, name, namedRanges) {
    const inputs = prefix === 'V1' ? bundle.inputs.capex : bundle.inputs.opex
    const periods = bundle.timeline.periods

    // Header row: Reference, Name, then period columns
    const periodHeaders = bundle.timeline.periodLabels.map((label, i) => `P${i + 1}`)
    const headerRow = ['Reference', 'Name', 'Total', ...periodHeaders]

    // Data rows
    const dataRows = []
    const sheetNamedRanges = {}

    Object.entries(inputs || {}).forEach(([ref, data], rowIdx) => {
        const row = [
            ref,
            data.name,
            { formula: `=SUM(D${rowIdx + 2}:${colToLetter(3 + periods)}${rowIdx + 2})` },
            ...data.values
        ]
        dataRows.push(row)

        // Named range for this input row (period values only)
        const safeName = `${name}_${ref.replace(/\./g, '_')}`
        sheetNamedRanges[safeName] = {
            row: rowIdx + 2,
            col: 4,  // Start at column D
            width: periods
        }
    })

    return {
        name: `Input_${name}`,
        columns: [
            { header: 'Reference', width: 15 },
            { header: 'Name', width: 30 },
            { header: 'Total', width: 12 },
            ...periodHeaders.map(() => ({ width: 10 }))
        ],
        rows: dataRows,
        namedRanges: sheetNamedRanges,
        freezeCol: 3
    }
}

/**
 * Generate Flags & Indices sheet
 */
function generateFlagsSheet(bundle, namedRanges) {
    const periods = bundle.timeline.periods
    const periodHeaders = bundle.timeline.periodLabels.map((label, i) => `P${i + 1}`)

    const dataRows = []
    const sheetNamedRanges = {}
    let rowIdx = 0

    // Key Period Flags
    Object.entries(bundle.inputs.keyPeriods || {}).forEach(([ref, data]) => {
        // Main flag
        dataRows.push([ref, data.name, 'Flag', ...data.flag])
        const safeName = `Flag_${ref.replace(/\./g, '_')}`
        sheetNamedRanges[safeName] = { row: rowIdx + 2, col: 4, width: periods }
        rowIdx++

        // Start flag
        dataRows.push([`${ref}.Start`, `${data.name} Start`, 'Start', ...data.flagStart])
        sheetNamedRanges[`${safeName}_Start`] = { row: rowIdx + 2, col: 4, width: periods }
        rowIdx++

        // End flag
        dataRows.push([`${ref}.End`, `${data.name} End`, 'End', ...data.flagEnd])
        sheetNamedRanges[`${safeName}_End`] = { row: rowIdx + 2, col: 4, width: periods }
        rowIdx++
    })

    // Blank row
    dataRows.push(['', '', '', ...new Array(periods).fill('')])
    rowIdx++

    // Indices
    Object.entries(bundle.inputs.indices || {}).forEach(([ref, data]) => {
        dataRows.push([ref, data.name, `${data.rate}%/yr`, ...data.values])
        const safeName = `Index_${ref.replace(/\./g, '_')}`
        sheetNamedRanges[safeName] = { row: rowIdx + 2, col: 4, width: periods }
        rowIdx++
    })

    // Time flags
    const month = bundle.timeline.month
    const qeFlag = month.map(m => [3, 6, 9, 12].includes(m) ? 1 : 0)
    const cyeFlag = month.map(m => m === 12 ? 1 : 0)
    const fyeFlag = month.map(m => m === 6 ? 1 : 0)

    dataRows.push(['', '', '', ...new Array(periods).fill('')])
    rowIdx++

    dataRows.push(['T.QE', 'Quarter End', 'Time', ...qeFlag])
    sheetNamedRanges['Time_QE'] = { row: rowIdx + 2, col: 4, width: periods }
    rowIdx++

    dataRows.push(['T.CYE', 'Calendar Year End', 'Time', ...cyeFlag])
    sheetNamedRanges['Time_CYE'] = { row: rowIdx + 2, col: 4, width: periods }
    rowIdx++

    dataRows.push(['T.FYE', 'Financial Year End', 'Time', ...fyeFlag])
    sheetNamedRanges['Time_FYE'] = { row: rowIdx + 2, col: 4, width: periods }
    rowIdx++

    return {
        name: 'Flags_Indices',
        columns: [
            { header: 'Reference', width: 15 },
            { header: 'Name', width: 25 },
            { header: 'Type', width: 10 },
            ...periodHeaders.map(() => ({ width: 8 }))
        ],
        rows: dataRows,
        namedRanges: sheetNamedRanges,
        freezeCol: 3
    }
}

/**
 * Organize calculations by tab
 */
function organizeCalculationsByTab(bundle) {
    const tabs = {}
    const tabsById = {}
    const groupsById = {}

    // Build lookup maps
    ;(bundle.calculations.tabs || []).forEach(t => {
        tabsById[t.id] = t.name
    })
    ;(bundle.calculations.groups || []).forEach(g => {
        groupsById[g.id] = g
    })

    // Organize calculations
    Object.entries(bundle.calculations.items || {}).forEach(([ref, calc]) => {
        // Determine tab name
        let tabName = 'Calculations'
        if (calc.groupId && groupsById[calc.groupId]) {
            const group = groupsById[calc.groupId]
            if (group.tabId && tabsById[group.tabId]) {
                tabName = tabsById[group.tabId]
            }
        } else if (calc.tabId && tabsById[calc.tabId]) {
            tabName = tabsById[calc.tabId]
        }

        // Determine group name
        let groupName = 'Ungrouped'
        if (calc.groupId && groupsById[calc.groupId]) {
            groupName = groupsById[calc.groupId].name
        }

        if (!tabs[tabName]) {
            tabs[tabName] = {}
        }
        if (!tabs[tabName][groupName]) {
            tabs[tabName][groupName] = []
        }

        tabs[tabName][groupName].push({ ref, ...calc })
    })

    return tabs
}

/**
 * Generate Calculation sheet for a tab
 */
function generateCalculationSheet(bundle, tabName, groups, namedRanges) {
    const periods = bundle.timeline.periods
    const periodHeaders = bundle.timeline.periodLabels.map((label, i) => `P${i + 1}`)

    const dataRows = []
    const sheetNamedRanges = {}
    let rowIdx = 0

    Object.entries(groups).forEach(([groupName, calcs]) => {
        // Group header
        dataRows.push([groupName.toUpperCase(), '', '', ...new Array(periods).fill('')])
        rowIdx++

        calcs.forEach(calc => {
            // Convert formula to Excel
            const excelFormula = convertFormulaToExcel(calc.formula, namedRanges, rowIdx + 2, periods)

            // For now, we'll show the formula in the first period cell and values in others
            // In a real implementation, each cell would have its own formula
            const row = [
                calc.ref,
                calc.name,
                calc.formula || '0',
                // Period values - in a real workbook these would be formulas
                ...new Array(periods).fill({ formula: excelFormula })
            ]
            dataRows.push(row)

            // Named range for this calculation
            sheetNamedRanges[`Calc_${calc.ref}`] = {
                row: rowIdx + 2,
                col: 4,
                width: periods
            }
            rowIdx++
        })

        // Blank row between groups
        dataRows.push(['', '', '', ...new Array(periods).fill('')])
        rowIdx++
    })

    return {
        name: `Calc_${tabName}`.substring(0, 31),  // Excel sheet name limit
        columns: [
            { header: 'Ref', width: 10 },
            { header: 'Name', width: 30 },
            { header: 'Formula', width: 40 },
            ...periodHeaders.map(() => ({ width: 12 }))
        ],
        rows: dataRows,
        namedRanges: sheetNamedRanges,
        freezeCol: 3
    }
}

/**
 * Generate Module output sheet
 */
function generateModuleSheet(bundle, mod, namedRanges) {
    const periods = bundle.timeline.periods
    const periodHeaders = bundle.timeline.periodLabels.map((label, i) => `P${i + 1}`)

    const dataRows = []
    const sheetNamedRanges = {}

    // Module info header
    dataRows.push([`Module ${mod.index}: ${mod.name}`, '', '', ...new Array(periods).fill('')])
    dataRows.push([mod.description, '', '', ...new Array(periods).fill('')])
    dataRows.push(['', '', '', ...new Array(periods).fill('')])

    let rowIdx = 3

    // Module outputs
    // Note: In a real implementation, these would be calculated values or linked to the web app's solved values
    mod.outputs.forEach(output => {
        dataRows.push([
            output.ref,
            output.label,
            output.key,
            // Values would come from pre-computed results
            ...new Array(periods).fill(0)
        ])

        const safeName = `Module_${output.ref.replace(/\./g, '_')}`
        sheetNamedRanges[safeName] = {
            row: rowIdx + 2,
            col: 4,
            width: periods
        }
        rowIdx++
    })

    return {
        name: `Module_M${mod.index}`,
        columns: [
            { header: 'Ref', width: 10 },
            { header: 'Output', width: 30 },
            { header: 'Key', width: 20 },
            ...periodHeaders.map(() => ({ width: 12 }))
        ],
        rows: dataRows,
        namedRanges: sheetNamedRanges,
        freezeCol: 3
    }
}

/**
 * Convert Glass Box formula to Excel formula
 * This is a simplified conversion - a full implementation would handle each cell individually
 */
function convertFormulaToExcel(formula, namedRanges, row, periods) {
    if (!formula || formula === '0') return '0'

    let xl = formula

    // Replace power operator
    xl = xl.replace(/\^/g, '^')

    // Convert MIN/MAX/ABS
    xl = xl.replace(/\bMIN\s*\(/gi, 'MIN(')
    xl = xl.replace(/\bMAX\s*\(/gi, 'MAX(')
    xl = xl.replace(/\bABS\s*\(/gi, 'ABS(')

    // Handle array functions - these need special treatment in Excel
    // CUMSUM -> SUM of range up to current column
    xl = xl.replace(/CUMSUM\s*\(([^)]+)\)/gi, (match, inner) => {
        // In a real implementation, this would create a proper Excel SUMPRODUCT formula
        return `CUMSUM(${inner})`
    })

    // SHIFT -> OFFSET pattern
    xl = xl.replace(/SHIFT\s*\(\s*([^,]+)\s*,\s*(\d+)\s*\)/gi, (match, inner, n) => {
        return `SHIFT(${inner},${n})`
    })

    // Replace references with named ranges
    // Sort by length (longer first) to avoid partial matches
    const sortedRefs = Object.keys(namedRanges).sort((a, b) => b.length - a.length)

    sortedRefs.forEach(ref => {
        // Escape special regex characters
        const escaped = ref.replace(/\./g, '\\.').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
        const regex = new RegExp(`\\b${escaped}\\b`, 'g')

        const replacement = namedRanges[ref]
        // If it's a direct value (like T.MiY = 12), use the value
        if (/^\d+$/.test(replacement)) {
            xl = xl.replace(regex, replacement)
        } else {
            xl = xl.replace(regex, replacement)
        }
    })

    return xl
}

/**
 * Convert column number to Excel letter (1=A, 2=B, etc.)
 */
function colToLetter(col) {
    let letter = ''
    while (col > 0) {
        const mod = (col - 1) % 26
        letter = String.fromCharCode(65 + mod) + letter
        col = Math.floor((col - 1) / 26)
    }
    return letter
}

/**
 * Generate ExcelJS-compatible workbook (to be used in the API route)
 * @param {Object} bundle - Export bundle
 * @param {Object} ExcelJS - ExcelJS module
 * @returns {Object} ExcelJS Workbook
 */
export async function generateExcelJSWorkbook(bundle, ExcelJS) {
    const workbookStructure = generateExcelWorkbook(bundle)
    const workbook = new ExcelJS.Workbook()

    workbook.creator = 'Glass Box'
    workbook.created = new Date()
    workbook.title = workbookStructure.metadata.title

    // Create sheets
    for (const sheetDef of workbookStructure.sheets) {
        const sheet = workbook.addWorksheet(sheetDef.name)

        // Set column widths
        if (sheetDef.columns) {
            sheet.columns = sheetDef.columns.map((col, i) => ({
                key: `col${i}`,
                width: col.width || 12,
                header: col.header
            }))
        }

        // Add header row
        const headers = sheetDef.columns?.map(c => c.header) || []
        if (headers.length > 0) {
            const headerRow = sheet.getRow(1)
            headers.forEach((h, i) => {
                headerRow.getCell(i + 1).value = h
            })
            headerRow.font = { bold: true }
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            }
        }

        // Add data rows
        sheetDef.rows?.forEach((rowData, rowIdx) => {
            const row = sheet.getRow(rowIdx + 2)  // +2 for header
            rowData.forEach((cellValue, colIdx) => {
                const cell = row.getCell(colIdx + 1)
                if (cellValue && typeof cellValue === 'object' && cellValue.formula) {
                    cell.value = { formula: cellValue.formula }
                } else {
                    cell.value = cellValue
                }
            })
        })

        // Freeze panes
        if (sheetDef.freezeCol) {
            sheet.views = [{
                state: 'frozen',
                xSplit: sheetDef.freezeCol,
                ySplit: 1
            }]
        }
    }

    // Add named ranges
    // Note: ExcelJS handles named ranges differently, would need sheet-specific implementation

    return workbook
}

/**
 * Export workbook structure for debugging or alternative serialization
 */
export function exportWorkbookStructure(bundle) {
    return generateExcelWorkbook(bundle)
}
