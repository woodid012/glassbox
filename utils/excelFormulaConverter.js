// Excel Formula Converter
// Converts GlassBox formulas to working Excel formulas with cell references
// Each GlassBox reference (R4, C1.10, V1, F6, etc.) maps to an Excel sheet+row

/**
 * Build a mapping from GlassBox references to Excel cell positions.
 * Each entry: { sheet, row } where row is 1-based Excel row number.
 * The period column is computed separately (first period = column D).
 *
 * @param {Object} sheetLayout - Layout info for each sheet
 *   { constants: { refs: [{ref, row}] }, capex: {...}, opex: {...}, flags: {...}, modules: {...}, calcs: {...} }
 * @returns {Map<string, {sheet: string, row: number}>}
 */
export function buildRefMap(sheetLayout) {
    const refMap = new Map()

    for (const [sheetKey, sheetInfo] of Object.entries(sheetLayout)) {
        const sheetName = sheetInfo.sheetName
        for (const entry of sheetInfo.refs) {
            refMap.set(entry.ref, { sheet: sheetName, row: entry.row })
        }
    }

    return refMap
}

/**
 * Convert a column number (1-based) to Excel letter (A, B, ..., Z, AA, AB, ...)
 */
function colToLetter(col) {
    let letter = ''
    while (col > 0) {
        const mod = (col - 1) % 26
        letter = String.fromCharCode(65 + mod) + letter
        col = Math.floor((col - 1) / 26)
    }
    return letter || 'A'
}

/**
 * First data column for period values (column E = 5, after Ref/Name/Unit-or-Formula/Total).
 */
const FIRST_DATA_COL = 5

/**
 * Convert a GlassBox formula to an Excel formula for a specific period column.
 *
 * @param {string} formula - GlassBox formula (e.g., "R4 + R7 * C1.10")
 * @param {Map} refMap - Reference-to-cell mapping from buildRefMap
 * @param {number} periodIndex - 0-based period index
 * @param {string} calcsSheet - Name of the Calcs sheet for same-sheet references
 * @returns {{ formula: string, helperRows: Object[] }} Excel formula string and any needed helper rows
 */
export function convertFormula(formula, refMap, periodIndex, calcsSheet = 'Calcs') {
    if (!formula || !formula.trim() || formula.trim() === '0') {
        return { formula: null, helperRows: [] }
    }

    const col = FIRST_DATA_COL + periodIndex  // Excel column number (1-based)
    const colLetter = colToLetter(col)
    const helperRows = []

    let excelFormula = formula

    // --- 1. Process array functions (CUMSUM, CUMPROD, SHIFT, PREVSUM, PREVVAL, COUNT) ---
    // Must be done before simple ref replacement

    // CUMSUM(expr) → running SUM from first data column to current column
    excelFormula = processNestedFunction(excelFormula, 'CUMSUM', (innerExpr) => {
        const firstColLetter = colToLetter(FIRST_DATA_COL)

        // Case 1: Literal number like CUMSUM(1) → running count
        const trimmed = innerExpr.trim()
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            // CUMSUM(1) = column index - first column index + 1 (but as simple formula)
            // Use: (COLUMN()-COLUMN($D$1)+1)*value
            return `(COLUMN()-COLUMN($${firstColLetter}$1)+1)*${trimmed}`
        }

        const innerCellRef = resolveExprToCellRef(innerExpr, refMap, col, calcsSheet)
        if (innerCellRef.isSimple) {
            // Simple CUMSUM(R81) → SUM($D$row:D$row) using running range
            return `SUM(${innerCellRef.sheetPrefix}$${firstColLetter}$${innerCellRef.row}:${innerCellRef.sheetPrefix}${colLetter}$${innerCellRef.row})`
        }

        // Case 3: Product of exactly 2 refs → SUMPRODUCT with running ranges
        const productMatch = trimmed.match(/^([A-Z]\d+(?:\.\d+)*)\s*\*\s*([A-Z]\d+(?:\.\d+)*)$/i)
        if (productMatch) {
            const ref1 = refMap.get(productMatch[1])
            const ref2 = refMap.get(productMatch[2])
            if (ref1 && ref2) {
                const sp1 = ref1.sheet === calcsSheet ? '' : `'${ref1.sheet}'!`
                const sp2 = ref2.sheet === calcsSheet ? '' : `'${ref2.sheet}'!`
                return `SUMPRODUCT(${sp1}$${firstColLetter}$${ref1.row}:${sp1}${colLetter}$${ref1.row},${sp2}$${firstColLetter}$${ref2.row}:${sp2}${colLetter}$${ref2.row})`
            }
        }

        // Case 4: Sum of refs → SUM of individual CUMSUMs
        const sumMatch = trimmed.match(/^([A-Z]\d+(?:\.\d+)*)\s*\+\s*([A-Z]\d+(?:\.\d+)*)$/i)
        if (sumMatch) {
            const ref1 = refMap.get(sumMatch[1])
            const ref2 = refMap.get(sumMatch[2])
            if (ref1 && ref2) {
                const sp1 = ref1.sheet === calcsSheet ? '' : `'${ref1.sheet}'!`
                const sp2 = ref2.sheet === calcsSheet ? '' : `'${ref2.sheet}'!`
                return `SUM(${sp1}$${firstColLetter}$${ref1.row}:${sp1}${colLetter}$${ref1.row})+SUM(${sp2}$${firstColLetter}$${ref2.row}:${sp2}${colLetter}$${ref2.row})`
            }
        }

        // Fallback: can't convert compound CUMSUM
        return null
    })

    // CUMPROD(expr) → PRODUCT from first data column to current column
    excelFormula = processNestedFunction(excelFormula, 'CUMPROD', (innerExpr) => {
        const innerCellRef = resolveExprToCellRef(innerExpr, refMap, col, calcsSheet)
        if (innerCellRef.isSimple) {
            const firstColLetter = colToLetter(FIRST_DATA_COL)
            return `PRODUCT(${innerCellRef.sheetPrefix}$${firstColLetter}$${innerCellRef.row}:${innerCellRef.sheetPrefix}${colLetter}$${innerCellRef.row})`
        }
        return null
    })

    // CUMPROD_Y and CUMSUM_Y → too complex for Excel formulas, will use static values
    // (These require year-boundary detection logic)

    // SHIFT(expr, n) → reference n columns to the left
    excelFormula = processNestedFunction(excelFormula, 'SHIFT', (innerExpr, fullMatch) => {
        // Parse SHIFT(expr, n) - the innerExpr includes ", n"
        const commaIdx = innerExpr.lastIndexOf(',')
        if (commaIdx === -1) return null
        const expr = innerExpr.substring(0, commaIdx).trim()
        const n = parseInt(innerExpr.substring(commaIdx + 1).trim()) || 1

        const shiftedCol = col - n
        if (shiftedCol < FIRST_DATA_COL) {
            return '0' // Before first period → 0
        }

        const shiftedColLetter = colToLetter(shiftedCol)
        const innerCellRef = resolveExprToCellRef(expr, refMap, shiftedCol, calcsSheet)
        if (innerCellRef.isSimple) {
            return `${innerCellRef.sheetPrefix}${shiftedColLetter}$${innerCellRef.row}`
        }
        // Complex expression with shift - substitute refs at shifted column
        return substituteRefsInExpr(expr, refMap, shiftedCol, calcsSheet)
    })

    // PREVSUM(expr) → SUM from first data column to PREVIOUS column (excludes current)
    // Excel: =SUM($D$row:prev_col$row) where prev_col = current - 1
    excelFormula = processNestedFunction(excelFormula, 'PREVSUM', (innerExpr) => {
        const prevCol = col - 1
        if (prevCol < FIRST_DATA_COL) {
            return '0' // No prior periods → 0
        }
        const innerCellRef = resolveExprToCellRef(innerExpr, refMap, col, calcsSheet)
        if (innerCellRef.isSimple) {
            const firstColLetter = colToLetter(FIRST_DATA_COL)
            const prevColLetter = colToLetter(prevCol)
            return `SUM(${innerCellRef.sheetPrefix}$${firstColLetter}$${innerCellRef.row}:${innerCellRef.sheetPrefix}${prevColLetter}$${innerCellRef.row})`
        }
        return null
    })

    // PREVVAL(expr) → reference 1 column to the left (same as SHIFT(expr, 1))
    // Excel: =prev_col$row
    excelFormula = processNestedFunction(excelFormula, 'PREVVAL', (innerExpr) => {
        const prevCol = col - 1
        if (prevCol < FIRST_DATA_COL) {
            return '0' // Before first period → 0
        }
        const prevColLetter = colToLetter(prevCol)
        const innerCellRef = resolveExprToCellRef(innerExpr, refMap, prevCol, calcsSheet)
        if (innerCellRef.isSimple) {
            return `${innerCellRef.sheetPrefix}${prevColLetter}$${innerCellRef.row}`
        }
        return substituteRefsInExpr(innerExpr, refMap, prevCol, calcsSheet)
    })

    // COUNT(expr) → COUNTIF running range <>0
    excelFormula = processNestedFunction(excelFormula, 'COUNT', (innerExpr) => {
        const innerCellRef = resolveExprToCellRef(innerExpr, refMap, col, calcsSheet)
        if (innerCellRef.isSimple) {
            const firstColLetter = colToLetter(FIRST_DATA_COL)
            return `COUNTIF(${innerCellRef.sheetPrefix}$${firstColLetter}$${innerCellRef.row}:${innerCellRef.sheetPrefix}${colLetter}$${innerCellRef.row},"<>0")`
        }
        return null
    })

    // --- 2. Replace simple references with Excel cell references ---
    excelFormula = substituteRefsInExpr(excelFormula, refMap, col, calcsSheet)

    // --- 3. Convert operators ---
    // ^ → power (Excel uses ^ natively, same as GlassBox)
    // MIN/MAX/ABS → Excel equivalents (same names)

    // --- 4. Convert comparison/logical operators ---
    // >, <, >=, <=, == → same in Excel
    // GlassBox uses JavaScript-style, Excel is similar

    // If conversion failed (null placeholders remain), return null to use static value
    if (excelFormula.includes('__NULL__')) {
        return { formula: null, helperRows }
    }

    return { formula: '=' + excelFormula, helperRows }
}

/**
 * Process a named function in the formula (CUMSUM, SHIFT, etc.)
 * Handles nested parentheses correctly.
 */
function processNestedFunction(formula, funcName, converter) {
    const regex = new RegExp(`${funcName}\\s*\\(`, 'gi')
    let result = formula
    let match

    // Process from right to left to handle replacements without offset issues
    const matches = []
    while ((match = regex.exec(result)) !== null) {
        matches.push({ index: match.index, matchLength: match[0].length })
    }

    // Process in reverse order
    for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]
        const openParenIdx = m.index + m.matchLength - 1
        const closeParenIdx = findMatchingParen(result, openParenIdx)
        if (closeParenIdx === -1) continue

        const innerExpr = result.substring(openParenIdx + 1, closeParenIdx)
        const fullMatch = result.substring(m.index, closeParenIdx + 1)

        const converted = converter(innerExpr, fullMatch)
        if (converted === null) {
            result = result.substring(0, m.index) + '__NULL__' + result.substring(closeParenIdx + 1)
        } else {
            result = result.substring(0, m.index) + converted + result.substring(closeParenIdx + 1)
        }
    }

    return result
}

/**
 * Find the matching closing parenthesis for an opening one
 */
function findMatchingParen(str, openIdx) {
    let depth = 1
    for (let i = openIdx + 1; i < str.length; i++) {
        if (str[i] === '(') depth++
        else if (str[i] === ')') {
            depth--
            if (depth === 0) return i
        }
    }
    return -1
}

/**
 * Try to resolve a simple expression to a single cell reference.
 * Returns { isSimple, sheet, row, sheetPrefix } for simple refs like "R81", "V1", "F2"
 * Returns { isSimple: false } for compound expressions.
 */
function resolveExprToCellRef(expr, refMap, col, calcsSheet) {
    const trimmed = expr.trim()

    // Check if it's a simple reference (single ref with no operators)
    const refEntry = refMap.get(trimmed)
    if (refEntry) {
        const sheetPrefix = refEntry.sheet === calcsSheet ? '' : `'${refEntry.sheet}'!`
        return { isSimple: true, sheet: refEntry.sheet, row: refEntry.row, sheetPrefix }
    }

    // Check for numeric literal
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return { isSimple: false }
    }

    return { isSimple: false }
}

/**
 * Substitute all GlassBox references in an expression with Excel cell references.
 * References are replaced longest-first to avoid partial matches.
 */
function substituteRefsInExpr(expr, refMap, col, calcsSheet) {
    const colLetter = colToLetter(col)

    // Sort refs by length (longest first) to prevent partial replacements
    const sortedRefs = [...refMap.entries()].sort((a, b) => b[0].length - a[0].length)

    let result = expr
    for (const [ref, { sheet, row }] of sortedRefs) {
        // Build regex for this ref
        const escaped = ref.replace(/\./g, '\\.')
        const regex = new RegExp(`\\b${escaped}\\b`, 'g')

        if (!regex.test(result)) continue
        regex.lastIndex = 0

        const sheetPrefix = sheet === calcsSheet ? '' : `'${sheet}'!`
        const cellRef = `${sheetPrefix}${colLetter}$${row}`
        result = result.replace(regex, cellRef)
    }

    return result
}

/**
 * Check if a formula can be converted to Excel or needs static values.
 * Returns true if the formula uses features we can convert.
 */
export function canConvertToExcel(formula) {
    if (!formula || formula.trim() === '0') return false

    // Can't convert CUMPROD_Y or CUMSUM_Y (year-boundary logic)
    if (/CUMPROD_Y\s*\(/i.test(formula)) return false
    if (/CUMSUM_Y\s*\(/i.test(formula)) return false

    // Reject descriptive text formulas (contain English words that aren't function names)
    // Valid tokens: refs (R4, M1.2, C1.10, F6, I2, T.MiY, V1, S1, L1.2), numbers,
    // operators (+,-,*,/,^,>,<,>=,<=,(,)), functions (CUMSUM, CUMPROD, SHIFT, PREVSUM, PREVVAL, MIN, MAX, ABS, COUNT)
    // If formula contains lowercase words (not part of refs), it's descriptive text
    const withoutFunctions = formula.replace(/\b(CUMSUM|CUMPROD|SHIFT|PREVSUM|PREVVAL|MIN|MAX|ABS|COUNT|SUMPRODUCT|SUM|IF)\b/gi, '')
    const withoutRefs = withoutFunctions.replace(/\b[RMVSCFITLG]\d+(?:\.\d+)*(?:\.(?:Start|End))?\b/g, '')
    const withoutTimeRefs = withoutRefs.replace(/\bT\.[A-Za-z]+\b/g, '')
    if (/[a-z]{3,}/i.test(withoutTimeRefs)) return false  // 3+ consecutive letters = likely English text

    // Can convert: simple refs, CUMSUM, CUMPROD, SHIFT, COUNT, MIN, MAX, ABS, arithmetic
    return true
}

/**
 * Determine which references a formula uses, categorized by sheet.
 * Useful for understanding cross-sheet dependencies.
 */
export function extractFormulaRefs(formula) {
    if (!formula) return []
    const refs = new Set()

    // R-refs
    const rPattern = /\bR(\d+)(?!\d)/g
    let match
    while ((match = rPattern.exec(formula)) !== null) refs.add(`R${match[1]}`)

    // M-refs
    const mPattern = /\bM(\d+)\.(\d+)/g
    while ((match = mPattern.exec(formula)) !== null) refs.add(`M${match[1]}.${match[2]}`)

    // V-refs
    const vPattern = /\bV(\d+)(?:\.(\d+))?/g
    while ((match = vPattern.exec(formula)) !== null) refs.add(match[0])

    // S-refs
    const sPattern = /\bS(\d+)(?:\.(\d+))?/g
    while ((match = sPattern.exec(formula)) !== null) refs.add(match[0])

    // C-refs
    const cPattern = /\bC(\d+)\.(\d+)/g
    while ((match = cPattern.exec(formula)) !== null) refs.add(match[0])

    // F-refs
    const fPattern = /\bF(\d+)(?:\.(Start|End))?/g
    while ((match = fPattern.exec(formula)) !== null) refs.add(match[0])

    // I-refs
    const iPattern = /\bI(\d+)(?!\d)/g
    while ((match = iPattern.exec(formula)) !== null) refs.add(`I${match[1]}`)

    // T-refs
    const tPattern = /\bT\.[A-Za-z]+/g
    while ((match = tPattern.exec(formula)) !== null) refs.add(match[0])

    // L-refs
    const lPattern = /\bL(\d+)\.(\d+)(?:\.(\d+))?/g
    while ((match = lPattern.exec(formula)) !== null) refs.add(match[0])

    return [...refs]
}
