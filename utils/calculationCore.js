// Shared calculation core — single source of truth for dependency graph,
// topological sort, SHIFT cycle detection, formula evaluation, and the
// full calculation pass. Imported by both the server engine
// (serverModelEngine.js) and the client hook (useUnifiedCalculation.js).

import { processArrayFunctions, evaluateSafeExpression, extractShiftTargets, evaluateClusterPeriodByPeriod } from './formulaEvaluator'
import { calculateModuleOutputs, MODULE_TEMPLATES } from './modules'

// ── Regex cache (shared across all callers) ──────────────────────────

const regexCache = new Map()

export function getRegexCached(ref) {
    if (!regexCache.has(ref)) {
        regexCache.set(ref, new RegExp(`\\b${ref.replace(/\./g, '\\.')}\\b`, 'g'))
    }
    return regexCache.get(ref)
}

// ── Dependency extraction ────────────────────────────────────────────

/**
 * Extract dependencies from a formula string.
 * Returns array of R-refs and M-refs (module-level, e.g. "M1").
 */
export function extractDependencies(formula) {
    if (!formula) return []

    // Remove SHIFT/PREVSUM/PREVVAL — these are lagged deps (prior period)
    // and don't create true cycles in the dependency graph
    const formulaWithoutShift = formula.replace(/(?:SHIFT\s*\([^)]+\)|PREVSUM\s*\([^)]+\)|PREVVAL\s*\([^)]+\))/gi, '')

    const deps = new Set()

    const rPattern = /\bR(\d+)(?!\d)/g
    let match
    while ((match = rPattern.exec(formulaWithoutShift)) !== null) deps.add(`R${match[1]}`)

    const mPattern = /\bM(\d+)\.(\d+)/g
    while ((match = mPattern.exec(formulaWithoutShift)) !== null) deps.add(`M${match[1]}`)

    return [...deps]
}

/**
 * Extract dependencies from module inputs.
 * Modules reference calculations via their input values (e.g. "R17", "R70").
 */
export function extractModuleDependencies(mod, moduleIdx, allModulesCount) {
    const deps = new Set()
    const moduleInputs = mod.inputs || {}

    Object.values(moduleInputs).forEach(value => {
        if (typeof value === 'string') {
            const rPattern = /\bR(\d+)(?!\d)/g
            let match
            while ((match = rPattern.exec(value)) !== null) deps.add(`R${match[1]}`)

            const mPattern = /\bM(\d+)\.(\d+)/g
            while ((match = mPattern.exec(value)) !== null) {
                const depModuleIdx = parseInt(match[1], 10) - 1
                if (depModuleIdx !== moduleIdx && depModuleIdx >= 0 && depModuleIdx < allModulesCount) {
                    deps.add(`M${match[1]}`)
                }
            }
        }
    })
    return [...deps]
}

// ── M-ref rewriting ──────────────────────────────────────────────────

/**
 * Rewrite M-refs in a formula string using the _mRefMap.
 * Converts e.g. "M2.3" → "R9003" for converted modules.
 * Unconverted M-refs (e.g., M1.x for iterative_debt_sizing) are left as-is.
 */
export function rewriteMRefs(formula, mRefMapData) {
    if (!formula || !mRefMapData) return formula
    const sortedEntries = Object.entries(mRefMapData).sort((a, b) => b[0].length - a[0].length)
    let result = formula
    for (const [mRef, rRef] of sortedEntries) {
        const regex = getRegexCached(mRef)
        regex.lastIndex = 0
        result = result.replace(regex, rRef)
    }
    return result
}

// ── Unified dependency graph ─────────────────────────────────────────

/**
 * Build unified dependency graph of calculations AND modules.
 * For converted modules, M-refs in formulas are rewritten to R-refs.
 * Converted module nodes are excluded from the graph.
 */
export function buildUnifiedGraph(calculations, modules, mRefMapData) {
    const graph = new Map()

    if (calculations) {
        calculations.forEach(calc => {
            const nodeId = `R${calc.id}`
            const rewrittenFormula = rewriteMRefs(calc.formula, mRefMapData)
            graph.set(nodeId, {
                type: 'calc',
                deps: new Set(extractDependencies(rewrittenFormula)),
                item: { ...calc, _rewrittenFormula: rewrittenFormula }
            })
        })
    }

    // Only add iterative-solver modules as graph nodes (all others are fully converted to R9000+ calcs)
    if (modules) {
        modules.forEach((mod, idx) => {
            if (mod.templateId !== 'iterative_debt_sizing') return
            const nodeId = `M${idx + 1}`
            graph.set(nodeId, {
                type: 'module',
                deps: new Set(extractModuleDependencies(mod, idx, modules.length)),
                item: mod,
                index: idx
            })
        })
    }

    // Filter out deps that don't exist in the graph
    graph.forEach(node => {
        const validDeps = new Set()
        node.deps.forEach(dep => { if (graph.has(dep)) validDeps.add(dep) })
        node.deps = validDeps
    })

    return graph
}

// ── Topological sort (Kahn's algorithm) ──────────────────────────────

export function topologicalSort(graph) {
    const sorted = []
    const inDegree = new Map()
    const dependentsOf = new Map()

    graph.forEach((_, nodeId) => {
        inDegree.set(nodeId, 0)
        dependentsOf.set(nodeId, new Set())
    })

    graph.forEach((node, nodeId) => {
        node.deps.forEach(dep => {
            if (graph.has(dep)) {
                inDegree.set(nodeId, inDegree.get(nodeId) + 1)
                dependentsOf.get(dep).add(nodeId)
            }
        })
    })

    const queue = []
    graph.forEach((_, nodeId) => { if (inDegree.get(nodeId) === 0) queue.push(nodeId) })

    while (queue.length > 0) {
        const nodeId = queue.shift()
        sorted.push(nodeId)
        dependentsOf.get(nodeId).forEach(dependent => {
            const nd = inDegree.get(dependent) - 1
            inDegree.set(dependent, nd)
            if (nd === 0) queue.push(dependent)
        })
    }

    if (sorted.length !== graph.size) {
        const inCycle = []
        graph.forEach((_, nodeId) => { if (!sorted.includes(nodeId)) inCycle.push(nodeId) })
        console.warn(`[CalcCore] Circular dependency detected: ${inCycle.join(', ')}`)
        inCycle.forEach(nodeId => sorted.push(nodeId))
    }

    return sorted
}

// ── SHIFT cycle detection ────────────────────────────────────────────

export function detectShiftCycles(graph, calculations) {
    const nodeToCluster = new Map()
    const clusters = new Map()
    let nextClusterId = 0
    if (!calculations) return { nodeToCluster, clusters, nonCyclicalShiftDeps: [] }

    const forwardAdj = new Map()
    graph.forEach((node, nodeId) => forwardAdj.set(nodeId, node.deps))

    function isReachable(startId, targetId) {
        if (startId === targetId) return true
        const visited = new Set([startId])
        const queue = [startId]
        while (queue.length > 0) {
            const current = queue.shift()
            const deps = forwardAdj.get(current)
            if (!deps) continue
            for (const dep of deps) {
                if (dep === targetId) return true
                if (!visited.has(dep)) { visited.add(dep); queue.push(dep) }
            }
        }
        return false
    }

    const allCycleNodeSets = []
    calculations.forEach(calc => {
        const nodeId = `R${calc.id}`
        const shiftTargets = extractShiftTargets(calc.formula)
        for (const target of shiftTargets) {
            if (!graph.has(target)) continue
            if (isReachable(target, nodeId)) {
                const cycleNodes = new Set([nodeId, target])
                graph.forEach((_, nid) => {
                    if (nid.startsWith('R') && isReachable(target, nid) && isReachable(nid, nodeId)) {
                        cycleNodes.add(nid)
                    }
                })
                allCycleNodeSets.push(cycleNodes)
            }
        }
    })

    if (allCycleNodeSets.length === 0) {
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

    // Merge overlapping sets (union-find style: merge ALL overlapping clusters)
    const merged = []
    for (const nodeSet of allCycleNodeSets) {
        let mergedInto = null
        for (let i = 0; i < merged.length; i++) {
            let overlaps = false
            for (const node of nodeSet) {
                if (merged[i].has(node)) { overlaps = true; break }
            }
            if (overlaps) {
                if (mergedInto === null) {
                    // First overlap: merge into this set
                    mergedInto = i
                    for (const node of nodeSet) merged[mergedInto].add(node)
                } else {
                    // Additional overlap: merge this cluster into the first one
                    for (const node of merged[i]) merged[mergedInto].add(node)
                    merged.splice(i, 1)
                    if (i < mergedInto) mergedInto--
                    i-- // re-check at this index since we spliced
                }
            }
        }
        if (mergedInto === null) {
            merged.push(new Set(nodeSet))
        }
    }

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
        clusters.set(clusterId, { members, internalOrder: [] })
    }

    // Collect non-cyclical SHIFT deps
    const nonCyclicalShiftDeps = []
    calculations.forEach(calc => {
        const nodeId = `R${calc.id}`
        const shiftTargets = extractShiftTargets(calc.formula)
        for (const target of shiftTargets) {
            if (!graph.has(target)) continue
            if (target === nodeId) continue
            if (nodeToCluster.has(nodeId) && nodeToCluster.has(target) &&
                nodeToCluster.get(nodeId) === nodeToCluster.get(target)) continue
            if (!isReachable(target, nodeId)) {
                nonCyclicalShiftDeps.push({ from: nodeId, to: target })
            }
        }
    })

    return { nodeToCluster, clusters, nonCyclicalShiftDeps }
}

// ── Single formula evaluation ────────────────────────────────────────

/**
 * Evaluate a single formula across all periods.
 * Returns { values: number[], error: string|null }.
 * Missing refs are zero-filled in context for robustness.
 */
export function evaluateSingleCalc(formula, context, timeline) {
    if (!formula || !formula.trim()) {
        return { values: new Array(timeline.periods).fill(0), error: null }
    }

    try {
        const resultArray = new Array(timeline.periods).fill(0)

        const formulaWithoutShift = formula.replace(/(?:SHIFT\s*\([^)]+\)|PREVSUM\s*\([^)]+\)|PREVVAL\s*\([^)]+\))/gi, '')
        const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*(?:\.(?:Start|End|M|Q|Y))?|T\.[A-Za-z]+)\b/g
        const refsInFormula = [...new Set([...formulaWithoutShift.matchAll(refPattern)].map(m => m[1]))]

        // Zero-fill missing refs in context (client-style robustness)
        for (const ref of refsInFormula) {
            if (!context[ref]) {
                context[ref] = new Array(timeline.periods).fill(0)
            }
        }

        const { processedFormula, arrayFnResults } = processArrayFunctions(formula, context, timeline)

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
            // Replace any remaining unresolved references with 0
            expr = expr.replace(/\b(?:[VSCTIFLRM]\d+(?:\.\d+)*(?:\.(?:Start|End|M|Q|Y))?|T\.[A-Za-z]+)\b/g, '0')
            resultArray[i] = evaluateSafeExpression(expr)
        }

        return { values: resultArray, error: null }
    } catch (e) {
        return { values: new Array(timeline.periods).fill(0), error: e.message }
    }
}

// ── Full calculation pass ────────────────────────────────────────────

/**
 * Run a complete calculation pass: build graph, detect cycles, topo-sort,
 * evaluate all calcs and modules in order.
 *
 * @param {Object[]} calculations - Array of calculation objects
 * @param {Object[]} modules - Array of module objects
 * @param {Object} referenceMap - Pre-built reference map (V, S, C, F, I, T, L refs)
 * @param {Object} timeline - { periods, year, month, periodLabels, ... }
 * @param {Object} mRefMap - _mRefMap from model-calculations.json
 * @param {Object} options - { debug, _evalDebug }
 * @returns {{ calculationResults, moduleOutputs, calculationErrors, sortedNodeMeta, clusterDebug, evalDebug }}
 */
export function runCalculationPass(calculations, modules, referenceMap, timeline, mRefMap, options = {}) {
    const calcResults = {}
    const modOutputs = {}
    const errors = {}
    const mRefMapData = mRefMap || {}

    // Build unified dependency graph (with M-ref rewriting for converted modules)
    const graph = buildUnifiedGraph(calculations, modules, mRefMapData)

    if (graph.size === 0) {
        return { calculationResults: calcResults, moduleOutputs: modOutputs, calculationErrors: errors, sortedNodeMeta: [], clusterDebug: [], evalDebug: {} }
    }

    const { nodeToCluster, clusters, nonCyclicalShiftDeps } = detectShiftCycles(graph, calculations)

    // Add non-cyclical SHIFT targets as regular deps for proper evaluation ordering
    for (const { from, to } of nonCyclicalShiftDeps) {
        const node = graph.get(from)
        if (node) node.deps.add(to)
    }

    // Ensure non-cluster nodes that depend on cluster members also depend on ALL
    // members of that cluster, so topo-sort places them after the cluster trigger
    if (clusters.size > 0) {
        const clusterMembers = new Map()
        clusters.forEach((cluster, cId) => {
            clusterMembers.set(cId, new Set(cluster.members.map(c => `R${c.id}`)))
        })

        graph.forEach((node, nodeId) => {
            if (nodeToCluster.has(nodeId)) return
            const clusterDeps = new Set()
            node.deps.forEach(dep => {
                const cId = nodeToCluster.get(dep)
                if (cId !== undefined && !clusterDeps.has(cId)) {
                    clusterDeps.add(cId)
                    clusterMembers.get(cId)?.forEach(memberId => node.deps.add(memberId))
                }
            })
        })
    }

    // Sort after augmenting deps
    const sortedNodes = topologicalSort(graph)

    // Debug logging
    if (options.debug) {
        console.log(`[CalcCore] Clusters: ${clusters.size}, NonCyclicalShiftDeps: ${nonCyclicalShiftDeps.length}`)
        clusters.forEach((cluster, id) => {
            console.log(`  Cluster ${id}: ${cluster.members.map(c => 'R'+c.id).join(', ')}`)
        })
        for (const { from, to } of nonCyclicalShiftDeps) {
            console.log(`  NonCyclical: ${from} → ${to}`)
        }
    }

    // Set internal order for clusters + rewrite M-refs in cluster member formulas
    if (clusters.size > 0) {
        const nodePosition = new Map()
        sortedNodes.forEach((id, idx) => nodePosition.set(id, idx))

        clusters.forEach(cluster => {
            cluster.internalOrder = cluster.members
                .map(c => `R${c.id}`)
                .sort((a, b) => (nodePosition.get(a) ?? 0) - (nodePosition.get(b) ?? 0))

            cluster.members = cluster.members.map(c => {
                const graphNode = graph.get(`R${c.id}`)
                const rewritten = graphNode?.item?._rewrittenFormula
                if (rewritten && rewritten !== c.formula) {
                    return { ...c, formula: rewritten }
                }
                return c
            })
        })
    }

    // Build context
    const context = { ...referenceMap, timeline }
    const evaluatedClusters = new Set()

    // Pre-compute cluster trigger positions (last member in topo order)
    const clusterLastNodePos = new Map()
    sortedNodes.forEach((nodeId, pos) => {
        const cId = nodeToCluster.get(nodeId)
        if (cId !== undefined) clusterLastNodePos.set(cId, pos)
    })
    const clusterTriggerPos = new Map()
    clusterLastNodePos.forEach((pos, cId) => clusterTriggerPos.set(pos, cId))

    // Evaluate in topological order
    for (let nodeIdx = 0; nodeIdx < sortedNodes.length; nodeIdx++) {
        const nodeId = sortedNodes[nodeIdx]
        const node = graph.get(nodeId)
        if (!node) continue

        const clusterId = nodeToCluster.get(nodeId)

        if (clusterId !== undefined) {
            // Cluster member — only trigger at the last member position
            const triggerClusterId = clusterTriggerPos.get(nodeIdx)
            if (triggerClusterId === undefined || evaluatedClusters.has(triggerClusterId)) continue
            evaluatedClusters.add(triggerClusterId)

            const cluster = clusters.get(triggerClusterId)
            if (options.debug) {
                console.log(`[CalcCore] Evaluating cluster ${triggerClusterId}: order=${cluster.internalOrder.join(',')}, members=${cluster.members.map(c=>'R'+c.id+'='+c.formula).join(' | ')}`)
            }
            const clusterResults = evaluateClusterPeriodByPeriod(
                cluster.members, cluster.internalOrder, context, timeline
            )
            Object.entries(clusterResults).forEach(([id, values]) => {
                calcResults[id] = values
                context[id] = values
                if (options.debug && id.startsWith('R900')) {
                    const nonZeroIdx = values.findIndex(v => v !== 0)
                    console.log(`[CalcCore]   ${id}: first non-zero at period ${nonZeroIdx}, max=${Math.max(...values).toFixed(2)}`)
                }
                // Populate M-ref context aliases for converted module outputs in clusters
                for (const [mRef, rRef] of Object.entries(mRefMapData)) {
                    if (rRef === id) {
                        context[mRef] = values
                        modOutputs[mRef] = values
                    }
                }
            })
        } else if (node.type === 'calc') {
            let values
            const formula = node.item._rewrittenFormula || node.item.formula
            const result = evaluateSingleCalc(formula, context, timeline)
            values = result.values
            if (result.error) errors[nodeId] = result.error
            calcResults[nodeId] = values
            context[nodeId] = values

            // Populate M-ref aliases for converted module outputs
            for (const [mRef, rRef] of Object.entries(mRefMapData)) {
                if (rRef === nodeId) {
                    context[mRef] = values
                    modOutputs[mRef] = values
                }
            }
        } else if (node.type === 'module') {
            const mod = node.item
            const templateKey = mod.templateId
            const template = MODULE_TEMPLATES[templateKey]
            if (!template) continue

            // Skip disabled modules
            if (mod.enabled === false) {
                template.outputs.forEach((output, outputIdx) => {
                    const ref = `M${node.index + 1}.${outputIdx + 1}`
                    modOutputs[ref] = new Array(timeline.periods).fill(0)
                    context[ref] = modOutputs[ref]
                })
                continue
            }

            const moduleInstance = { moduleType: templateKey, inputs: mod.inputs || {} }
            const calculatedOutputs = calculateModuleOutputs(moduleInstance, timeline.periods, context)

            template.outputs.forEach((output, outputIdx) => {
                const ref = `M${node.index + 1}.${outputIdx + 1}`
                const outputValues = calculatedOutputs[output.key] || new Array(timeline.periods).fill(0)
                modOutputs[ref] = outputValues
                context[ref] = outputValues
            })
            // Preserve solver log metadata if present
            if (calculatedOutputs._solverLog) {
                modOutputs[`_solverLog_M${node.index + 1}`] = calculatedOutputs._solverLog
            }
        }
    }

    // Build sorted node metadata (for Excel export — always built)
    const calcById = new Map()
    calculations.forEach(c => calcById.set(`R${c.id}`, c))

    const sortedNodeMeta = []
    const seenClusters = new Set()
    for (const nodeId of sortedNodes) {
        const node = graph.get(nodeId)
        if (!node) continue

        const clusterId = nodeToCluster.get(nodeId)
        if (clusterId !== undefined) {
            if (seenClusters.has(clusterId)) continue
            seenClusters.add(clusterId)
            const cluster = clusters.get(clusterId)
            for (const memberId of cluster.internalOrder) {
                const c = calcById.get(memberId)
                if (c) {
                    const rewrittenFormula = rewriteMRefs(c.formula, mRefMapData)
                    sortedNodeMeta.push({ type: 'calc', ref: memberId, name: c.name, formula: rewrittenFormula || '0' })
                }
            }
        } else if (node.type === 'calc') {
            const rewrittenFormula = node.item._rewrittenFormula || node.item.formula
            sortedNodeMeta.push({ type: 'calc', ref: nodeId, name: node.item.name, formula: rewrittenFormula || '0' })
        } else if (node.type === 'module') {
            const mod = node.item
            const template = MODULE_TEMPLATES[mod.templateId]
            if (!template) continue
            const moduleNum = node.index + 1
            const moduleInputs = mod.inputs || {}

            // Build resolved formulas: substitute {inputKey} placeholders
            const resolvedFormulas = {}
            if (template.outputFormulas) {
                for (const [outputKey, templateFormula] of Object.entries(template.outputFormulas)) {
                    let formula = templateFormula
                    for (const [inputKey, inputValue] of Object.entries(moduleInputs)) {
                        formula = formula.replace(new RegExp(`\\{${inputKey}\\}`, 'g'), String(inputValue))
                    }
                    if (template.inputs) {
                        for (const inp of template.inputs) {
                            formula = formula.replace(new RegExp(`\\{${inp.key}\\}`, 'g'), String(inp.default || inp.key))
                        }
                    }
                    resolvedFormulas[outputKey] = formula
                }
                // Resolve internal output refs
                const outputKeyToRef = {}
                template.outputs.forEach((out, idx) => { outputKeyToRef[out.key] = `M${moduleNum}.${idx + 1}` })

                for (const outputKey of Object.keys(resolvedFormulas)) {
                    let formula = resolvedFormulas[outputKey]
                    const sortedKeys = Object.keys(outputKeyToRef).sort((a, b) => b.length - a.length)
                    for (const key of sortedKeys) {
                        formula = formula.replace(new RegExp(`\\b${key}\\b`, 'g'), outputKeyToRef[key])
                    }
                    formula = formula.replace(/×/g, '*')
                    resolvedFormulas[outputKey] = formula
                }
            }

            template.outputs.forEach((output, outputIdx) => {
                const ref = `M${moduleNum}.${outputIdx + 1}`
                const outputObj = typeof output === 'string' ? { key: output, label: output } : output
                const isSolverOutput = outputObj.isSolver || template.partiallyConverted
                const formula = isSolverOutput ? null : (resolvedFormulas[outputObj.key] || null)
                sortedNodeMeta.push({
                    type: 'module',
                    ref,
                    name: `${mod.name}: ${outputObj.label}`,
                    formula,
                    moduleName: mod.name,
                    outputLabel: outputObj.label,
                    outputType: outputObj.type,
                    isSolver: !!isSolverOutput
                })
            })
        }
    }

    // Build cluster debug info
    const clusterDebug = []
    clusters.forEach((cluster, id) => {
        clusterDebug.push({
            id,
            members: cluster.members.map(c => `R${c.id}`),
            internalOrder: cluster.internalOrder
        })
    })

    return {
        calculationResults: calcResults,
        moduleOutputs: modOutputs,
        calculationErrors: errors,
        sortedNodeMeta,
        clusterDebug,
        evalDebug: options._evalDebug || {}
    }
}
