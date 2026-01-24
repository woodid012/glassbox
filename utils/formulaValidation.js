/**
 * Formula Validation Utility
 *
 * Provides comprehensive validation checks for calculation formulas:
 * - Unknown references
 * - Circular dependencies
 * - Syntax errors
 * - Hardcoded constants (should use constant refs)
 * - Division by zero risks
 * - Empty formulas
 * - Unused calculations
 * - Invalid array function usage
 */

// Severity levels for validation issues
export const SEVERITY = {
    ERROR: 'error',      // Prevents calculation from running correctly
    WARNING: 'warning',  // May cause issues or indicates poor practice
    INFO: 'info'         // Suggestions for improvement
}

// Issue categories
export const CATEGORY = {
    REFERENCE: 'reference',
    SYNTAX: 'syntax',
    DEPENDENCY: 'dependency',
    BEST_PRACTICE: 'best-practice',
    RUNTIME: 'runtime'
}

/**
 * Validate all calculations and return a list of issues
 * @param {Array} calculations - Array of calculation objects
 * @param {Object} referenceMap - Map of all valid references (V1, S1, C1, etc.)
 * @param {Object} moduleOutputs - Map of module output references (M1.1, etc.)
 * @returns {Array} Array of validation issues
 */
export function validateAllCalculations(calculations, referenceMap = {}, moduleOutputs = {}) {
    const issues = []

    if (!calculations || calculations.length === 0) {
        return issues
    }

    // Build lookup maps
    const calcById = new Map()
    const allIds = new Set()
    calculations.forEach(calc => {
        calcById.set(calc.id, calc)
        allIds.add(calc.id)
    })

    // All valid references including R-refs
    const allRefs = { ...referenceMap, ...moduleOutputs }
    calculations.forEach(calc => {
        allRefs[`R${calc.id}`] = true
    })

    // Run all validation checks
    calculations.forEach(calc => {
        const calcRef = `R${calc.id}`

        // Check for empty formula
        const emptyIssue = checkEmptyFormula(calc)
        if (emptyIssue) issues.push({ ...emptyIssue, calcRef, calcName: calc.name })

        // Check for unknown references
        const unknownRefs = checkUnknownReferences(calc.formula, allRefs)
        unknownRefs.forEach(issue => issues.push({ ...issue, calcRef, calcName: calc.name }))

        // Check for syntax errors
        const syntaxIssues = checkSyntaxErrors(calc.formula)
        syntaxIssues.forEach(issue => issues.push({ ...issue, calcRef, calcName: calc.name }))

        // Check for hardcoded constants
        const hardcodedIssues = checkHardcodedConstants(calc.formula)
        hardcodedIssues.forEach(issue => issues.push({ ...issue, calcRef, calcName: calc.name }))

        // Check for division by zero risks
        const divisionIssues = checkDivisionByZero(calc.formula)
        divisionIssues.forEach(issue => issues.push({ ...issue, calcRef, calcName: calc.name }))

        // Check for invalid array function usage
        const arrayFnIssues = checkArrayFunctions(calc.formula)
        arrayFnIssues.forEach(issue => issues.push({ ...issue, calcRef, calcName: calc.name }))
    })

    // Check for circular dependencies (affects multiple calculations)
    const circularIssues = checkCircularDependencies(calculations, allIds)
    issues.push(...circularIssues)

    // Check for unused calculations
    const unusedIssues = checkUnusedCalculations(calculations)
    issues.push(...unusedIssues)

    // Check for self-references (without SHIFT)
    calculations.forEach(calc => {
        const selfRefIssues = checkSelfReference(calc)
        selfRefIssues.forEach(issue => issues.push({ ...issue, calcRef: `R${calc.id}`, calcName: calc.name }))
    })

    return issues
}

/**
 * Check if formula is empty
 */
function checkEmptyFormula(calc) {
    if (!calc.formula || !calc.formula.trim()) {
        return {
            severity: SEVERITY.WARNING,
            category: CATEGORY.SYNTAX,
            message: 'Formula is empty',
            details: 'This calculation has no formula defined. It will always return 0.'
        }
    }
    return null
}

/**
 * Check for unknown references in a formula
 */
function checkUnknownReferences(formula, allRefs) {
    const issues = []
    if (!formula) return issues

    // Match patterns like V1, V1.1, S1, C1, T1, F1, I1, L1, L1.1, L1.1.1, R1, M1, M1.1, T.DiM, etc.
    const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*|T\.[A-Za-z]+)\b/g
    const refsInFormula = [...formula.matchAll(refPattern)].map(m => m[1])
    const uniqueRefs = [...new Set(refsInFormula)]

    uniqueRefs.forEach(ref => {
        if (!allRefs[ref]) {
            issues.push({
                severity: SEVERITY.ERROR,
                category: CATEGORY.REFERENCE,
                message: `Unknown reference: ${ref}`,
                details: `The reference "${ref}" does not exist. Check for typos or create the missing input/calculation.`
            })
        }
    })

    return issues
}

/**
 * Check for syntax errors in formula
 */
function checkSyntaxErrors(formula) {
    const issues = []
    if (!formula) return issues

    // Check for unbalanced parentheses
    let parenCount = 0
    for (const char of formula) {
        if (char === '(') parenCount++
        if (char === ')') parenCount--
        if (parenCount < 0) {
            issues.push({
                severity: SEVERITY.ERROR,
                category: CATEGORY.SYNTAX,
                message: 'Unbalanced parentheses',
                details: 'Found closing parenthesis without matching opening parenthesis.'
            })
            break
        }
    }
    if (parenCount > 0) {
        issues.push({
            severity: SEVERITY.ERROR,
            category: CATEGORY.SYNTAX,
            message: 'Unbalanced parentheses',
            details: `Missing ${parenCount} closing parenthesis(es).`
        })
    }

    // Check for consecutive operators
    if (/[+\-*/]{2,}/.test(formula.replace(/\s/g, ''))) {
        // Exclude cases like "+-" which could be valid (e.g., 5 + -3)
        const cleanFormula = formula.replace(/\s/g, '')
        if (/[+\-*/][*/]/.test(cleanFormula) || /[*/][+\-*/]/.test(cleanFormula)) {
            issues.push({
                severity: SEVERITY.ERROR,
                category: CATEGORY.SYNTAX,
                message: 'Consecutive operators',
                details: 'Found multiple operators in a row (e.g., "++", "*/"). Check formula syntax.'
            })
        }
    }

    // Check for trailing/leading operators
    const trimmed = formula.trim()
    if (/^[*/]/.test(trimmed)) {
        issues.push({
            severity: SEVERITY.ERROR,
            category: CATEGORY.SYNTAX,
            message: 'Formula starts with operator',
            details: 'Formula cannot start with * or /.'
        })
    }
    if (/[+\-*/]$/.test(trimmed)) {
        issues.push({
            severity: SEVERITY.ERROR,
            category: CATEGORY.SYNTAX,
            message: 'Formula ends with operator',
            details: 'Formula cannot end with an operator.'
        })
    }

    // Check for empty parentheses
    if (/\(\s*\)/.test(formula)) {
        issues.push({
            severity: SEVERITY.ERROR,
            category: CATEGORY.SYNTAX,
            message: 'Empty parentheses',
            details: 'Found empty parentheses "()" in formula.'
        })
    }

    return issues
}

/**
 * Check for hardcoded numeric constants (should use constant references)
 */
function checkHardcodedConstants(formula) {
    const issues = []
    if (!formula) return issues

    // Remove SHIFT offsets to avoid false positives (e.g., SHIFT(R1, 2))
    let cleanFormula = formula
        .replace(/SHIFT\s*\([^,]+,\s*\d+\s*\)/gi, 'SHIFT_PLACEHOLDER')
        .replace(/CUMSUM_Y|CUMPROD_Y|CUMSUM|CUMPROD/gi, 'ARRAY_FN')

    // Find all power expressions (e.g., 10^6) - these are single unit conversions, not two constants
    const powerExpressions = new Set()
    const powerPattern = /(\d+)\s*\^\s*(\d+)/g
    let powerMatch
    while ((powerMatch = powerPattern.exec(cleanFormula)) !== null) {
        powerExpressions.add(powerMatch.index) // index of base number
        powerExpressions.add(powerMatch.index + powerMatch[0].indexOf('^') + 1) // approximate index of exponent
    }

    // Find standalone numbers that look like "magic numbers"
    // Exclude: 0, 1, 100 (common divisors), numbers after decimal points
    const numberPattern = /(?<![.\d])(\d+\.?\d*)(?![.\d])/g
    const matches = [...cleanFormula.matchAll(numberPattern)]

    const suspiciousNumbers = []
    matches.forEach(match => {
        const num = parseFloat(match[1])
        // Skip common acceptable values
        if (num === 0 || num === 1 || num === 100 || num === 2) return
        // Skip if it looks like part of a reference (e.g., R12, V1.1)
        const startIndex = match.index
        if (startIndex > 0 && /[RVSCTIFLM]/.test(cleanFormula[startIndex - 1])) return
        // Skip if part of a power expression (e.g., 10^6 is a single constant)
        if (isPartOfPowerExpr(cleanFormula, startIndex)) return

        suspiciousNumbers.push(num)
    })

    if (suspiciousNumbers.length > 0) {
        const uniqueNums = [...new Set(suspiciousNumbers)]
        issues.push({
            severity: SEVERITY.INFO,
            category: CATEGORY.BEST_PRACTICE,
            message: `Hardcoded constant(s): ${uniqueNums.slice(0, 3).join(', ')}${uniqueNums.length > 3 ? '...' : ''}`,
            details: 'Consider using constant references (C1.x) instead of hardcoded numbers for better auditability.'
        })
    }

    return issues
}

/**
 * Check if a number at given index is part of a power expression (e.g., 10^6)
 */
function isPartOfPowerExpr(formula, index) {
    // Check if this number is followed by ^ (it's the base)
    const afterNum = formula.slice(index).match(/^\d+\.?\d*\s*\^/)
    if (afterNum) return true

    // Check if this number is preceded by ^ (it's the exponent)
    const beforeNum = formula.slice(0, index)
    if (/\^\s*$/.test(beforeNum)) return true

    return false
}

/**
 * Check for potential division by zero
 */
function checkDivisionByZero(formula) {
    const issues = []
    if (!formula) return issues

    // Check for division by literal zero
    if (/\/\s*0(?![.\d])/.test(formula)) {
        issues.push({
            severity: SEVERITY.ERROR,
            category: CATEGORY.RUNTIME,
            message: 'Division by zero',
            details: 'Formula divides by literal zero, which will cause an error.'
        })
    }

    // Check for division by a reference that might be zero (warning only)
    const divisionPattern = /\/\s*([RVSCM]\d+(?:\.\d+)*)/g
    const divisions = [...formula.matchAll(divisionPattern)]

    if (divisions.length > 0) {
        const divisors = [...new Set(divisions.map(m => m[1]))]
        issues.push({
            severity: SEVERITY.INFO,
            category: CATEGORY.RUNTIME,
            message: `Division by reference(s): ${divisors.join(', ')}`,
            details: 'Ensure these values are never zero, or use MAX(ref, small_value) to prevent division by zero.'
        })
    }

    return issues
}

/**
 * Check for invalid array function usage
 */
function checkArrayFunctions(formula) {
    const issues = []
    if (!formula) return issues

    // Check for nested array functions
    const arrayFns = ['CUMSUM', 'CUMSUM_Y', 'CUMPROD', 'CUMPROD_Y', 'SHIFT']

    arrayFns.forEach(fn => {
        const pattern = new RegExp(`${fn}\\s*\\([^)]*(?:CUMSUM|CUMPROD|SHIFT)[^)]*\\)`, 'i')
        if (pattern.test(formula)) {
            issues.push({
                severity: SEVERITY.WARNING,
                category: CATEGORY.SYNTAX,
                message: `Nested array function in ${fn}`,
                details: 'Nested array functions may not work as expected. Consider breaking into separate calculations.'
            })
        }
    })

    // Check for SHIFT with invalid offset
    const shiftPattern = /SHIFT\s*\(\s*[^,]+\s*,\s*(-?\d+)\s*\)/gi
    const shifts = [...formula.matchAll(shiftPattern)]
    shifts.forEach(match => {
        const offset = parseInt(match[1])
        if (offset === 0) {
            issues.push({
                severity: SEVERITY.WARNING,
                category: CATEGORY.BEST_PRACTICE,
                message: 'SHIFT with offset 0',
                details: 'SHIFT(x, 0) has no effect. Remove the SHIFT or use a non-zero offset.'
            })
        }
        if (offset < 0) {
            issues.push({
                severity: SEVERITY.WARNING,
                category: CATEGORY.BEST_PRACTICE,
                message: 'SHIFT with negative offset',
                details: 'Negative SHIFT offsets look into the future, which may cause unexpected results.'
            })
        }
    })

    return issues
}

/**
 * Check for circular dependencies
 */
function checkCircularDependencies(calculations, allIds) {
    const issues = []

    const getDependencies = (formula) => {
        if (!formula) return []
        // Remove SHIFT patterns - these are lagged dependencies
        const formulaWithoutShift = formula.replace(/SHIFT\s*\([^)]+\)/gi, '')
        const deps = []
        const regex = /R(\d+)(?![0-9])/g
        let match
        while ((match = regex.exec(formulaWithoutShift)) !== null) {
            const refId = parseInt(match[1])
            if (allIds.has(refId)) {
                deps.push(refId)
            }
        }
        return [...new Set(deps)]
    }

    // Build dependency graph
    const dependencies = {}
    const calcById = new Map()
    calculations.forEach(calc => {
        calcById.set(calc.id, calc)
        dependencies[calc.id] = getDependencies(calc.formula)
    })

    // Topological sort to detect cycles
    const inDegree = {}
    const adjList = {}
    for (const id of allIds) {
        inDegree[id] = 0
        adjList[id] = []
    }

    for (const id of allIds) {
        for (const dep of dependencies[id]) {
            if (adjList[dep]) {
                adjList[dep].push(id)
                inDegree[id]++
            }
        }
    }

    const queue = []
    for (const id of allIds) {
        if (inDegree[id] === 0) {
            queue.push(id)
        }
    }

    const evalOrder = []
    while (queue.length > 0) {
        const id = queue.shift()
        evalOrder.push(id)
        for (const neighbor of adjList[id]) {
            inDegree[neighbor]--
            if (inDegree[neighbor] === 0) {
                queue.push(neighbor)
            }
        }
    }

    // If not all calculations are in evalOrder, there's a cycle
    if (evalOrder.length !== calculations.length) {
        const inCycle = new Set(allIds)
        evalOrder.forEach(id => inCycle.delete(id))

        // Report each calculation in the cycle
        for (const id of inCycle) {
            const calc = calcById.get(id)
            const cycleDeps = dependencies[id].filter(depId => inCycle.has(depId))
            issues.push({
                severity: SEVERITY.ERROR,
                category: CATEGORY.DEPENDENCY,
                calcRef: `R${id}`,
                calcName: calc.name,
                message: 'Circular dependency',
                details: `This calculation is part of a circular dependency chain. Dependencies in cycle: ${cycleDeps.map(d => `R${d}`).join(', ')}`
            })
        }
    }

    return issues
}

/**
 * Check for unused calculations (not referenced by any other calculation)
 */
function checkUnusedCalculations(calculations) {
    const issues = []

    // Build set of all referenced calculation IDs
    const referencedIds = new Set()
    calculations.forEach(calc => {
        if (!calc.formula) return
        const regex = /R(\d+)(?![0-9])/g
        let match
        while ((match = regex.exec(calc.formula)) !== null) {
            referencedIds.add(parseInt(match[1]))
        }
    })

    // Find calculations that are never referenced
    calculations.forEach(calc => {
        if (!referencedIds.has(calc.id)) {
            issues.push({
                severity: SEVERITY.INFO,
                category: CATEGORY.BEST_PRACTICE,
                calcRef: `R${calc.id}`,
                calcName: calc.name,
                message: 'Unused calculation',
                details: 'This calculation is not referenced by any other calculation. It may be a final output or could be removed if not needed.'
            })
        }
    })

    return issues
}

/**
 * Check for self-references without SHIFT
 */
function checkSelfReference(calc) {
    const issues = []
    if (!calc.formula) return issues

    const calcRef = `R${calc.id}`

    // Remove SHIFT patterns first
    const formulaWithoutShift = calc.formula.replace(/SHIFT\s*\([^)]+\)/gi, '')

    // Check if the calculation references itself
    const selfRefPattern = new RegExp(`\\b${calcRef}\\b`)
    if (selfRefPattern.test(formulaWithoutShift)) {
        issues.push({
            severity: SEVERITY.ERROR,
            category: CATEGORY.DEPENDENCY,
            message: 'Self-reference without SHIFT',
            details: `Formula references itself (${calcRef}) without using SHIFT. Use SHIFT(${calcRef}, 1) for prior period values.`
        })
    }

    return issues
}

/**
 * Get summary statistics for validation issues
 */
export function getValidationSummary(issues) {
    const summary = {
        total: issues.length,
        byCategory: {},
        bySeverity: {
            [SEVERITY.ERROR]: 0,
            [SEVERITY.WARNING]: 0,
            [SEVERITY.INFO]: 0
        }
    }

    issues.forEach(issue => {
        summary.bySeverity[issue.severity]++
        if (!summary.byCategory[issue.category]) {
            summary.byCategory[issue.category] = 0
        }
        summary.byCategory[issue.category]++
    })

    return summary
}

/**
 * Group issues by calculation
 */
export function groupIssuesByCalculation(issues) {
    const grouped = {}

    issues.forEach(issue => {
        const key = issue.calcRef || 'general'
        if (!grouped[key]) {
            grouped[key] = {
                calcRef: issue.calcRef,
                calcName: issue.calcName,
                issues: []
            }
        }
        grouped[key].issues.push(issue)
    })

    return grouped
}
