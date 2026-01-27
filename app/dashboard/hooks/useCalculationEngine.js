'use client'

import { useMemo, useCallback, useRef } from 'react'
import { processArrayFunctions, evaluateSafeExpression } from '@/utils/formulaEvaluator'

// Module-level regex cache (shared across all hook instances)
const globalRegexCache = new Map()
const getRegexCached = (ref) => {
    if (!globalRegexCache.has(ref)) {
        globalRegexCache.set(ref, new RegExp(`\\b${ref.replace(/\./g, '\\.')}\\b`, 'g'))
    }
    return globalRegexCache.get(ref)
}

/**
 * Hook to evaluate calculation formulas
 * Extracts calculation engine logic from useDashboardState
 *
 * Handles:
 * - Formula evaluation with reference substitution
 * - Topological sorting for dependency order
 * - Circular dependency detection
 * - Array functions (CUMSUM, CUMPROD, etc.)
 * - On-demand calculation (calcVersion controls when full recalc happens)
 */
export function useCalculationEngine({
    calculations,
    referenceMap,
    moduleOutputs,
    timeline,
    calcVersion = 0,
    cachedResults = null
}) {
    // Store committed calculation results for preview function
    const committedResultsRef = useRef({})
    // Evaluate a formula string and return the result array (optimized)
    const evaluateFormula = useCallback((formula, calcResults = {}) => {
        if (!formula || !formula.trim()) {
            return { values: new Array(timeline.periods).fill(0), error: null }
        }

        try {
            const allRefs = { ...referenceMap, ...moduleOutputs, ...calcResults }
            const resultArray = new Array(timeline.periods).fill(0)

            // Check for unresolved references before evaluation
            const formulaWithoutShift = formula.replace(/SHIFT\s*\([^)]+\)/gi, '')
            const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*|T\.[A-Za-z]+)\b/g
            const refsInFormula = [...new Set([...formulaWithoutShift.matchAll(refPattern)].map(m => m[1]))]
            const missingRefs = refsInFormula.filter(ref => !allRefs[ref])

            if (missingRefs.length > 0) {
                return {
                    values: new Array(timeline.periods).fill(0),
                    error: `Unknown reference(s): ${missingRefs.join(', ')}`
                }
            }

            const { processedFormula, arrayFnResults } = processArrayFunctions(formula, allRefs, timeline)

            // OPTIMIZATION: Sort refs ONCE, not per period. Only include refs in this formula.
            const sortedRefs = refsInFormula.sort((a, b) => b.length - a.length)
            const refArrays = sortedRefs.map(ref => ({ arr: allRefs[ref], regex: getRegexCached(ref) }))
            const arrayFnEntries = Object.entries(arrayFnResults)

            for (let i = 0; i < timeline.periods; i++) {
                let expr = processedFormula

                for (const { arr, regex } of refArrays) {
                    const value = arr?.[i] ?? 0
                    regex.lastIndex = 0
                    expr = expr.replace(regex, value < 0 ? `(${value})` : value.toString())
                }

                for (const [placeholder, arr] of arrayFnEntries) {
                    expr = expr.replace(placeholder, arr[i] < 0 ? `(${arr[i]})` : arr[i].toString())
                }

                resultArray[i] = evaluateSafeExpression(expr)
            }

            return { values: resultArray, error: null }
        } catch (e) {
            return { values: new Array(timeline.periods).fill(0), error: e.message }
        }
    }, [referenceMap, moduleOutputs, timeline.periods, timeline.year])

    // Evaluate all calculations in dependency order (using IDs, not positions)
    // Depends on calcVersion for on-demand recalculation - only recalculates when user clicks Calculate
    const { calculationResults, calculationErrors } = useMemo(() => {
        const results = {}
        const errors = {}

        // On initial load (calcVersion === 0): Use cached results if available
        // This provides instant startup without recalculating
        if (calcVersion === 0) {
            if (cachedResults?.calculationResults) {
                // Use cached results for instant display
                committedResultsRef.current = cachedResults.calculationResults
                return { calculationResults: cachedResults.calculationResults, calculationErrors: errors }
            }
            // No cached results - return empty (button will show "Calculate")
            committedResultsRef.current = results
            return { calculationResults: results, calculationErrors: errors }
        }

        const calcStart = performance.now()

        if (!calculations || calculations.length === 0) {
            committedResultsRef.current = results
            return { calculationResults: results, calculationErrors: errors }
        }

        // Build ID-based lookups for stable references
        const calcById = new Map()
        const allIds = new Set()
        calculations.forEach(calc => {
            calcById.set(calc.id, calc)
            allIds.add(calc.id)
        })

        const getDependencies = (formula) => {
            if (!formula) return []
            // Remove SHIFT(...) patterns - these are lagged dependencies (prior period)
            // and don't create true cycles in the dependency graph
            const formulaWithoutShift = formula.replace(/SHIFT\s*\([^)]+\)/gi, '')
            const deps = []
            const regex = /R(\d+)(?![0-9])/g
            let match
            while ((match = regex.exec(formulaWithoutShift)) !== null) {
                const refId = parseInt(match[1])
                // Only include if it's a valid calculation ID
                if (allIds.has(refId)) {
                    deps.push(refId)
                }
            }
            return [...new Set(deps)]
        }

        // Build dependencies using calculation IDs
        const dependencies = {}
        calculations.forEach(calc => {
            dependencies[calc.id] = getDependencies(calc.formula)
        })

        // Topological sort using IDs
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

        // Helper function to evaluate a single formula (optimized)
        const evalSingleFormula = (formula, calcResults) => {
            if (!formula || !formula.trim()) {
                return { values: new Array(timeline.periods).fill(0), error: null }
            }

            try {
                const allRefs = { ...referenceMap, ...moduleOutputs, ...calcResults }
                const resultArray = new Array(timeline.periods).fill(0)

                // Check for unresolved references before evaluation
                const formulaWithoutShift = formula.replace(/SHIFT\s*\([^)]+\)/gi, '')
                const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*|T\.[A-Za-z]+)\b/g
                const refsInFormula = [...new Set([...formulaWithoutShift.matchAll(refPattern)].map(m => m[1]))]
                const missingRefs = refsInFormula.filter(ref => !allRefs[ref])

                if (missingRefs.length > 0) {
                    return {
                        values: new Array(timeline.periods).fill(0),
                        error: `Unknown reference(s): ${missingRefs.join(', ')}`
                    }
                }

                const { processedFormula, arrayFnResults } = processArrayFunctions(formula, allRefs, timeline)

                // OPTIMIZATION: Sort refs ONCE per formula, not per period
                // Only include refs that are actually in this formula
                const sortedRefs = refsInFormula.sort((a, b) => b.length - a.length)

                // OPTIMIZATION: Pre-fetch arrays for refs in this formula
                const refArrays = sortedRefs.map(ref => ({ ref, arr: allRefs[ref], regex: getRegexCached(ref) }))
                const arrayFnEntries = Object.entries(arrayFnResults)

                for (let i = 0; i < timeline.periods; i++) {
                    let expr = processedFormula

                    // Substitute only refs that are in this formula (using cached regex)
                    for (const { arr, regex } of refArrays) {
                        const value = arr?.[i] ?? 0
                        regex.lastIndex = 0  // Reset regex state
                        expr = expr.replace(regex, value < 0 ? `(${value})` : value.toString())
                    }

                    for (const [placeholder, arr] of arrayFnEntries) {
                        expr = expr.replace(placeholder, arr[i] < 0 ? `(${arr[i]})` : arr[i].toString())
                    }

                    resultArray[i] = evaluateSafeExpression(expr)
                }

                return { values: resultArray, error: null }
            } catch (e) {
                return { values: new Array(timeline.periods).fill(0), error: e.message }
            }
        }

        // Evaluate in topological order
        if (evalOrder.length !== calculations.length) {
            // Cycle detected - identify which calculations are in the cycle
            const inCycle = new Set(allIds)
            evalOrder.forEach(id => inCycle.delete(id))
            const cycleCalcs = [...inCycle].map(id => `R${id}`).join(', ')

            // Evaluate non-cyclic calculations first
            for (const id of evalOrder) {
                const calc = calcById.get(id)
                const { values, error } = evalSingleFormula(calc.formula, results)
                results[`R${id}`] = values
                if (error) errors[`R${id}`] = error
            }

            // Mark cyclic calculations with error
            for (const id of inCycle) {
                results[`R${id}`] = new Array(timeline.periods).fill(0)
                errors[`R${id}`] = `Circular dependency detected: ${cycleCalcs}`
            }
        } else {
            for (const id of evalOrder) {
                const calc = calcById.get(id)
                const { values, error } = evalSingleFormula(calc.formula, results)
                results[`R${id}`] = values
                if (error) errors[`R${id}`] = error
            }
        }

        // Store committed results for preview function
        committedResultsRef.current = results

        console.log(`[CalcEngine] Evaluated ${calculations.length} calculations in ${(performance.now() - calcStart).toFixed(0)}ms`)

        return { calculationResults: results, calculationErrors: errors }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calcVersion, timeline.periods, cachedResults])

    // Get flow/stock type for each calculation from stored type (default: flow)
    const calculationTypes = useMemo(() => {
        const types = {}
        if (!calculations || calculations.length === 0) return types

        calculations.forEach((calc) => {
            // Use calculation ID for stable references
            const rRef = `R${calc.id}`
            // Use stored type, default to 'flow'
            types[rRef] = calc.type || 'flow'
        })

        return types
    }, [calculations])

    // Preview function for live formula editing (optimized)
    // Uses LIVE referenceMap + COMMITTED calculation results
    // This allows instant formula preview without triggering full model recalc
    const previewFormula = useCallback((formula) => {
        if (!formula || !formula.trim()) {
            return { values: new Array(timeline.periods).fill(0), error: null }
        }

        try {
            // Combine live references with committed calc results
            const allRefs = { ...referenceMap, ...moduleOutputs, ...committedResultsRef.current }
            const resultArray = new Array(timeline.periods).fill(0)

            // Check for unresolved references
            const formulaWithoutShift = formula.replace(/SHIFT\s*\([^)]+\)/gi, '')
            const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*|T\.[A-Za-z]+)\b/g
            const refsInFormula = [...new Set([...formulaWithoutShift.matchAll(refPattern)].map(m => m[1]))]
            const missingRefs = refsInFormula.filter(ref => !allRefs[ref])

            if (missingRefs.length > 0) {
                return {
                    values: new Array(timeline.periods).fill(0),
                    error: `Unknown reference(s): ${missingRefs.join(', ')}`
                }
            }

            const { processedFormula, arrayFnResults } = processArrayFunctions(formula, allRefs, timeline)

            // OPTIMIZATION: Sort refs ONCE, not per period. Only include refs in this formula.
            const sortedRefs = refsInFormula.sort((a, b) => b.length - a.length)
            const refArrays = sortedRefs.map(ref => ({ arr: allRefs[ref], regex: getRegexCached(ref) }))
            const arrayFnEntries = Object.entries(arrayFnResults)

            for (let i = 0; i < timeline.periods; i++) {
                let expr = processedFormula

                for (const { arr, regex } of refArrays) {
                    const value = arr?.[i] ?? 0
                    regex.lastIndex = 0
                    expr = expr.replace(regex, value < 0 ? `(${value})` : value.toString())
                }

                for (const [placeholder, arr] of arrayFnEntries) {
                    expr = expr.replace(placeholder, arr[i] < 0 ? `(${arr[i]})` : arr[i].toString())
                }

                resultArray[i] = evaluateSafeExpression(expr)
            }

            return { values: resultArray, error: null }
        } catch (e) {
            return { values: new Array(timeline.periods).fill(0), error: e.message }
        }
    }, [referenceMap, moduleOutputs, timeline])

    return {
        evaluateFormula,
        previewFormula,
        calculationResults,
        calculationErrors,
        calculationTypes
    }
}
