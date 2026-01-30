'use client'

import { useMemo, useCallback, useRef } from 'react'
import { processArrayFunctions, evaluateSafeExpression, extractShiftTargets, evaluateClusterPeriodByPeriod } from '@/utils/formulaEvaluator'
import { calculateModuleOutputs, MODULE_TEMPLATES } from '@/utils/modules'

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

    // Remove SHIFT/PREVSUM/PREVVAL patterns - these are lagged dependencies (prior period)
    // and don't create true cycles in the dependency graph
    const formulaWithoutShift = formula.replace(/(?:SHIFT\s*\([^)]+\)|PREVSUM\s*\([^)]+\)|PREVVAL\s*\([^)]+\))/gi, '')

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
 * Build unified dependency graph of calculations AND modules.
 * For converted modules, M-refs in formulas are rewritten to R-refs.
 * Converted module nodes are excluded from the graph (their calcs handle evaluation).
 */
function buildUnifiedGraph(calculations, modules, mRefMapData) {
    const graph = new Map() // nodeId -> { type, deps: Set, item, index? }
    const allCalcIds = new Set()

    // Add all calculations as nodes
    if (calculations) {
        calculations.forEach(calc => {
            const nodeId = `R${calc.id}`
            allCalcIds.add(calc.id)
            // Rewrite M-refs in formula to R-refs for converted modules
            const rewrittenFormula = rewriteMRefs(calc.formula, mRefMapData)
            const deps = extractDependencies(rewrittenFormula)
            graph.set(nodeId, {
                type: 'calc',
                deps: new Set(deps),
                item: { ...calc, _rewrittenFormula: rewrittenFormula }
            })
        })
    }

    // Add only non-converted modules as nodes (M1, M8 etc.)
    if (modules) {
        modules.forEach((mod, idx) => {
            // Skip fully converted modules — their outputs are now regular R-ref calcs
            if (mod.converted || mod.fullyConverted) return

            const nodeId = `M${idx + 1}`
            const deps = extractModuleDependencies(mod, idx, modules.length)
            graph.set(nodeId, { type: 'module', deps: new Set(deps), item: mod, index: idx })
        })
    }

    // Filter out dependencies that don't exist in the graph
    // (e.g., references to deleted calculations or converted module nodes)
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
 * Detect SHIFT-based soft cycles in the dependency graph.
 * A soft cycle exists when formula A uses SHIFT(B, n) and B transitively depends on A
 * through regular (non-SHIFT) dependencies.
 *
 * Returns cluster information for period-by-period evaluation.
 * @param {Map} graph - The unified dependency graph
 * @param {Object[]} calculations - Array of calculation objects
 * @returns {{ nodeToCluster: Map<string, number>, clusters: Map<number, { members: Object[], internalOrder: string[] }> }}
 */
function detectShiftCycles(graph, calculations) {
    const nodeToCluster = new Map()
    const clusters = new Map()
    let nextClusterId = 0

    if (!calculations) return { nodeToCluster, clusters, nonCyclicalShiftDeps: [] }

    // Build a reverse adjacency map for regular deps (non-SHIFT)
    // reverseAdj[X] = set of nodes that X depends on (regular deps)
    const forwardAdj = new Map() // nodeId -> Set of nodes it depends on (regular deps)
    graph.forEach((node, nodeId) => {
        forwardAdj.set(nodeId, node.deps)
    })

    // Check if targetId is reachable from startId via regular deps (BFS)
    function isReachable(startId, targetId) {
        if (startId === targetId) return true
        const visited = new Set()
        const queue = [startId]
        visited.add(startId)
        while (queue.length > 0) {
            const current = queue.shift()
            const deps = forwardAdj.get(current)
            if (!deps) continue
            for (const dep of deps) {
                if (dep === targetId) return true
                if (!visited.has(dep)) {
                    visited.add(dep)
                    queue.push(dep)
                }
            }
        }
        return false
    }

    // Collect all nodes on the path between two nodes (both directions through regular deps)
    function collectCycleNodes(shiftSource, shiftTarget) {
        // shiftSource uses SHIFT(shiftTarget), and shiftTarget depends on shiftSource via regular deps
        // Collect all nodes on paths from shiftTarget back to shiftSource
        const cycleNodes = new Set([shiftSource, shiftTarget])

        // BFS from shiftTarget, find all paths to shiftSource
        // We need all intermediate nodes
        const visited = new Map() // nodeId -> Set of predecessor nodes leading to it
        const queue = [shiftTarget]
        visited.set(shiftTarget, new Set())

        while (queue.length > 0) {
            const current = queue.shift()
            const deps = forwardAdj.get(current)
            if (!deps) continue
            for (const dep of deps) {
                if (dep === shiftSource) {
                    // Found path - trace back
                    cycleNodes.add(dep)
                    // Add all nodes from current back to shiftTarget
                    let trace = current
                    cycleNodes.add(trace)
                    continue
                }
                if (!visited.has(dep)) {
                    visited.set(dep, new Set())
                    queue.push(dep)
                }
            }
        }

        // Simpler approach: include all nodes reachable from shiftTarget that can reach shiftSource
        graph.forEach((_, nodeId) => {
            if (nodeId.startsWith('R') && isReachable(shiftTarget, nodeId) && isReachable(nodeId, shiftSource)) {
                cycleNodes.add(nodeId)
            }
        })

        return cycleNodes
    }

    // For each calculation, find SHIFT targets and check for soft cycles
    const allCycleNodeSets = []

    calculations.forEach(calc => {
        const nodeId = `R${calc.id}`
        const shiftTargets = extractShiftTargets(calc.formula)

        for (const target of shiftTargets) {
            if (!graph.has(target)) continue
            // Check: does target transitively depend on nodeId via regular deps?
            if (isReachable(target, nodeId)) {
                // Soft cycle found: nodeId uses SHIFT(target), target depends on nodeId
                const cycleNodes = collectCycleNodes(nodeId, target)
                allCycleNodeSets.push(cycleNodes)
            }
        }
    })

    if (allCycleNodeSets.length === 0) {
        // No cycles, but still check for non-cyclical SHIFT deps
        const nonCyclicalShiftDeps = []
        calculations.forEach(calc => {
            const nodeId = `R${calc.id}`
            const shiftTargets = extractShiftTargets(calc.formula)
            for (const target of shiftTargets) {
                if (!graph.has(target)) continue
                if (target === nodeId) continue
                nonCyclicalShiftDeps.push({ from: nodeId, to: target })
            }
        })
        return { nodeToCluster, clusters, nonCyclicalShiftDeps }
    }

    // Merge overlapping sets
    const merged = []
    for (const nodeSet of allCycleNodeSets) {
        let mergedInto = null
        for (let i = 0; i < merged.length; i++) {
            for (const node of nodeSet) {
                if (merged[i].has(node)) {
                    mergedInto = i
                    break
                }
            }
            if (mergedInto !== null) break
        }
        if (mergedInto !== null) {
            for (const node of nodeSet) merged[mergedInto].add(node)
        } else {
            merged.push(new Set(nodeSet))
        }
    }

    // Build cluster structures
    const calcById = new Map()
    calculations.forEach(c => calcById.set(`R${c.id}`, c))

    for (const nodeSet of merged) {
        const clusterId = nextClusterId++
        const members = []
        for (const nodeId of nodeSet) {
            nodeToCluster.set(nodeId, clusterId)
            const calc = calcById.get(nodeId)
            if (calc) members.push(calc)
        }
        // Internal order: preserve topological sort order (will be set later)
        clusters.set(clusterId, { members, internalOrder: [] })
    }

    // Also collect non-cyclical SHIFT deps: SHIFT targets that don't form cycles.
    // These need to be added as regular deps for proper evaluation ordering.
    const nonCyclicalShiftDeps = []
    calculations.forEach(calc => {
        const nodeId = `R${calc.id}`
        const shiftTargets = extractShiftTargets(calc.formula)
        for (const target of shiftTargets) {
            if (!graph.has(target)) continue
            if (target === nodeId) continue // self-ref handled by cluster
            // Skip if both are in the same cluster (already handled by period-by-period eval)
            if (nodeToCluster.has(nodeId) && nodeToCluster.has(target) &&
                nodeToCluster.get(nodeId) === nodeToCluster.get(target)) continue
            // If target can't reach back to nodeId, this is non-cyclical
            if (!isReachable(target, nodeId)) {
                nonCyclicalShiftDeps.push({ from: nodeId, to: target })
            }
        }
    })

    return { nodeToCluster, clusters, nonCyclicalShiftDeps }
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
        const formulaWithoutLag = formula.replace(/(?:SHIFT\s*\([^)]+\)|PREVSUM\s*\([^)]+\)|PREVVAL\s*\([^)]+\))/gi, '')
        const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*(?:\.(?:Start|End))?|T\.[A-Za-z]+)\b/g
        const refsInFormula = [...new Set([...formulaWithoutLag.matchAll(refPattern)].map(m => m[1]))]
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

/**
 * Rewrite M-refs in a formula string using the _mRefMap.
 * Converts e.g. "M2.3" → "R9003" for converted modules.
 * Unconverted M-refs (e.g., M1.x for iterative_debt_sizing) are left as-is.
 */
function rewriteMRefs(formula, mRefMap) {
    if (!formula || !mRefMap) return formula
    // Sort M-refs longest first to avoid partial matches
    const sortedEntries = Object.entries(mRefMap).sort((a, b) => b[0].length - a[0].length)
    let result = formula
    for (const [mRef, rRef] of sortedEntries) {
        const regex = getRegexCached(mRef)
        regex.lastIndex = 0
        result = result.replace(regex, rRef)
    }
    return result
}

/**
 * Unified Calculation Hook
 * Replaces the 3-pass architecture with a single topologically-sorted evaluation
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

    // Single unified calculation pass - runs on every dependency change (fast enough now ~5ms)
    const { calculationResults, moduleOutputs, calculationErrors } = useMemo(() => {
        const calcResults = {}
        const modOutputs = {}
        const errors = {}

        const startTime = performance.now()

        // Build M-ref map for rewriting converted module references
        const mRefMapData = mRefMap || {}

        // Build unified dependency graph
        const graph = buildUnifiedGraph(calculations, modules, mRefMapData)

        if (graph.size === 0) {
            return { calculationResults: calcResults, moduleOutputs: modOutputs, calculationErrors: errors }
        }

        // Detect SHIFT-based soft cycles
        const { nodeToCluster, clusters, nonCyclicalShiftDeps } = detectShiftCycles(graph, calculations)

        // Add non-cyclical SHIFT targets as regular deps for proper evaluation ordering
        // (e.g., SHIFT(R9007, 1) in R9010 means R9007 must be evaluated before R9010)
        for (const { from, to } of nonCyclicalShiftDeps) {
            const node = graph.get(from)
            if (node) node.deps.add(to)
        }

        // CRITICAL: For non-cluster nodes that depend on a cluster member,
        // add deps on ALL members of that cluster. This ensures the topo sort
        // places the node after the cluster trigger (last member), so cluster
        // results are available in the context when the node is evaluated.
        if (nodeToCluster.size > 0) {
            graph.forEach((node, nodeId) => {
                if (nodeToCluster.has(nodeId)) return // skip cluster members
                let needsAugment = false
                node.deps.forEach(dep => {
                    if (nodeToCluster.has(dep)) needsAugment = true
                })
                if (needsAugment) {
                    node.deps.forEach(dep => {
                        const cId = nodeToCluster.get(dep)
                        if (cId !== undefined) {
                            const cluster = clusters.get(cId)
                            if (cluster) {
                                cluster.members.forEach(m => node.deps.add(`R${m.id}`))
                            }
                        }
                    })
                }
            })
        }

        // Topological sort (after augmenting deps with non-cyclical SHIFT targets)
        const sortedNodes = topologicalSort(graph)

        // Set internal order for clusters based on topological sort order
        // Also override cluster member formulas with rewritten versions (M-refs → R-refs)
        if (clusters.size > 0) {
            const nodePosition = new Map()
            sortedNodes.forEach((id, idx) => nodePosition.set(id, idx))

            clusters.forEach(cluster => {
                cluster.internalOrder = cluster.members
                    .map(c => `R${c.id}`)
                    .sort((a, b) => (nodePosition.get(a) ?? 0) - (nodePosition.get(b) ?? 0))

                // Rewrite M-refs in cluster member formulas
                cluster.members = cluster.members.map(c => {
                    const graphNode = graph.get(`R${c.id}`)
                    const rewritten = graphNode?.item?._rewrittenFormula
                    if (rewritten && rewritten !== c.formula) {
                        return { ...c, formula: rewritten }
                    }
                    return c
                })
            })

            console.log(`[UnifiedCalc] Detected ${clusters.size} SHIFT cycle cluster(s):`,
                [...clusters.entries()].map(([id, c]) => `Cluster ${id}: ${c.internalOrder.join(', ')}`).join('; '))
        }

        // Build context with referenceMap as base
        const context = { ...referenceMap, timeline }

        // Track evaluation stats
        let calcCount = 0
        let moduleCount = 0
        const evaluatedClusters = new Set()

        // Pre-compute: for each cluster, find the LAST member in topological order
        // This ensures all external deps of all members are satisfied before cluster evaluation
        const clusterLastNodePos = new Map()
        sortedNodes.forEach((nodeId, pos) => {
            const cId = nodeToCluster.get(nodeId)
            if (cId !== undefined) {
                clusterLastNodePos.set(cId, pos)
            }
        })
        const clusterTriggerPos = new Map()
        clusterLastNodePos.forEach((pos, cId) => {
            clusterTriggerPos.set(pos, cId)
        })

        // Evaluate in topological order
        for (let nodeIdx = 0; nodeIdx < sortedNodes.length; nodeIdx++) {
            const nodeId = sortedNodes[nodeIdx]
            const node = graph.get(nodeId)
            if (!node) continue

            const clusterId = nodeToCluster.get(nodeId)

            if (clusterId !== undefined) {
                // This node belongs to a SHIFT cycle cluster
                // Only trigger cluster evaluation at the LAST member position
                const triggerClusterId = clusterTriggerPos.get(nodeIdx)
                if (triggerClusterId === undefined || evaluatedClusters.has(triggerClusterId)) continue
                evaluatedClusters.add(triggerClusterId)

                // Evaluate entire cluster period-by-period
                const cluster = clusters.get(triggerClusterId)
                const clusterResults = evaluateClusterPeriodByPeriod(
                    cluster.members, cluster.internalOrder, context, timeline
                )
                Object.entries(clusterResults).forEach(([id, values]) => {
                    calcResults[id] = values
                    context[id] = values
                    // Populate M-ref context aliases for converted module outputs in clusters
                    if (mRefMapData) {
                        for (const [mRef, rRef] of Object.entries(mRefMapData)) {
                            if (rRef === id) {
                                context[mRef] = values
                                modOutputs[mRef] = values
                            }
                        }
                    }
                })
                calcCount += cluster.members.length
            } else if (node.type === 'calc') {
                // Evaluate calculation (standard array path)
                // Use rewritten formula (M-refs resolved to R-refs for converted modules)
                const formula = node.item._rewrittenFormula || node.item.formula
                const { values, error } = evaluateSingleCalc(formula, context, timeline)
                calcResults[nodeId] = values
                context[nodeId] = values // Add to context for downstream nodes
                if (error) errors[nodeId] = error
                calcCount++

                // If this calc is a converted module output, also populate M-ref context
                // so non-converted modules can still reference it via M-refs in their inputs
                if (mRefMapData) {
                    for (const [mRef, rRef] of Object.entries(mRefMapData)) {
                        if (rRef === nodeId) {
                            context[mRef] = values
                            modOutputs[mRef] = values
                        }
                    }
                }
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
                // Preserve solver log metadata if present
                if (calculatedOutputs._solverLog) {
                    modOutputs[`_solverLog_M${node.index + 1}`] = calculatedOutputs._solverLog
                }
                moduleCount++
            }
        }

        // Store committed results for preview
        committedResultsRef.current = { calculations: calcResults, modules: modOutputs }

        const elapsed = performance.now() - startTime
        console.log(`[UnifiedCalc] Evaluated ${calcCount} calculations and ${moduleCount} modules in ${elapsed.toFixed(0)}ms (single pass)`)

        return { calculationResults: calcResults, moduleOutputs: modOutputs, calculationErrors: errors }
    }, [calculations, modules, referenceMap, timeline, mRefMap])

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
