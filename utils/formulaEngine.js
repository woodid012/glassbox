// Formula Engine for Model Builder
// Handles parsing, dependency tracking, and evaluation of time series formulas

/**
 * Variable naming convention:
 * - V{n}: Value group sum (e.g., V1 = sum of all items in group 1)
 * - V{n}.{m}: Value sub-item (e.g., V1.1, V1.2 = individual items in group 1)
 * - C{n}: Constant group sum (e.g., C1)
 * - C{n}.{m}: Constant sub-item (e.g., C1.1, C1.2)
 * - S{n}: Series group sum (e.g., S1)
 * - S{n}.{m}: Series sub-item (e.g., S1.1, S1.2)
 * - F{n}: Flag inputs (e.g., F1, F2)
 * - I{n}: Indexation inputs (e.g., I1, I2)
 * - R{n}: Results/Calculations (e.g., R1, R2)
 * - M{n}.{m}: Module outputs by index (e.g., M1.1 = first output, M1.2 = second output)
 */

// Extract all variable references from a formula string
export function extractReferences(formula) {
    if (!formula || typeof formula !== 'string') return []

    const refs = new Set()

    // Match V1.1, C1.2, S1.3, M1.1 etc. (sub-item references with dot notation)
    const subItemRefs = formula.match(/[VCSM]\d+\.\d+/gi) || []
    subItemRefs.forEach(ref => refs.add(ref.toUpperCase()))

    // Match V1, C1, S1, F1, I1, R1 (group sums and simple refs) - but not if followed by a dot
    const simpleRefs = formula.match(/[VCSFIR]\d+(?!\.\d)/gi) || []
    simpleRefs.forEach(ref => refs.add(ref.toUpperCase()))

    return Array.from(refs)
}

// Parse reference to get type and id
export function parseReference(ref) {
    const upper = ref.toUpperCase()

    // Module output: M1.1 (numeric output index)
    const moduleMatch = upper.match(/^M(\d+)\.(\d+)$/)
    if (moduleMatch) {
        return {
            type: 'module',
            id: parseInt(moduleMatch[1]),
            outputIndex: parseInt(moduleMatch[2])
        }
    }

    // Sub-item refs: V1.1, C1.2, S1.3 (number after dot)
    const subItemMatch = upper.match(/^([VCS])(\d+)\.(\d+)$/)
    if (subItemMatch) {
        const typeMap = {
            'V': 'value',
            'C': 'constant',
            'S': 'series'
        }
        return {
            type: typeMap[subItemMatch[1]],
            groupId: parseInt(subItemMatch[2]),
            subId: parseInt(subItemMatch[3]),
            isSubItem: true
        }
    }

    // Simple refs: V1, C1, S1, F1, I1, R1
    const simpleMatch = upper.match(/^([VCSFIR])(\d+)$/)
    if (simpleMatch) {
        const typeMap = {
            'V': 'value',
            'C': 'constant',
            'S': 'series',
            'F': 'flag',
            'I': 'indexation',
            'R': 'calculation'
        }
        return {
            type: typeMap[simpleMatch[1]],
            id: parseInt(simpleMatch[2])
        }
    }

    return null
}

// Build dependency graph from calculations
export function buildDependencyGraph(calculations) {
    const graph = {}

    calculations.forEach(calc => {
        const refs = extractReferences(calc.formula)
        // Use calc.ref if available, otherwise build from id
        const key = calc.ref || `R${calc.id}`
        graph[key] = {
            id: calc.id,
            ref: key,
            name: calc.name,
            dependencies: refs,
            formula: calc.formula
        }
    })

    return graph
}

// Topological sort for evaluation order (handles circular dependency detection)
export function getEvaluationOrder(calculations) {
    const graph = buildDependencyGraph(calculations)
    const visited = new Set()
    const visiting = new Set()
    const order = []
    const errors = []

    function visit(nodeKey) {
        if (visited.has(nodeKey)) return true
        if (visiting.has(nodeKey)) {
            errors.push(`Circular dependency detected involving ${nodeKey}`)
            return false
        }

        const node = graph[nodeKey]
        if (!node) return true // External reference (V, C, S, F, I, M)

        visiting.add(nodeKey)

        for (const dep of node.dependencies) {
            // Check if dependency is another calculation (R prefix)
            if (dep.startsWith('R')) {
                if (!visit(dep)) return false
            }
        }

        visiting.delete(nodeKey)
        visited.add(nodeKey)
        order.push(nodeKey)
        return true
    }

    Object.keys(graph).forEach(nodeKey => {
        if (!visited.has(nodeKey)) {
            visit(nodeKey)
        }
    })

    return { order, errors }
}

// Get all ancestors (upstream dependencies) for a given calculation
export function getAncestors(calcId, calculations, inputArrays, moduleOutputs) {
    const ancestors = []
    const visited = new Set()

    function traverse(ref) {
        if (visited.has(ref)) return
        visited.add(ref)

        const parsed = parseReference(ref)
        if (!parsed) return

        if (parsed.type === 'calculation') {
            const calc = calculations.find(c => c.id === parsed.id || c.ref === ref)
            if (calc) {
                ancestors.push({
                    ref,
                    type: 'calculation',
                    name: calc.name,
                    formula: calc.formula
                })
                const deps = extractReferences(calc.formula)
                deps.forEach(traverse)
            }
        } else if (parsed.type === 'value' || parsed.type === 'constant' || parsed.type === 'series' || parsed.type === 'flag' || parsed.type === 'indexation') {
            const inputInfo = inputArrays[ref]
            if (inputInfo) {
                ancestors.push({
                    ref,
                    type: parsed.type,
                    name: inputInfo.name,
                    value: inputInfo.defaultValue
                })
            }
        } else if (parsed.type === 'module') {
            const moduleInfo = moduleOutputs[`M${parsed.id}`]
            if (moduleInfo) {
                // Get output label from outputs array using numeric index
                const outputLabel = moduleInfo.outputs?.[parsed.outputIndex - 1]?.label || `Output ${parsed.outputIndex}`
                ancestors.push({
                    ref,
                    type: 'module',
                    name: `${moduleInfo.name}: ${outputLabel}`
                })
            }
        }
    }

    const calc = calculations.find(c => c.id === calcId)
    if (calc) {
        const deps = extractReferences(calc.formula)
        deps.forEach(traverse)
    }

    return ancestors
}

// Get all descendants (downstream dependents) for a given reference
export function getDescendants(ref, calculations) {
    const descendants = []
    const visited = new Set()

    function traverse(targetRef) {
        calculations.forEach(calc => {
            const calcRef = calc.ref || `R${calc.id}`
            if (visited.has(calcRef)) return

            const deps = extractReferences(calc.formula)
            if (deps.includes(targetRef.toUpperCase())) {
                visited.add(calcRef)
                descendants.push({
                    ref: calcRef,
                    type: 'calculation',
                    name: calc.name,
                    formula: calc.formula
                })
                traverse(calcRef)
            }
        })
    }

    traverse(ref)
    return descendants
}

// Supported functions in formulas
const FUNCTIONS = {
    // Time shift
    LAG: (arr, periods) => {
        const n = Math.round(periods)
        if (n <= 0) return arr
        const result = new Array(arr.length).fill(0)
        for (let i = n; i < arr.length; i++) {
            result[i] = arr[i - n]
        }
        return result
    },
    
    LEAD: (arr, periods) => {
        const n = Math.round(periods)
        if (n <= 0) return arr
        const result = new Array(arr.length).fill(0)
        for (let i = 0; i < arr.length - n; i++) {
            result[i] = arr[i + n]
        }
        return result
    },
    
    // Aggregations (element-wise for arrays, or scalar)
    MIN: (...args) => {
        if (args.length === 1 && Array.isArray(args[0])) {
            return Math.min(...args[0])
        }
        return Math.min(...args.map(a => Array.isArray(a) ? Math.min(...a) : a))
    },
    
    MAX: (...args) => {
        if (args.length === 1 && Array.isArray(args[0])) {
            return Math.max(...args[0])
        }
        return Math.max(...args.map(a => Array.isArray(a) ? Math.max(...a) : a))
    },
    
    SUM: (arr) => {
        if (!Array.isArray(arr)) return arr
        return arr.reduce((a, b) => a + b, 0)
    },
    
    AVG: (arr) => {
        if (!Array.isArray(arr)) return arr
        return arr.reduce((a, b) => a + b, 0) / arr.length
    },
    
    ABS: (val) => {
        if (Array.isArray(val)) return val.map(v => Math.abs(v))
        return Math.abs(val)
    },
    
    ROUND: (val, decimals = 0) => {
        const factor = Math.pow(10, decimals)
        if (Array.isArray(val)) return val.map(v => Math.round(v * factor) / factor)
        return Math.round(val * factor) / factor
    },
    
    // Cumulative sum
    CUMSUM: (arr) => {
        if (!Array.isArray(arr)) return arr
        let sum = 0
        return arr.map(v => {
            sum += v
            return sum
        })
    },

    // Cumulative product (handles scalars by expanding to array)
    // First arg is arrayLength (injected by evaluateFormula), second is the actual value
    CUMPROD: (len, arr) => {
        // If scalar, create cumulative powers: [s, s^2, s^3, ...]
        if (!Array.isArray(arr)) {
            if (len && typeof len === 'number') {
                const result = new Array(len)
                let product = 1
                for (let i = 0; i < len; i++) {
                    product *= arr
                    result[i] = product
                }
                return result
            }
            return arr
        }
        let product = 1
        return arr.map(v => {
            product *= v
            return product
        })
    },

    // Conditional (element-wise for arrays)
    IF: (condition, thenVal, elseVal) => {
        if (Array.isArray(condition)) {
            return condition.map((c, i) => {
                const t = Array.isArray(thenVal) ? thenVal[i] : thenVal
                const e = Array.isArray(elseVal) ? elseVal[i] : elseVal
                return c ? t : e
            })
        }
        return condition ? thenVal : elseVal
    },
    
    // Comparison operators (return 1/0 arrays)
    GT: (a, b) => elementWiseOp(a, b, (x, y) => x > y ? 1 : 0),
    GTE: (a, b) => elementWiseOp(a, b, (x, y) => x >= y ? 1 : 0),
    LT: (a, b) => elementWiseOp(a, b, (x, y) => x < y ? 1 : 0),
    LTE: (a, b) => elementWiseOp(a, b, (x, y) => x <= y ? 1 : 0),
    EQ: (a, b) => elementWiseOp(a, b, (x, y) => x === y ? 1 : 0),
    NEQ: (a, b) => elementWiseOp(a, b, (x, y) => x !== y ? 1 : 0),
    
    // Logical
    AND: (a, b) => elementWiseOp(a, b, (x, y) => (x && y) ? 1 : 0),
    OR: (a, b) => elementWiseOp(a, b, (x, y) => (x || y) ? 1 : 0),
    NOT: (a) => {
        if (Array.isArray(a)) return a.map(v => v ? 0 : 1)
        return a ? 0 : 1
    }
}

// Helper for element-wise operations
function elementWiseOp(a, b, op) {
    const aIsArray = Array.isArray(a)
    const bIsArray = Array.isArray(b)
    
    if (!aIsArray && !bIsArray) return op(a, b)
    
    const len = aIsArray ? a.length : b.length
    const result = new Array(len)
    
    for (let i = 0; i < len; i++) {
        const aVal = aIsArray ? a[i] : a
        const bVal = bIsArray ? b[i] : b
        result[i] = op(aVal, bVal)
    }
    
    return result
}

// Evaluate a formula string with given variable context
export function evaluateFormula(formula, context, arrayLength) {
    if (!formula || typeof formula !== 'string') {
        return new Array(arrayLength).fill(0)
    }
    
    try {
        // Normalize formula
        let expr = formula.trim().toUpperCase()
        
        // Replace variable references with context lookups
        const refs = extractReferences(formula)
        refs.forEach(ref => {
            const regex = new RegExp(ref, 'gi')
            expr = expr.replace(regex, `__ctx["${ref}"]`)
        })
        
        // Replace function names
        // For CUMPROD, inject arrayLength as second parameter
        Object.keys(FUNCTIONS).forEach(fn => {
            const regex = new RegExp(`\\b${fn}\\s*\\(`, 'gi')
            if (fn === 'CUMPROD') {
                // Add arrayLength as second arg: CUMPROD(x) -> __fn.CUMPROD(x, __len)
                expr = expr.replace(regex, `__fn.${fn}(__len, `)
            } else {
                expr = expr.replace(regex, `__fn.${fn}(`)
            }
        })

        // Replace ^ with ** for exponentiation (JS uses ** not ^)
        expr = expr.replace(/\^/g, '**')

        // Build evaluation function
        const evalFn = new Function('__ctx', '__fn', '__len', `return ${expr}`)
        const result = evalFn(context, FUNCTIONS, arrayLength)
        
        // Ensure result is an array of correct length
        if (Array.isArray(result)) {
            return result
        } else if (typeof result === 'number') {
            return new Array(arrayLength).fill(result)
        } else {
            return new Array(arrayLength).fill(0)
        }
    } catch (err) {
        console.error('Formula evaluation error:', formula, err)
        return new Array(arrayLength).fill(0)
    }
}

// Validate formula syntax and references
export function validateFormula(formula, availableRefs) {
    const errors = []
    
    if (!formula || typeof formula !== 'string') {
        errors.push('Formula is empty')
        return { valid: false, errors }
    }
    
    // Check for referenced variables
    const refs = extractReferences(formula)
    refs.forEach(ref => {
        if (!availableRefs.includes(ref.toUpperCase())) {
            errors.push(`Unknown reference: ${ref}`)
        }
    })
    
    // Check for basic syntax errors
    try {
        // Test parse (won't catch all issues but catches obvious ones)
        let testExpr = formula.toUpperCase()
        refs.forEach(ref => {
            testExpr = testExpr.replace(new RegExp(ref, 'gi'), '1')
        })
        Object.keys(FUNCTIONS).forEach(fn => {
            testExpr = testExpr.replace(new RegExp(`\\b${fn}\\s*\\(`, 'gi'), 'Math.max(')
        })
        new Function(`return ${testExpr}`)
    } catch (err) {
        errors.push(`Syntax error: ${err.message}`)
    }
    
    return { valid: errors.length === 0, errors }
}

// Format a number for display
export function formatNumber(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return '-'
    
    const absVal = Math.abs(val)
    if (absVal >= 1e9) {
        return (val / 1e9).toFixed(1) + 'B'
    } else if (absVal >= 1e6) {
        return (val / 1e6).toFixed(1) + 'M'
    } else if (absVal >= 1e3) {
        return (val / 1e3).toFixed(1) + 'k'
    } else {
        return val.toFixed(decimals)
    }
}
