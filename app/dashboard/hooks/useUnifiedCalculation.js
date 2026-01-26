'use client'

import { useMemo, useCallback, useRef } from 'react'
import { processArrayFunctions, evaluateSafeExpression } from '@/utils/formulaEvaluator'
import { calculateModuleOutputs, MODULE_TEMPLATES } from '@/utils/moduleTemplates'

// Module-level regex cache (shared across all hook instances)
const globalRegexCache = new Map()
const getRegexCached = (ref) => {
    if (!globalRegexCache.has(ref)) {
        globalRegexCache.set(ref, new RegExp(`\\b${ref.replace(/\./g, '\\.')}\\b`, 'g'))
    }
    return globalRegexCache.get(ref)
}

/**
 * Extract dependencies from a formula string
 * Returns array of R-refs and M-refs
 */
function extractDependencies(formula) {
    if (!formula) return []

    // Remove SHIFT(...) patterns - these are lagged dependencies (prior period)
    // and don't create true cycles in the dependency graph
    const formulaWithoutShift = formula.replace(/SHIFT\s*\([^)]+\)/gi, '')

    const deps = new Set()

    // Find R-refs (calculations): R60, R17, etc.
    const rPattern = /\bR(\d+)(?!\d)/g
    let match
    while ((match = rPattern.exec(formulaWithoutShift)) !== null) {
        deps.add(`R${match[1]}`)
    }

    // Find M-refs (module outputs): M1.3, M2.7, etc.
    // Convert M1.3 to M1 (we depend on the whole module)
    const mPattern = /\bM(\d+)\.(\d+)/g
    while ((match = mPattern.exec(formulaWithoutShift)) !== null) {
        deps.add(`M${match[1]}`)
    }

    return [...deps]
}

/**
 * Extract dependencies from module inputs
 * Modules reference calculations via their input values (e.g., "R17", "R70")
 */
function extractModuleDependencies(module, moduleIdx, allModulesCount) {
    const deps = new Set()
    const inputs = module.inputs || {}

    Object.values(inputs).forEach(value => {
        if (typeof value === 'string') {
            // Find R-refs
            const rPattern = /\bR(\d+)(?!\d)/g
            let match
            while ((match = rPattern.exec(value)) !== null) {
                deps.add(`R${match[1]}`)
            }

            // Find M-refs (other modules)
            const mPattern = /\bM(\d+)\.(\d+)/g
            while ((match = mPattern.exec(value)) !== null) {
                const depModuleNum = parseInt(match[1], 10)
                const depModuleIdx = depModuleNum - 1
                if (depModuleIdx !== moduleIdx && depModuleIdx >= 0 && depModuleIdx < allModulesCount) {
                    deps.add(`M${depModuleNum}`)
                }
            }
        }
    })

    return [...deps]
}

/**
 * Build unified dependency graph of calculations AND modules
 */
function buildUnifiedGraph(calculations, modules) {
    const graph = new Map() // nodeId -> { type, deps: Set, item, index? }
    const allCalcIds = new Set()

    // Add all calculations as nodes
    if (calculations) {
        calculations.forEach(calc => {
            const nodeId = `R${calc.id}`
            allCalcIds.add(calc.id)
            const deps = extractDependencies(calc.formula)
            graph.set(nodeId, { type: 'calc', deps: new Set(deps), item: calc })
        })
    }

    // Add all modules as nodes (M1, M2, etc.)
    if (modules) {
        modules.forEach((mod, idx) => {
            const nodeId = `M${idx + 1}`
            const deps = extractModuleDependencies(mod, idx, modules.length)
            graph.set(nodeId, { type: 'module', deps: new Set(deps), item: mod, index: idx })
        })
    }

    // Filter out dependencies that don't exist in the graph
    // (e.g., references to deleted calculations)
    graph.forEach(node => {
        const validDeps = new Set()
        node.deps.forEach(dep => {
            if (graph.has(dep)) {
                validDeps.add(dep)
            }
        })
        node.deps = validDeps
    })

    return graph
}

/**
 * Topological sort of unified graph using Kahn's algorithm
 * Returns array of nodeIds in dependency order
 */
function topologicalSort(graph) {
    const sorted = []
    const inDegree = new Map()
    const dependentsOf = new Map() // reverse adjacency list

    // Initialize
    graph.forEach((_, nodeId) => {
        inDegree.set(nodeId, 0)
        dependentsOf.set(nodeId, new Set())
    })

    // Build in-degree and reverse adjacency
    graph.forEach((node, nodeId) => {
        node.deps.forEach(dep => {
            if (graph.has(dep)) {
                inDegree.set(nodeId, inDegree.get(nodeId) + 1)
                dependentsOf.get(dep).add(nodeId)
            }
        })
    })

    // Start with nodes that have no dependencies
    const queue = []
    graph.forEach((_, nodeId) => {
        if (inDegree.get(nodeId) === 0) {
            queue.push(nodeId)
        }
    })

    // Process queue
    while (queue.length > 0) {
        const nodeId = queue.shift()
        sorted.push(nodeId)

        dependentsOf.get(nodeId).forEach(dependent => {
            const newDegree = inDegree.get(dependent) - 1
            inDegree.set(dependent, newDegree)
            if (newDegree === 0) {
                queue.push(dependent)
            }
        })
    }

    // Check for cycles
    if (sorted.length !== graph.size) {
        // Find nodes in cycle
        const inCycle = []
        graph.forEach((_, nodeId) => {
            if (!sorted.includes(nodeId)) {
                inCycle.push(nodeId)
            }
        })
        console.warn(`[UnifiedCalc] Circular dependency detected: ${inCycle.join(', ')}`)

        // Add cyclic nodes at the end (they'll get zero values)
        inCycle.forEach(nodeId => sorted.push(nodeId))
    }

    return sorted
}

/**
 * Evaluate a single calculation formula
 */
function evaluateSingleCalc(formula, context, timeline) {
    if (!formula || !formula.trim()) {
        return { values: new Array(timeline.periods).fill(0), error: null }
    }

    try {
        const resultArray = new Array(timeline.periods).fill(0)

        // Check for unresolved references before evaluation
        const formulaWithoutShift = formula.replace(/SHIFT\s*\([^)]+\)/gi, '')
        const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*|T\.[A-Za-z]+)\b/g
        const refsInFormula = [...new Set([...formulaWithoutShift.matchAll(refPattern)].map(m => m[1]))]
        const missingRefs = refsInFormula.filter(ref => !context[ref])

        if (missingRefs.length > 0) {
            return {
                values: new Array(timeline.periods).fill(0),
                error: `Unknown reference(s): ${missingRefs.join(', ')}`
            }
        }

        const { processedFormula, arrayFnResults } = processArrayFunctions(formula, context, timeline)

        // Sort refs by length (longer first to avoid partial replacements)
        const sortedRefs = refsInFormula.sort((a, b) => b.length - a.length)
        const refArrays = sortedRefs.map(ref => ({ arr: context[ref], regex: getRegexCached(ref) }))
        const arrayFnEntries = Object.entries(arrayFnResults)

        for (let i = 0; i < timeline.periods; i++) {
            let expr = processedFormula

            for (const { arr, regex } of refArrays) {
                const value = arr?.[i] ?? 0
                regex.lastIndex = 0
                expr = expr.replace(regex, value.toString())
            }

            for (const [placeholder, arr] of arrayFnEntries) {
                expr = expr.replace(placeholder, arr[i].toString())
            }

            resultArray[i] = evaluateSafeExpression(expr)
        }

        return { values: resultArray, error: null }
    } catch (e) {
        return { values: new Array(timeline.periods).fill(0), error: e.message }
    }
}

/**
 * Unified Calculation Hook
 * Replaces the 3-pass architecture with a single topologically-sorted evaluation
 *
 * Key insight: Instead of "all calcs -> all modules -> re-eval calcs",
 * we treat everything as one dependency graph and evaluate in topological order:
 *   R1, R2, ..., R13 (no module deps)
 *   M1 (Debt) - its deps are ready
 *   M2 (D&A) - its deps are ready
 *   R14 = M2.3 - M2 now exists!
 *   R16 = M1.3 - M1 now exists!
 *   R17 = R15 - R16 - R14 - correct EBT!
 *   M5 (Tax) - R17 is correct now
 *   R18 = -M5.7 - Tax is correct!
 */
export function useUnifiedCalculation({
    calculations,
    modules,
    referenceMap,
    timeline
}) {
    // Store committed results for preview function
    const committedResultsRef = useRef({ calculations: {}, modules: {} })

    // Single unified calculation pass - runs on every dependency change (fast enough now ~5ms)
    const { calculationResults, moduleOutputs, calculationErrors } = useMemo(() => {
        const calcResults = {}
        const modOutputs = {}
        const errors = {}

        const startTime = performance.now()

        // Build unified dependency graph
        const graph = buildUnifiedGraph(calculations, modules)

        if (graph.size === 0) {
            return { calculationResults: calcResults, moduleOutputs: modOutputs, calculationErrors: errors }
        }

        // Topological sort
        const sortedNodes = topologicalSort(graph)

        // Build context with referenceMap as base
        const context = { ...referenceMap, timeline }

        // Track evaluation stats
        let calcCount = 0
        let moduleCount = 0

        // Evaluate in topological order
        for (const nodeId of sortedNodes) {
            const node = graph.get(nodeId)
            if (!node) continue

            if (node.type === 'calc') {
                // Evaluate calculation
                const { values, error } = evaluateSingleCalc(node.item.formula, context, timeline)
                calcResults[nodeId] = values
                context[nodeId] = values // Add to context for downstream nodes
                if (error) errors[nodeId] = error
                calcCount++
            } else if (node.type === 'module') {
                // Evaluate module
                const mod = node.item
                const templateKey = mod.templateId
                const template = MODULE_TEMPLATES[templateKey]

                if (!template) continue

                // Skip disabled modules (return zeros for all outputs)
                // Also skip iterative modules that haven't been solved yet
                const isDisabled = mod.enabled === false
                const isIterative = templateKey === 'iterative_debt_sizing'
                if (isDisabled || (isIterative && !mod.solvedAt)) {
                    template.outputs.forEach((output, outputIdx) => {
                        const ref = `M${node.index + 1}.${outputIdx + 1}`
                        modOutputs[ref] = new Array(timeline.periods).fill(0)
                        context[ref] = modOutputs[ref]
                    })
                    continue
                }

                const moduleInstance = {
                    moduleType: templateKey,
                    inputs: mod.inputs || {}
                }

                const calculatedOutputs = calculateModuleOutputs(
                    moduleInstance,
                    timeline.periods,
                    context
                )

                // Add each output to context and results
                template.outputs.forEach((output, outputIdx) => {
                    const ref = `M${node.index + 1}.${outputIdx + 1}`
                    const outputValues = calculatedOutputs[output.key] || new Array(timeline.periods).fill(0)
                    modOutputs[ref] = outputValues
                    context[ref] = outputValues // Add to context for downstream nodes
                })
                moduleCount++
            }
        }

        // Store committed results for preview
        committedResultsRef.current = { calculations: calcResults, modules: modOutputs }

        const elapsed = performance.now() - startTime
        console.log(`[UnifiedCalc] Evaluated ${calcCount} calculations and ${moduleCount} modules in ${elapsed.toFixed(0)}ms (single pass)`)

        return { calculationResults: calcResults, moduleOutputs: modOutputs, calculationErrors: errors }
    }, [calculations, modules, referenceMap, timeline])

    // Get flow/stock type for each calculation from stored type (default: flow)
    const calculationTypes = useMemo(() => {
        const types = {}
        if (!calculations || calculations.length === 0) return types

        calculations.forEach((calc) => {
            const rRef = `R${calc.id}`
            types[rRef] = calc.type || 'flow'
        })

        return types
    }, [calculations])

    // Evaluate a formula with current context (for general use)
    const evaluateFormula = useCallback((formula, calcResults = {}) => {
        const context = { ...referenceMap, ...moduleOutputs, ...calcResults }
        return evaluateSingleCalc(formula, context, timeline)
    }, [referenceMap, moduleOutputs, timeline])

    // Preview function for live formula editing
    // Uses LIVE referenceMap + COMMITTED calculation and module results
    // This allows instant formula preview without triggering full model recalc
    const previewFormula = useCallback((formula) => {
        if (!formula || !formula.trim()) {
            return { values: new Array(timeline.periods).fill(0), error: null }
        }

        // Combine live references with committed results
        const context = {
            ...referenceMap,
            ...committedResultsRef.current.modules,
            ...committedResultsRef.current.calculations
        }

        return evaluateSingleCalc(formula, context, timeline)
    }, [referenceMap, timeline])

    return {
        calculationResults,
        moduleOutputs,
        calculationErrors,
        calculationTypes,
        evaluateFormula,
        previewFormula
    }
}
