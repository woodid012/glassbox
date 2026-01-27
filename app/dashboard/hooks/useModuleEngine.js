'use client'

import { useMemo } from 'react'
import { calculateModuleOutputs, MODULE_TEMPLATES } from '@/utils/moduleTemplates'
import { processArrayFunctions, evaluateSafeExpression } from '@/utils/formulaEvaluator'

/**
 * Hook to compute module outputs
 * Extracts module engine logic from useDashboardState
 *
 * Handles:
 * - Regular module outputs (computed after calculations)
 * - Iterative modules (like debt sizing)
 * - Module dependency sorting
 * - Second-pass calculation re-evaluation for module references
 * - On-demand calculation (calcVersion controls when recalc happens)
 */
export function useModuleEngine({
    modules,
    referenceMap,
    calculationResults,
    calculations,
    timeline,
    calcVersion = 0,
    cachedResults = null
}) {
    // Initialize empty module outputs (placeholder before calculation)
    const regularModuleOutputs = useMemo(() => {
        const outputs = {}
        if (!modules || modules.length === 0) return outputs

        // All modules are calculated in post-calculation phase
        // This phase just initializes empty arrays for the dependency chain
        modules.forEach((module, moduleIdx) => {
            const templateKey = module.templateId
            const template = MODULE_TEMPLATES[templateKey]
            if (template) {
                template.outputs.forEach((output, outputIdx) => {
                    const ref = `M${moduleIdx + 1}.${outputIdx + 1}`
                    outputs[ref] = new Array(timeline.periods).fill(0)
                })
            }
        })

        return outputs
    }, [modules, timeline.periods])

    // Calculate ALL module outputs AFTER calculations (Phase 4)
    // This ensures modules can reference both inputs (V, S, F, C, I) and calculations (R)
    // Modules are topologically sorted by dependencies so order in the list doesn't matter
    const postCalcModuleOutputs = useMemo(() => {
        const outputs = {}

        // On initial load (calcVersion === 0): Use cached module outputs if available
        if (calcVersion === 0) {
            if (cachedResults?.moduleOutputs) {
                return cachedResults.moduleOutputs
            }
            return outputs
        }

        const moduleStart = performance.now()

        if (!modules || modules.length === 0) return outputs

        // Build dependency graph for modules
        // Each module can reference other modules via M1.1, M2.3, etc.
        const moduleRefs = new Map() // moduleIdx -> Set of modules this one depends on
        const dependentsOf = new Map() // moduleIdx -> Set of modules that depend on this one (reverse map)
        const modulePattern = /M(\d+)\.\d+/g

        // Initialize maps
        modules.forEach((_, idx) => {
            moduleRefs.set(idx, new Set())
            dependentsOf.set(idx, new Set())
        })

        modules.forEach((module, moduleIdx) => {
            const deps = moduleRefs.get(moduleIdx)
            const inputs = module.inputs || {}

            // Check all input values for M references
            Object.values(inputs).forEach(value => {
                if (typeof value === 'string') {
                    let match
                    while ((match = modulePattern.exec(value)) !== null) {
                        const depModuleNum = parseInt(match[1], 10)
                        const depModuleIdx = depModuleNum - 1
                        if (depModuleIdx !== moduleIdx && depModuleIdx >= 0 && depModuleIdx < modules.length) {
                            deps.add(depModuleIdx)
                            // Build reverse map: depModuleIdx has moduleIdx as a dependent
                            dependentsOf.get(depModuleIdx).add(moduleIdx)
                        }
                    }
                    modulePattern.lastIndex = 0 // Reset regex
                }
            })
        })

        // Topological sort using Kahn's algorithm
        // Use reverse map for O(1) dependent lookup instead of O(n) iteration
        const inDegree = new Map()
        modules.forEach((_, idx) => {
            inDegree.set(idx, moduleRefs.get(idx).size)
        })

        // Start with modules that have no dependencies
        const queue = []
        modules.forEach((_, idx) => {
            if (inDegree.get(idx) === 0) queue.push(idx)
        })

        const sortedOrder = []
        while (queue.length > 0) {
            const idx = queue.shift()
            sortedOrder.push(idx)

            // Use reverse map for O(1) lookup of dependents
            for (const dependentIdx of dependentsOf.get(idx)) {
                const newDegree = inDegree.get(dependentIdx) - 1
                inDegree.set(dependentIdx, newDegree)
                if (newDegree === 0) queue.push(dependentIdx)
            }
        }

        // If we couldn't sort all modules, there's a cycle - fall back to original order
        if (sortedOrder.length !== modules.length) {
            console.warn('Circular dependency detected in modules, using original order')
            modules.forEach((_, idx) => { if (!sortedOrder.includes(idx)) sortedOrder.push(idx) })
        }

        // Calculate modules in dependency order
        sortedOrder.forEach(moduleIdx => {
            const module = modules[moduleIdx]
            const templateKey = module.templateId
            const template = MODULE_TEMPLATES[templateKey]
            if (!template) return

            // Iterative modules (like debt sizing) need solvedAt to calculate
            const isIterative = templateKey === 'iterative_debt_sizing'
            if (isIterative && !module.solvedAt) {
                template.outputs.forEach((output, outputIdx) => {
                    const ref = `M${moduleIdx + 1}.${outputIdx + 1}`
                    outputs[ref] = new Array(timeline.periods).fill(0)
                })
                return
            }

            // Build context with referenceMap, calculationResults, previously calculated module outputs, and timeline
            const context = { ...referenceMap, ...calculationResults, ...outputs, timeline }

            const moduleInstance = {
                moduleType: templateKey,
                inputs: module.inputs || {}
            }

            const calculatedOutputs = calculateModuleOutputs(
                moduleInstance,
                timeline.periods,
                context
            )

            template.outputs.forEach((output, outputIdx) => {
                const ref = `M${moduleIdx + 1}.${outputIdx + 1}`
                outputs[ref] = calculatedOutputs[output.key] || new Array(timeline.periods).fill(0)
            })
        })

        console.log(`[ModuleEngine] Computed ${modules.length} modules in ${(performance.now() - moduleStart).toFixed(0)}ms`)

        return outputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calcVersion, timeline.periods, cachedResults])

    // Second pass: Re-evaluate calculations that reference module outputs
    // This is needed because calculationResults is computed before modules,
    // so any calc referencing M*.* would get zeros in the first pass
    const finalCalculationResults = useMemo(() => {
        // On initial load (calcVersion === 0): Use cached calculation results if available
        // The cached results already include the second-pass re-evaluated values
        if (calcVersion === 0) {
            if (cachedResults?.calculationResults) {
                return cachedResults.calculationResults
            }
            return calculationResults
        }

        if (!calculations || calculations.length === 0) return calculationResults

        // Check if we have any real module outputs
        const hasModuleOutputs = Object.keys(postCalcModuleOutputs).length > 0

        if (!hasModuleOutputs) return calculationResults

        const secondPassStart = performance.now()

        // Find calculations that reference module outputs (M1.1, M2.3, etc.)
        // Note: Don't use /g flag with .test() as it maintains lastIndex state between calls
        const calcsWithModuleRefs = calculations.filter(calc =>
            calc.formula && /M\d+\.\d+/.test(calc.formula)
        )

        if (calcsWithModuleRefs.length === 0) return calculationResults

        // Build combined context with real module outputs
        const allRefs = { ...referenceMap, ...postCalcModuleOutputs, ...calculationResults }

        // Re-evaluate calculations that have module references
        const updatedResults = { ...calculationResults }

        // Build dependency order for calcs with module refs
        const calcById = new Map()
        calculations.forEach(calc => calcById.set(calc.id, calc))

        // Get all calc IDs that need re-evaluation (directly or indirectly reference modules)
        const needsReeval = new Set()
        const checkDependents = (id) => {
            if (needsReeval.has(id)) return
            needsReeval.add(id)
            // Find calcs that depend on this one
            calculations.forEach(calc => {
                if (calc.formula && calc.formula.includes(`R${id}`)) {
                    checkDependents(calc.id)
                }
            })
        }

        calcsWithModuleRefs.forEach(calc => checkDependents(calc.id))

        // Debug: Log which calculations need re-evaluation
        console.log(`[ModuleEngine] Calcs with direct module refs:`, calcsWithModuleRefs.map(c => `R${c.id}`))
        console.log(`[ModuleEngine] All calcs needing re-eval (including dependents):`, [...needsReeval].map(id => `R${id}`))

        // Re-evaluate in dependency order with convergence detection
        // Exits early when results stabilize (typically 1-2 passes)
        const reevalIds = [...needsReeval]
        const MAX_PASSES = 5
        const TOLERANCE = 1e-10

        // Helper to check if two arrays are equal within tolerance
        const arraysEqual = (a, b) => {
            if (!a || !b || a.length !== b.length) return false
            for (let i = 0; i < a.length; i++) {
                if (Math.abs((a[i] || 0) - (b[i] || 0)) > TOLERANCE) return false
            }
            return true
        }

        // Pre-compile regex patterns (cache them globally for reuse)
        const refRegexCache = new Map()
        const getRefRegex = (ref) => {
            if (!refRegexCache.has(ref)) {
                refRegexCache.set(ref, new RegExp(`\\b${ref.replace(/\./g, '\\.')}\\b`, 'g'))
            }
            return refRegexCache.get(ref)
        }

        // Pre-extract refs for each calculation (do once, not per pass)
        const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*|T\.[A-Za-z]+)\b/g
        const calcRefData = new Map()
        for (const id of reevalIds) {
            const calc = calcById.get(id)
            if (!calc || !calc.formula) continue
            const formulaWithoutShift = calc.formula.replace(/SHIFT\s*\([^)]+\)/gi, '')
            const refs = [...new Set([...formulaWithoutShift.matchAll(refPattern)].map(m => m[1]))]
            calcRefData.set(id, refs.sort((a, b) => b.length - a.length))
        }

        for (let pass = 0; pass < MAX_PASSES; pass++) {
            let converged = true

            // Build context once per pass (not per calculation)
            const context = { ...allRefs, ...updatedResults }

            for (const id of reevalIds) {
                const calc = calcById.get(id)
                if (!calc || !calc.formula) continue

                try {
                    const { processedFormula, arrayFnResults } = processArrayFunctions(calc.formula, context, timeline)

                    // Get pre-extracted refs for this formula
                    const refsInFormula = calcRefData.get(id) || []

                    // Pre-fetch arrays and regexes for this formula
                    const refArrays = refsInFormula.map(ref => ({
                        arr: context[ref],
                        regex: getRefRegex(ref)
                    }))
                    const arrayFnEntries = Object.entries(arrayFnResults)

                    const resultArray = new Array(timeline.periods).fill(0)
                    for (let i = 0; i < timeline.periods; i++) {
                        let expr = processedFormula

                        // Only substitute refs that are in this formula (using cached regex)
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

                    // Check if this calculation changed
                    const prevResult = updatedResults[`R${id}`]
                    if (!arraysEqual(prevResult, resultArray)) {
                        converged = false
                        updatedResults[`R${id}`] = resultArray
                    }
                } catch (e) {
                    // Keep original result on error
                }
            }

            // Exit early if all calculations converged
            if (converged) break
        }

        console.log(`[ModuleEngine] Second pass re-evaluated ${reevalIds.length} calculations in ${(performance.now() - secondPassStart).toFixed(0)}ms`)

        // Debug: Check R132 specifically
        if (updatedResults['R132']) {
            const sum = updatedResults['R132'].reduce((a, b) => a + b, 0)
            console.log(`[ModuleEngine] R132 (Equity Injections) total: ${sum.toFixed(0)}`)
        }

        return updatedResults
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calcVersion, postCalcModuleOutputs, timeline.periods, cachedResults])

    // Third pass: Re-evaluate modules that depend on calculations that were re-evaluated
    // This handles the case where:
    //   1. Module A (e.g., Depreciation) outputs M2.3
    //   2. Calculation R14 = -M2.3 (needs second pass)
    //   3. Calculation R17 = R15 + R16, where R15 depends on R14 (also needs second pass)
    //   4. Module B (e.g., Tax) uses R17 as input - needs THIRD pass with corrected R17
    const finalModuleOutputs = useMemo(() => {
        // On initial load or no recalc needed
        if (calcVersion === 0 || !modules || modules.length === 0) {
            return postCalcModuleOutputs
        }

        // Check if finalCalculationResults differs from calculationResults
        // If no changes, no need for third pass
        const calcResultKeys = Object.keys(calculationResults)
        let hasChanges = false
        for (const key of calcResultKeys) {
            const orig = calculationResults[key]
            const final = finalCalculationResults[key]
            if (orig !== final) {
                // Check if arrays actually differ
                if (!orig || !final || orig.length !== final.length) {
                    hasChanges = true
                    break
                }
                for (let i = 0; i < orig.length; i++) {
                    if (Math.abs((orig[i] || 0) - (final[i] || 0)) > 1e-10) {
                        hasChanges = true
                        break
                    }
                }
                if (hasChanges) break
            }
        }

        if (!hasChanges) {
            console.log('[ModuleEngine] Third pass skipped - no changes detected between first and second pass')
            return postCalcModuleOutputs
        }

        // Log which calculations changed
        const changedCalcs = []
        for (const key of calcResultKeys) {
            const orig = calculationResults[key]
            const final = finalCalculationResults[key]
            if (orig && final) {
                for (let i = 0; i < Math.min(orig.length, final.length); i++) {
                    if (Math.abs((orig[i] || 0) - (final[i] || 0)) > 1e-10) {
                        changedCalcs.push(key)
                        break
                    }
                }
            }
        }
        console.log('[ModuleEngine] Third pass running - changed calcs:', changedCalcs.slice(0, 10))

        const thirdPassStart = performance.now()

        // Re-run modules with finalCalculationResults instead of calculationResults
        const outputs = {}

        // Build dependency graph (same as in postCalcModuleOutputs)
        const moduleRefs = new Map()
        const dependentsOf = new Map()
        const modulePattern = /M(\d+)\.\d+/g

        modules.forEach((_, idx) => {
            moduleRefs.set(idx, new Set())
            dependentsOf.set(idx, new Set())
        })

        modules.forEach((module, moduleIdx) => {
            const deps = moduleRefs.get(moduleIdx)
            const inputs = module.inputs || {}

            Object.values(inputs).forEach(value => {
                if (typeof value === 'string') {
                    let match
                    while ((match = modulePattern.exec(value)) !== null) {
                        const depModuleNum = parseInt(match[1], 10)
                        const depModuleIdx = depModuleNum - 1
                        if (depModuleIdx !== moduleIdx && depModuleIdx >= 0 && depModuleIdx < modules.length) {
                            deps.add(depModuleIdx)
                            dependentsOf.get(depModuleIdx).add(moduleIdx)
                        }
                    }
                    modulePattern.lastIndex = 0
                }
            })
        })

        // Topological sort
        const inDegree = new Map()
        modules.forEach((_, idx) => {
            inDegree.set(idx, moduleRefs.get(idx).size)
        })

        const queue = []
        modules.forEach((_, idx) => {
            if (inDegree.get(idx) === 0) queue.push(idx)
        })

        const sortedOrder = []
        while (queue.length > 0) {
            const idx = queue.shift()
            sortedOrder.push(idx)

            for (const dependentIdx of dependentsOf.get(idx)) {
                const newDegree = inDegree.get(dependentIdx) - 1
                inDegree.set(dependentIdx, newDegree)
                if (newDegree === 0) queue.push(dependentIdx)
            }
        }

        if (sortedOrder.length !== modules.length) {
            modules.forEach((_, idx) => { if (!sortedOrder.includes(idx)) sortedOrder.push(idx) })
        }

        // Calculate modules using FINAL calculation results
        sortedOrder.forEach(moduleIdx => {
            const module = modules[moduleIdx]
            const templateKey = module.templateId
            const template = MODULE_TEMPLATES[templateKey]
            if (!template) return

            const isIterative = templateKey === 'iterative_debt_sizing'
            if (isIterative && !module.solvedAt) {
                template.outputs.forEach((output, outputIdx) => {
                    const ref = `M${moduleIdx + 1}.${outputIdx + 1}`
                    outputs[ref] = new Array(timeline.periods).fill(0)
                })
                return
            }

            // Use finalCalculationResults instead of calculationResults
            const context = { ...referenceMap, ...finalCalculationResults, ...outputs, timeline }

            const moduleInstance = {
                moduleType: templateKey,
                inputs: module.inputs || {}
            }

            const calculatedOutputs = calculateModuleOutputs(
                moduleInstance,
                timeline.periods,
                context
            )

            template.outputs.forEach((output, outputIdx) => {
                const ref = `M${moduleIdx + 1}.${outputIdx + 1}`
                outputs[ref] = calculatedOutputs[output.key] || new Array(timeline.periods).fill(0)
            })
        })

        console.log(`[ModuleEngine] Third pass re-computed ${modules.length} modules in ${(performance.now() - thirdPassStart).toFixed(0)}ms`)

        return outputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calcVersion, finalCalculationResults, postCalcModuleOutputs, timeline.periods])

    // Merge all module outputs (priority: finalModuleOutputs > postCalcModuleOutputs > regularModuleOutputs)
    // finalModuleOutputs has third-pass results (modules recalculated with correct calc values)
    // postCalcModuleOutputs has second-pass results (modules with first-pass calc values)
    // regularModuleOutputs has just placeholders (zeros)
    const allModuleOutputs = useMemo(() => {
        const hasFinalOutputs = Object.keys(finalModuleOutputs).length > 0
        const hasPostCalcOutputs = Object.keys(postCalcModuleOutputs).length > 0

        if (hasFinalOutputs) {
            return { ...regularModuleOutputs, ...finalModuleOutputs }
        } else if (hasPostCalcOutputs) {
            return { ...regularModuleOutputs, ...postCalcModuleOutputs }
        }
        return regularModuleOutputs
    }, [regularModuleOutputs, postCalcModuleOutputs, finalModuleOutputs])

    return {
        regularModuleOutputs,
        postCalcModuleOutputs,
        finalModuleOutputs,
        allModuleOutputs,
        finalCalculationResults
    }
}
