// Formula Converter - Convert Glass Box formulas to Python and Excel syntax

/**
 * Convert a Glass Box formula to Python syntax
 * @param {string} formula - Original Glass Box formula
 * @param {Object} options - Conversion options
 * @returns {string} Python-compatible formula
 */
export function toPython(formula, options = {}) {
    if (!formula) return '0'

    let py = formula

    // Replace power operator
    py = py.replace(/\^/g, '**')

    // Convert array functions to Python function calls
    py = py.replace(/CUMSUM\s*\(/gi, 'cumsum(')
    py = py.replace(/CUMPROD\s*\(/gi, 'cumprod(')
    py = py.replace(/CUMSUM_Y\s*\(/gi, 'cumsum_y(')
    py = py.replace(/CUMPROD_Y\s*\(/gi, 'cumprod_y(')
    py = py.replace(/SHIFT\s*\(/gi, 'shift(')
    py = py.replace(/COUNT\s*\(/gi, 'count(')

    // Convert Excel-style functions to numpy/Python
    py = py.replace(/\bIF\s*\(/gi, 'np.where(')
    py = py.replace(/\bAND\s*\(/gi, 'np.logical_and(')
    py = py.replace(/\bOR\s*\(/gi, 'np.logical_or(')
    py = py.replace(/\bNOT\s*\(/gi, 'np.logical_not(')
    py = py.replace(/\bROUND\s*\(/gi, 'np.round(')
    py = py.replace(/\bMIN\s*\(/gi, 'np.minimum(')
    py = py.replace(/\bMAX\s*\(/gi, 'np.maximum(')
    py = py.replace(/\bABS\s*\(/gi, 'np.abs(')

    // Convert references to dictionary lookups
    // R{id} -> refs["R{id}"]
    py = py.replace(/\b(R\d+)\b/g, 'refs["$1"]')

    // V1.{id} or V1 -> refs["V1.{id}"] or refs["V1"]
    py = py.replace(/\b(V1(?:\.\d+)?)\b/g, 'refs["$1"]')

    // S1.{id} or S1 -> refs["S1.{id}"] or refs["S1"]
    py = py.replace(/\b(S1(?:\.\d+)?)\b/g, 'refs["$1"]')

    // C1.{idx} -> refs["C1.{idx}"]
    py = py.replace(/\b(C1\.\d+)\b/g, 'refs["$1"]')

    // L{group}.{id} -> refs["L{group}.{id}"]
    py = py.replace(/\b(L\d+\.\d+)\b/g, 'refs["$1"]')

    // F{id}, F{id}.Start, F{id}.End -> refs["F{id}"], refs["F{id}.Start"], refs["F{id}.End"]
    py = py.replace(/\b(F\d+(?:\.(?:Start|End))?)\b/g, 'refs["$1"]')

    // I{id} -> refs["I{id}"]
    py = py.replace(/\b(I\d+)\b/g, 'refs["$1"]')

    // M{idx}.{output} -> refs["M{idx}.{output}"]
    py = py.replace(/\b(M\d+\.\d+)\b/g, 'refs["$1"]')

    // T.{constant} -> refs["T.{constant}"]
    py = py.replace(/\b(T\.(?:MiY|DiY|DiM|QiY|HiD|HiY|MiQ|DiQ|QE|CYE|FYE))\b/g, 'refs["$1"]')

    return py
}

/**
 * Convert a Glass Box formula to Excel syntax
 * @param {string} formula - Original Glass Box formula
 * @param {Object} options - Conversion options (row, sheetMap, etc.)
 * @returns {string} Excel-compatible formula
 */
export function toExcel(formula, options = {}) {
    if (!formula) return '0'

    const {
        row = 2,                    // Current Excel row (1-indexed)
        periodsCol = 'C',           // Starting column for period data
        sheetMap = {},              // Map of ref prefixes to sheet names
        namedRanges = {}            // Map of references to named ranges
    } = options

    let xl = formula

    // Handle array functions first (before reference conversion)
    xl = convertExcelArrayFunctions(xl, row, periodsCol)

    // Convert MIN/MAX/ABS
    xl = xl.replace(/\bMIN\s*\(/gi, 'MIN(')
    xl = xl.replace(/\bMAX\s*\(/gi, 'MAX(')
    xl = xl.replace(/\bABS\s*\(/gi, 'ABS(')

    // Convert power operator
    xl = xl.replace(/\^/g, '^')

    // Convert references to Excel named ranges or cell references
    // R{id} -> Calc_R{id} (named range or sheet reference)
    xl = xl.replace(/\b(R\d+)\b/g, (match, ref) => {
        if (namedRanges[ref]) return namedRanges[ref]
        return `Calc_${ref}`
    })

    // V1.{id} -> Input_V1_{id}
    xl = xl.replace(/\bV1\.(\d+)/g, (match, id) => {
        const ref = `V1.${id}`
        if (namedRanges[ref]) return namedRanges[ref]
        return `Input_V1_${id}`
    })

    // V1 (total) -> Input_V1_Total
    xl = xl.replace(/\bV1\b(?![\._])/g, (match) => {
        if (namedRanges['V1']) return namedRanges['V1']
        return 'Input_V1_Total'
    })

    // S1.{id} -> Input_S1_{id}
    xl = xl.replace(/\bS1\.(\d+)/g, (match, id) => {
        const ref = `S1.${id}`
        if (namedRanges[ref]) return namedRanges[ref]
        return `Input_S1_${id}`
    })

    // S1 (total) -> Input_S1_Total
    xl = xl.replace(/\bS1\b(?![\._])/g, (match) => {
        if (namedRanges['S1']) return namedRanges['S1']
        return 'Input_S1_Total'
    })

    // C1.{idx} -> Const_C1_{idx}
    xl = xl.replace(/\bC1\.(\d+)/g, (match, idx) => {
        const ref = `C1.${idx}`
        if (namedRanges[ref]) return namedRanges[ref]
        return `Const_C1_${idx}`
    })

    // L{group}.{id} -> Lookup_L{group}_{id}
    xl = xl.replace(/\bL(\d+)\.(\d+)/g, (match, group, id) => {
        const ref = `L${group}.${id}`
        if (namedRanges[ref]) return namedRanges[ref]
        return `Lookup_L${group}_${id}`
    })

    // F{id}.Start -> Flag_F{id}_Start
    xl = xl.replace(/\bF(\d+)\.Start/g, (match, id) => {
        const ref = `F${id}.Start`
        if (namedRanges[ref]) return namedRanges[ref]
        return `Flag_F${id}_Start`
    })

    // F{id}.End -> Flag_F{id}_End
    xl = xl.replace(/\bF(\d+)\.End/g, (match, id) => {
        const ref = `F${id}.End`
        if (namedRanges[ref]) return namedRanges[ref]
        return `Flag_F${id}_End`
    })

    // F{id} -> Flag_F{id}
    xl = xl.replace(/\bF(\d+)\b(?![\._])/g, (match, id) => {
        const ref = `F${id}`
        if (namedRanges[ref]) return namedRanges[ref]
        return `Flag_F${id}`
    })

    // I{id} -> Index_I{id}
    xl = xl.replace(/\bI(\d+)\b/g, (match, id) => {
        const ref = `I${id}`
        if (namedRanges[ref]) return namedRanges[ref]
        return `Index_I${id}`
    })

    // M{idx}.{output} -> Module_M{idx}_{output}
    xl = xl.replace(/\bM(\d+)\.(\d+)/g, (match, idx, output) => {
        const ref = `M${idx}.${output}`
        if (namedRanges[ref]) return namedRanges[ref]
        return `Module_M${idx}_${output}`
    })

    // T.MiY etc -> Time constant values
    const timeConstants = {
        'T.MiY': '12',
        'T.DiY': '365',
        'T.DiM': '30',
        'T.QiY': '4',
        'T.HiD': '24',
        'T.HiY': '8760',
        'T.MiQ': '3',
        'T.DiQ': '91'
    }

    Object.entries(timeConstants).forEach(([ref, val]) => {
        xl = xl.replace(new RegExp(`\\b${ref.replace('.', '\\.')}\\b`, 'g'), val)
    })

    // T.QE, T.CYE, T.FYE -> Flag named ranges
    xl = xl.replace(/\bT\.QE\b/g, namedRanges['T.QE'] || 'Time_QE')
    xl = xl.replace(/\bT\.CYE\b/g, namedRanges['T.CYE'] || 'Time_CYE')
    xl = xl.replace(/\bT\.FYE\b/g, namedRanges['T.FYE'] || 'Time_FYE')

    return '=' + xl
}

/**
 * Convert Glass Box array functions to Excel equivalents
 */
function convertExcelArrayFunctions(formula, row, startCol) {
    let xl = formula

    // CUMSUM(X) -> SUM($startCol$1:startCol{row}*X) pattern
    // For named ranges, we need SUMPRODUCT with row indicator
    // Simplified: CUMSUM becomes a helper column reference
    xl = xl.replace(/CUMSUM\s*\(([^)]+)\)/gi, (match, inner) => {
        // In Excel, CUMSUM requires a helper pattern
        // We'll use: SUMPRODUCT((ROW($A$1:$A$n)<=ROW())*array)
        // But for named ranges, we reference a pre-calculated CUMSUM column
        return `CUMSUM_${sanitizeForExcel(inner)}`
    })

    // CUMPROD(X) -> Product cumulative pattern
    xl = xl.replace(/CUMPROD\s*\(([^)]+)\)/gi, (match, inner) => {
        return `CUMPROD_${sanitizeForExcel(inner)}`
    })

    // SHIFT(X, n) -> OFFSET or IF pattern
    xl = xl.replace(/SHIFT\s*\(\s*([^,]+)\s*,\s*(\d+)\s*\)/gi, (match, inner, n) => {
        // SHIFT by n periods = reference n rows back
        // In Excel: IF(ROW()>n, OFFSET(ref, -n, 0), 0)
        return `SHIFT_${sanitizeForExcel(inner)}_${n}`
    })

    // COUNT(X) -> running count of non-zero
    xl = xl.replace(/COUNT\s*\(([^)]+)\)/gi, (match, inner) => {
        return `COUNT_${sanitizeForExcel(inner)}`
    })

    return xl
}

/**
 * Sanitize string for Excel named range
 */
function sanitizeForExcel(str) {
    // Remove spaces, replace dots with underscores
    return str.replace(/\s+/g, '').replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '')
}

/**
 * Extract all references from a formula
 * @param {string} formula - Formula to analyze
 * @returns {Object} Object with arrays of different reference types
 */
export function extractReferences(formula) {
    if (!formula) return { calculations: [], inputs: [], flags: [], indices: [], modules: [], time: [] }

    return {
        calculations: [...new Set((formula.match(/\bR\d+/g) || []))],
        inputs: [
            ...new Set((formula.match(/\b[VCS]1(?:\.\d+)?/g) || [])),
            ...new Set((formula.match(/\bL\d+\.\d+/g) || []))
        ],
        flags: [...new Set((formula.match(/\bF\d+(?:\.(?:Start|End))?/g) || []))],
        indices: [...new Set((formula.match(/\bI\d+/g) || []))],
        modules: [...new Set((formula.match(/\bM\d+\.\d+/g) || []))],
        time: [...new Set((formula.match(/\bT\.(?:MiY|DiY|DiM|QiY|HiD|HiY|MiQ|DiQ|QE|CYE|FYE)/g) || []))]
    }
}

/**
 * Build dependency graph from calculations
 * @param {Object} calculations - Map of calculation refs to formulas
 * @returns {Object} Adjacency list of dependencies
 */
export function buildDependencyGraph(calculations) {
    const graph = {}

    Object.entries(calculations).forEach(([ref, calc]) => {
        const formula = calc.formula || calc
        const refs = extractReferences(formula)

        graph[ref] = {
            dependsOn: refs.calculations,
            formula: formula
        }
    })

    return graph
}

/**
 * Topological sort of calculations
 * @param {Object} graph - Dependency graph from buildDependencyGraph
 * @returns {string[]} Sorted array of calculation refs
 */
export function topologicalSort(graph) {
    const visited = new Set()
    const temp = new Set()
    const order = []
    const hasCycle = { value: false }

    function visit(node) {
        if (temp.has(node)) {
            hasCycle.value = true
            return
        }
        if (visited.has(node)) return

        temp.add(node)

        const deps = graph[node]?.dependsOn || []
        deps.forEach(dep => {
            if (graph[dep]) {
                visit(dep)
            }
        })

        temp.delete(node)
        visited.add(node)
        order.push(node)
    }

    Object.keys(graph).forEach(node => {
        if (!visited.has(node)) {
            visit(node)
        }
    })

    return order
}

/**
 * Generate a list of formulas with their Python equivalents
 * @param {Object} calculations - Map of ref -> {formula, name}
 * @returns {Array} Array of {ref, name, original, python}
 */
export function generatePythonFormulas(calculations) {
    return Object.entries(calculations).map(([ref, calc]) => ({
        ref,
        name: calc.name || ref,
        original: calc.formula || '0',
        python: toPython(calc.formula)
    }))
}

/**
 * Generate Excel formula list with worksheet organization
 * @param {Object} calculations - Map of ref -> {formula, name, groupId, tabId}
 * @param {Object} groups - Map of groupId -> {name, tabId}
 * @param {Object} tabs - Map of tabId -> {name}
 * @returns {Object} Organized by tab/group with Excel formulas
 */
export function generateExcelFormulas(calculations, groups, tabs, namedRanges = {}) {
    const organized = {}

    Object.entries(calculations).forEach(([ref, calc]) => {
        const group = groups[calc.groupId] || { name: 'Ungrouped', tabId: calc.tabId }
        const tab = tabs[group.tabId] || tabs[calc.tabId] || { name: 'Calculations' }

        const tabName = tab.name
        const groupName = group.name

        if (!organized[tabName]) {
            organized[tabName] = {}
        }
        if (!organized[tabName][groupName]) {
            organized[tabName][groupName] = []
        }

        organized[tabName][groupName].push({
            ref,
            name: calc.name || ref,
            original: calc.formula || '0',
            excel: toExcel(calc.formula, { namedRanges }),
            type: calc.type || 'flow'
        })
    })

    return organized
}
