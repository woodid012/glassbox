'use client'

import { useMemo, useCallback, useRef } from 'react'
import { runCalculationPass, evaluateSingleCalc } from '@/utils/calculationCore'

/**
 * Unified Calculation Hook — thin React wrapper around calculationCore.
 *
 * Converted modules: Their outputs are regular R-ref calculations. M-refs in
 * formulas are rewritten to R-refs via _mRefMap. The module node is skipped
 * during evaluation (its calcs handle everything).
 *
 * Non-converted modules (iterative_debt_sizing, dsrf): Still evaluated via
 * calculateModuleOutputs() as before.
 */
export function useUnifiedCalculation({
    calculations,
    modules,
    referenceMap,
    timeline,
    mRefMap
}) {
    // Store committed results for preview function
    const committedResultsRef = useRef({ calculations: {}, modules: {} })

    const { calculationResults, moduleOutputs, calculationErrors } = useMemo(() => {
        const startTime = performance.now()

        const result = runCalculationPass(
            calculations || [],
            modules || [],
            referenceMap || {},
            timeline || { periods: 0, year: [], month: [], periodLabels: [] },
            mRefMap || {},
            {}
        )

        // Store committed results for preview
        committedResultsRef.current = {
            calculations: result.calculationResults,
            modules: result.moduleOutputs
        }

        const elapsed = performance.now() - startTime
        const calcCount = Object.keys(result.calculationResults).length
        const moduleCount = Object.keys(result.moduleOutputs).length
        console.log(`[UnifiedCalc] Evaluated ${calcCount} calculations and ${moduleCount} module outputs in ${elapsed.toFixed(0)}ms (single pass)`)

        return {
            calculationResults: result.calculationResults,
            moduleOutputs: result.moduleOutputs,
            calculationErrors: result.calculationErrors
        }
    }, [calculations, modules, referenceMap, timeline, mRefMap])

    // Get flow/stock type for each calculation from stored type (default: flow)
    const calculationTypes = useMemo(() => {
        const types = {}
        if (!calculations || calculations.length === 0) return types
        calculations.forEach((calc) => {
            types[`R${calc.id}`] = calc.type || 'flow'
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
    const previewFormula = useCallback((formula) => {
        if (!formula || !formula.trim()) {
            return { values: new Array(timeline.periods).fill(0), error: null }
        }

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
