// Server-side calculation engine
// Replicates useUnifiedCalculation + useReferenceMap logic without React hooks
// Takes raw model JSON data, builds reference map, runs topological sort,
// evaluates all calculations and modules, returns complete results.

import { processArrayFunctions, evaluateSafeExpression, extractShiftTargets, evaluateClusterPeriodByPeriod } from './formulaEvaluator'
import { calculateModuleOutputs, MODULE_TEMPLATES } from './modules'

/**
 * Build timeline from model config
 */
function buildTimeline(config) {
    const { startYear, startMonth, endYear, endMonth } = config
    const periods = (endYear - startYear) * 12 + (endMonth - startMonth) + 1

    const year = []
    const month = []
    const periodLabels = []
    let cy = startYear, cm = startMonth

    for (let i = 0; i < periods; i++) {
        year.push(cy)
        month.push(cm)
        periodLabels.push(`${cy}-${String(cm).padStart(2, '0')}`)
        cm++
        if (cm > 12) { cm = 1; cy++ }
    }

    return { periods, year, month, periodLabels, startYear, startMonth, endYear, endMonth }
}

/**
 * Build the complete reference map from raw model data
 * Replicates useReferenceMap logic server-side
 */
function buildReferenceMap(inputs, timeline) {
    const refs = {}
    const config = inputs.config || {}
    const inputGlass = inputs.inputGlass || []
    const inputGlassGroups = inputs.inputGlassGroups || []
    const keyPeriods = inputs.keyPeriods || []
    const indices = inputs.indices || []
    const periods = timeline.periods

    // --- 1. Input Group References (V, S, C, L groups) ---
    const activeGroups = inputGlassGroups.filter(group =>
        inputGlass.some(input => input.groupId === group.id)
    )
    const modeIndices = { values: 0, series: 0, constant: 0, timing: 0, lookup: 0 }

    // Pre-compute timeline lookup for O(1) access
    const timelineLookup = new Map()
    for (let i = 0; i < periods; i++) {
        timelineLookup.set(`${timeline.year[i]}-${timeline.month[i]}`, i)
    }

    activeGroups.forEach(group => {
        const groupInputs = inputGlass.filter(input => input.groupId === group.id)

        let normalizedMode
        if (group.groupType === 'timing') normalizedMode = 'timing'
        else if (group.groupType === 'constant') normalizedMode = 'constant'
        else {
            const groupMode = group.entryMode || groupInputs[0]?.mode || 'values'
            if (groupMode === 'lookup' || groupMode === 'lookup2') normalizedMode = 'lookup'
            else normalizedMode = groupMode
        }

        modeIndices[normalizedMode]++
        const modePrefix = normalizedMode === 'timing' ? 'T' :
                          normalizedMode === 'series' ? 'S' :
                          normalizedMode === 'constant' ? 'C' :
                          normalizedMode === 'lookup' ? 'L' : 'V'
        const groupIndex = modeIndices[normalizedMode]
        const groupRef = `${modePrefix}${groupIndex}`

        // Build arrays for each input
        const inputArrays = {}
        groupInputs.forEach(input => {
            const arr = buildInputArray(input, group, config, keyPeriods, timeline, timelineLookup)
            inputArrays[input.id] = arr
        })

        // Group subtotal
        const subtotalArray = new Array(periods).fill(0)
        for (let i = 0; i < periods; i++) {
            Object.values(inputArrays).forEach(arr => { subtotalArray[i] += arr[i] || 0 })
        }
        refs[groupRef] = subtotalArray

        // Per-input refs (ID-based)
        groupInputs.forEach(input => {
            const inputNum = group.id === 100 ? input.id - 99 : input.id
            refs[`${groupRef}.${inputNum}`] = inputArrays[input.id]
        })
    })

    // --- 2. Flag References (F1, F1.Start, F1.End) ---
    keyPeriods.forEach(kp => {
        const flag = new Array(periods).fill(0)
        const flagStart = new Array(periods).fill(0)
        const flagEnd = new Array(periods).fill(0)

        const startTotal = kp.startYear * 12 + kp.startMonth
        const endTotal = kp.endYear * 12 + kp.endMonth
        let firstIdx = -1, lastIdx = -1

        for (let i = 0; i < periods; i++) {
            const periodTotal = timeline.year[i] * 12 + timeline.month[i]
            if (periodTotal >= startTotal && periodTotal <= endTotal) {
                flag[i] = 1
                if (firstIdx === -1) firstIdx = i
                lastIdx = i
            }
        }
        if (firstIdx >= 0) flagStart[firstIdx] = 1
        if (lastIdx >= 0) flagEnd[lastIdx] = 1

        refs[`F${kp.id}`] = flag
        refs[`F${kp.id}.Start`] = flagStart
        refs[`F${kp.id}.End`] = flagEnd
    })

    // --- 3. Indexation References (I1, I2) ---
    indices.forEach(idx => {
        const values = new Array(periods).fill(1)
        const annualRate = (idx.indexationRate || 0) / 100
        const baseYear = idx.indexationStartYear || config.startYear
        const baseMonth = idx.indexationStartMonth || 1

        for (let i = 0; i < periods; i++) {
            if (idx.indexationPeriod === 'annual') {
                const wholeYears = Math.floor(timeline.year[i] - baseYear + (timeline.month[i] - baseMonth) / 12)
                values[i] = Math.pow(1 + annualRate, Math.max(0, wholeYears))
            } else {
                const monthlyRate = Math.pow(1 + annualRate, 1/12) - 1
                const monthsFromBase = (timeline.year[i] - baseYear) * 12 + (timeline.month[i] - baseMonth)
                values[i] = Math.pow(1 + monthlyRate, Math.max(0, monthsFromBase))
            }
        }
        refs[`I${idx.id}`] = values
    })

    // --- 4. Time Constants ---
    const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate()
    const yearCache = new Map()
    const getYearData = (year) => {
        if (!yearCache.has(year)) {
            const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
            yearCache.set(year, { daysInYear: isLeap ? 366 : 365, hoursInYear: isLeap ? 8784 : 8760 })
        }
        return yearCache.get(year)
    }

    const diM = new Array(periods), diY = new Array(periods), hiM = new Array(periods)
    const hiY = new Array(periods), diQ = new Array(periods)
    const qe = new Array(periods), cye = new Array(periods), fye = new Array(periods)

    for (let i = 0; i < periods; i++) {
        const y = timeline.year[i], m = timeline.month[i]
        const yd = getYearData(y)
        const dim = getDaysInMonth(y, m)
        diM[i] = dim
        diY[i] = yd.daysInYear
        hiM[i] = dim * 24
        hiY[i] = yd.hoursInYear
        const quarter = Math.floor((m - 1) / 3)
        const sm = quarter * 3 + 1
        diQ[i] = getDaysInMonth(y, sm) + getDaysInMonth(y, sm + 1) + getDaysInMonth(y, sm + 2)
        qe[i] = (m === 3 || m === 6 || m === 9 || m === 12) ? 1 : 0
        cye[i] = m === 12 ? 1 : 0
        fye[i] = m === 6 ? 1 : 0
    }

    refs['T.DiM'] = diM
    refs['T.DiY'] = diY
    refs['T.HiM'] = hiM
    refs['T.HiY'] = hiY
    refs['T.DiQ'] = diQ
    refs['T.QE'] = qe
    refs['T.CYE'] = cye
    refs['T.FYE'] = fye
    refs['T.MiY'] = new Array(periods).fill(12)
    refs['T.QiY'] = new Array(periods).fill(4)
    refs['T.HiD'] = new Array(periods).fill(24)
    refs['T.MiQ'] = new Array(periods).fill(3)

    // --- 5. Lookup References ---
    let lookupIndex = 0
    inputGlassGroups
        .filter(g => g.entryMode === 'lookup' || g.entryMode === 'lookup2')
        .forEach(group => {
            lookupIndex++
            const groupInputs = inputGlass.filter(input => input.groupId === group.id)
            const lookupRef = `L${lookupIndex}`
            const selectedIndices = group.selectedIndices || {}
            const subgroups = group.subgroups || []
            const rootInputs = groupInputs.filter(inp => !inp.subgroupId)
            const hasActualSubgroups = subgroups.length > 0

            if (!hasActualSubgroups) {
                rootInputs.forEach((input, inputIdx) => {
                    const inputRef = `${lookupRef}.${inputIdx + 1}`
                    refs[inputRef] = buildInputArray(input, group, config, keyPeriods, timeline, timelineLookup)
                })
            } else {
                const subgroupedInputs = []
                if (rootInputs.length > 0) {
                    subgroupedInputs.push({ id: null, inputs: rootInputs })
                }
                subgroups.forEach(sg => {
                    const sgInputs = groupInputs.filter(inp => inp.subgroupId === sg.id)
                    subgroupedInputs.push({ id: sg.id, inputs: sgInputs })
                })

                subgroupedInputs.forEach((sg, sgIdx) => {
                    if (sg.inputs.length === 0) return
                    const key = sg.id ?? 'root'
                    const selectedIdx = selectedIndices[key] ?? 0
                    const selectedInput = sg.inputs[selectedIdx] || sg.inputs[0]
                    const subgroupRef = `${lookupRef}.${sgIdx + 1}`

                    if (selectedInput) {
                        refs[subgroupRef] = buildInputArray(selectedInput, group, config, keyPeriods, timeline, timelineLookup)
                    }
                    sg.inputs.forEach((input, inputIdx) => {
                        const optionRef = `${subgroupRef}.${inputIdx + 1}`
                        refs[optionRef] = buildInputArray(input, group, config, keyPeriods, timeline, timelineLookup)
                    })
                })
            }
        })

    return refs
}

/**
 * Build a single input's time-series array
 * Simplified version of useInputArrays inputGlassArrays logic
 */
function buildInputArray(input, group, config, keyPeriods, timeline, timelineLookup) {
    const periods = timeline.periods
    const isConstantMode = group.entryMode === 'constant'

    if (isConstantMode) {
        const value = input.value ?? 0
        return new Array(periods).fill(value)
    }

    // Determine group's date range (possibly from linked key period)
    let startYear = group.startYear || config.startYear
    let startMonth = group.startMonth || config.startMonth
    let groupPeriods = parseInt(group.periods) || periods

    if (group.linkedKeyPeriodId) {
        const linkedKp = keyPeriods.find(kp => String(kp.id) === String(group.linkedKeyPeriodId))
        if (linkedKp) {
            startYear = linkedKp.startYear
            startMonth = linkedKp.startMonth
            groupPeriods = linkedKp.periods || groupPeriods
        }
    }

    // Generate monthly values based on entry mode
    const monthlyValues = new Array(groupPeriods).fill(0)

    // Determine the effective frequency for spreading
    const freq = input.valueFrequency || input.seriesFrequency || input.timePeriod || group.frequency || 'M'

    if (input.entryMode === 'constant' || input.mode === 'constant') {
        const value = input.value ?? 0
        // Constant entry within a series group — spread by frequency
        if (freq === 'Q') {
            for (let i = 0; i < groupPeriods; i++) monthlyValues[i] = value / 3
        } else if (freq === 'Y' || freq === 'FY') {
            for (let i = 0; i < groupPeriods; i++) monthlyValues[i] = value / 12
        } else {
            monthlyValues.fill(value)
        }
    } else if (input.mode === 'series' && input.value != null && !input.values) {
        // Series mode with a constant value (e.g., OPEX: mode="series", value=0.7, timePeriod="Y")
        // Spread the annual/quarterly value to monthly across the group period
        const value = input.value
        if (freq === 'Q') {
            for (let i = 0; i < groupPeriods; i++) monthlyValues[i] = value / 3
        } else if (freq === 'Y' || freq === 'FY') {
            for (let i = 0; i < groupPeriods; i++) monthlyValues[i] = value / 12
        } else {
            monthlyValues.fill(value)
        }
    } else if (input.values) {
        // Sparse values object
        for (const [idx, val] of Object.entries(input.values)) {
            const i = parseInt(idx)
            if (i >= 0 && i < groupPeriods) monthlyValues[i] = val
        }
    }

    // Map to timeline
    const arr = new Array(periods).fill(0)
    let cy = startYear, cm = startMonth
    for (let i = 0; i < groupPeriods; i++) {
        const t = timelineLookup.get(`${cy}-${cm}`)
        if (t !== undefined) arr[t] = monthlyValues[i] || 0
        cm++
        if (cm > 12) { cm = 1; cy++ }
    }

    // Forward-fill for lookups
    const isLookupMode = group.entryMode === 'lookup' || group.entryMode === 'lookup2'
    if (isLookupMode) {
        let lastNonZero = 0
        for (let i = 0; i < periods; i++) {
            if (arr[i] !== 0) lastNonZero = arr[i]
            else arr[i] = lastNonZero
        }
    }

    return arr
}

// --- Dependency Graph & Topological Sort (mirrors useUnifiedCalculation) ---

function extractDependencies(formula) {
    if (!formula) return []
    const formulaWithoutShift = formula.replace(/(?:SHIFT\s*\([^)]+\)|PREVSUM\s*\([^)]+\)|PREVVAL\s*\([^)]+\))/gi, '')
    const deps = new Set()

    const rPattern = /\bR(\d+)(?!\d)/g
    let match
    while ((match = rPattern.exec(formulaWithoutShift)) !== null) deps.add(`R${match[1]}`)

    const mPattern = /\bM(\d+)\.(\d+)/g
    while ((match = mPattern.exec(formulaWithoutShift)) !== null) deps.add(`M${match[1]}`)

    return [...deps]
}

function extractModuleDependencies(mod, moduleIdx, allModulesCount) {
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

/**
 * Rewrite M-refs in a formula string using the _mRefMap.
 * Converts e.g. "M2.3" → "R9003" for converted modules.
 */
function rewriteMRefs(formula, mRefMapData) {
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

function buildUnifiedGraph(calculations, modules, mRefMapData) {
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

    // Only add non-converted modules as nodes
    if (modules) {
        modules.forEach((mod, idx) => {
            if (mod.converted || mod.fullyConverted) return
            const nodeId = `M${idx + 1}`
            graph.set(nodeId, { type: 'module', deps: new Set(extractModuleDependencies(mod, idx, modules.length)), item: mod, index: idx })
        })
    }

    // Filter invalid deps
    graph.forEach(node => {
        const validDeps = new Set()
        node.deps.forEach(dep => { if (graph.has(dep)) validDeps.add(dep) })
        node.deps = validDeps
    })

    return graph
}

function topologicalSort(graph) {
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
        graph.forEach((_, nodeId) => { if (!sorted.includes(nodeId)) sorted.push(nodeId) })
    }

    return sorted
}

function detectShiftCycles(graph, calculations) {
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
                if (merged[i].has(node)) { mergedInto = i; break }
            }
            if (mergedInto !== null) break
        }
        if (mergedInto !== null) {
            for (const node of nodeSet) merged[mergedInto].add(node)
        } else {
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

// Regex cache for ref substitution
const regexCache = new Map()
function getRegexCached(ref) {
    if (!regexCache.has(ref)) {
        regexCache.set(ref, new RegExp(`\\b${ref.replace(/\./g, '\\.')}\\b`, 'g'))
    }
    return regexCache.get(ref)
}

function evaluateSingleCalc(formula, context, timeline) {
    if (!formula || !formula.trim()) {
        return new Array(timeline.periods).fill(0)
    }

    try {
        const resultArray = new Array(timeline.periods).fill(0)
        const formulaWithoutShift = formula.replace(/(?:SHIFT\s*\([^)]+\)|PREVSUM\s*\([^)]+\)|PREVVAL\s*\([^)]+\))/gi, '')
        const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*(?:\.(?:Start|End))?|T\.[A-Za-z]+)\b/g
        const refsInFormula = [...new Set([...formulaWithoutShift.matchAll(refPattern)].map(m => m[1]))]

        const { processedFormula, arrayFnResults } = processArrayFunctions(formula, context, timeline)
        const sortedRefs = refsInFormula.sort((a, b) => b.length - a.length)
        const refArrays = sortedRefs.filter(ref => context[ref]).map(ref => ({ arr: context[ref], regex: getRegexCached(ref) }))
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
            // Replace any unresolved R-references with 0
            expr = expr.replace(/\bR\d+\b/g, '0')
            resultArray[i] = evaluateSafeExpression(expr)
        }

        return resultArray
    } catch {
        return new Array(timeline.periods).fill(0)
    }
}

/**
 * Run the complete model calculation server-side.
 * Returns { calculationResults, moduleOutputs, timeline, referenceMap }
 *
 * @param {Object} inputs - Raw model-inputs.json data
 * @param {Object} calculations - Raw model-calculations.json data
 */
export function runServerModel(inputs, calculations, options = {}) {
    const config = inputs.config || {}
    const timeline = buildTimeline(config)

    // Build reference map (V, S, C, F, I, T, L refs)
    const referenceMap = buildReferenceMap(inputs, timeline)

    // Get calculations and modules arrays
    const calcs = calculations.calculations || []
    const modules = calculations.modules || []
    const mRefMapData = calculations._mRefMap || {}

    // Build unified dependency graph (with M-ref rewriting for converted modules)
    const graph = buildUnifiedGraph(calcs, modules, mRefMapData)
    if (graph.size === 0) return { calculationResults: {}, moduleOutputs: {}, timeline, referenceMap }

    const { nodeToCluster, clusters, nonCyclicalShiftDeps } = detectShiftCycles(graph, calcs)

    // Add non-cyclical SHIFT targets as regular deps for proper evaluation ordering
    // (e.g., SHIFT(R9007, 1) in R9010 means R9007 must be evaluated before R9010)
    for (const { from, to } of nonCyclicalShiftDeps) {
        const node = graph.get(from)
        if (node) node.deps.add(to)
    }

    // Ensure non-cluster nodes that depend on cluster members also depend on ALL
    // members of that cluster. This ensures the topological sort places them after
    // the cluster's trigger point (the last member in sort order).
    if (clusters.size > 0) {
        const clusterMembers = new Map() // clusterId -> Set of member nodeIds
        clusters.forEach((cluster, cId) => {
            clusterMembers.set(cId, new Set(cluster.members.map(c => `R${c.id}`)))
        })

        graph.forEach((node, nodeId) => {
            if (nodeToCluster.has(nodeId)) return // skip cluster members
            const clusterDeps = new Set()
            node.deps.forEach(dep => {
                const cId = nodeToCluster.get(dep)
                if (cId !== undefined && !clusterDeps.has(cId)) {
                    clusterDeps.add(cId)
                    // Add all cluster members as deps so this node sorts after the whole cluster
                    clusterMembers.get(cId)?.forEach(memberId => node.deps.add(memberId))
                }
            })
        })
    }

    // Sort after augmenting deps
    const sortedNodes = topologicalSort(graph)

    // Debug: log cluster info
    if (options.debug) {
        console.log(`[DEBUG] Clusters: ${clusters.size}, NonCyclicalShiftDeps: ${nonCyclicalShiftDeps.length}`)
        clusters.forEach((cluster, id) => {
            console.log(`  Cluster ${id}: ${cluster.members.map(c => 'R'+c.id).join(', ')}`)
        })
        for (const { from, to } of nonCyclicalShiftDeps) {
            console.log(`  NonCyclical: ${from} → ${to}`)
        }
    }

    // Set internal order for clusters
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
    }

    // Build context
    const context = { ...referenceMap, timeline }
    const calcResults = {}
    const modOutputs = {}
    const evaluatedClusters = new Set()

    // Pre-compute: for each cluster, find the LAST member in topological order
    // This ensures all external deps of all members are satisfied before cluster evaluation
    const clusterLastNodePos = new Map() // clusterId -> position of last member in sortedNodes
    sortedNodes.forEach((nodeId, pos) => {
        const clusterId = nodeToCluster.get(nodeId)
        if (clusterId !== undefined) {
            clusterLastNodePos.set(clusterId, pos)
        }
    })
    const clusterTriggerPos = new Map() // position -> clusterId to evaluate at that position
    clusterLastNodePos.forEach((pos, clusterId) => {
        clusterTriggerPos.set(pos, clusterId)
    })

    // Evaluate in topological order
    for (let nodeIdx = 0; nodeIdx < sortedNodes.length; nodeIdx++) {
        const nodeId = sortedNodes[nodeIdx]
        const node = graph.get(nodeId)
        if (!node) continue

        const clusterId = nodeToCluster.get(nodeId)

        // For cluster members, skip individual evaluation - handled when cluster triggers
        if (clusterId !== undefined) {
            // Check if this is the LAST member of the cluster in sort order
            const triggerClusterId = clusterTriggerPos.get(nodeIdx)
            if (triggerClusterId === undefined || evaluatedClusters.has(triggerClusterId)) continue
            evaluatedClusters.add(triggerClusterId)

            const cluster = clusters.get(triggerClusterId)
            if (options.debug) {
                console.log(`[DEBUG] Evaluating cluster ${triggerClusterId}: order=${cluster.internalOrder.join(',')}, members=${cluster.members.map(c=>'R'+c.id+'='+c.formula).join(' | ')}`)
                // Show external dep values for cluster 0 (D&A)
                if (triggerClusterId === 0) {
                    const r9002 = context['R9002']
                    const r203 = context['R203']
                    const c124 = context['C1.24']
                    const f2 = context['F2']
                    console.log(`[DEBUG]   R9002 in context: ${!!r9002}, first non-zero: ${r9002 ? r9002.findIndex(v=>v!==0) : 'N/A'}, val[18]: ${r9002?.[18]}`)
                    console.log(`[DEBUG]   R203 in context: ${!!r203}, first non-zero: ${r203 ? r203.findIndex(v=>v!==0) : 'N/A'}, val[0..5]: ${r203?.slice(0,6).map(v=>v.toFixed(2)).join(',')}`)
                    console.log(`[DEBUG]   R203 sum 0-18: ${r203?.slice(0,19).reduce((a,b)=>a+b,0).toFixed(4)}`)
                    console.log(`[DEBUG]   C1.24 in context: ${!!c124}, val[0]: ${c124?.[0]}`)
                    console.log(`[DEBUG]   F2 in context: ${!!f2}, first non-zero: ${f2 ? f2.findIndex(v=>v!==0) : 'N/A'}`)
                    // Check R9022 (equity_drawdown, M4.8)
                    const r9022 = context['R9022']
                    console.log(`[DEBUG]   R9022 in context: ${!!r9022}, first non-zero: ${r9022 ? r9022.findIndex(v=>v!==0) : 'N/A'}, val[0..5]: ${r9022?.slice(0,6).map(v=>v.toFixed(2)).join(',')}`)
                    const v1 = context['V1']
                    console.log(`[DEBUG]   V1 in context: ${!!v1}, first non-zero: ${v1 ? v1.findIndex(v=>v!==0) : 'N/A'}, val[0..5]: ${v1?.slice(0,6).map(v=>v.toFixed(2)).join(',')}`)
                }
            }
            const clusterResults = evaluateClusterPeriodByPeriod(
                cluster.members, cluster.internalOrder, context, timeline
            )
            Object.entries(clusterResults).forEach(([id, values]) => {
                calcResults[id] = values
                context[id] = values
                if (options.debug && id.startsWith('R900')) {
                    const nonZeroIdx = values.findIndex(v => v !== 0)
                    console.log(`[DEBUG]   ${id}: first non-zero at period ${nonZeroIdx}, max=${Math.max(...values).toFixed(2)}`)
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
            const formula = node.item._rewrittenFormula || node.item.formula
            const values = evaluateSingleCalc(formula, context, timeline)
            calcResults[nodeId] = values
            context[nodeId] = values

            // Debug specific calcs - add to debugInfo for API return
            if (options.debug && ['R9041', 'R9039', 'R9040'].includes(nodeId)) {
                const nonZero = values.findIndex(v => v !== 0)
                const v18 = values[18]
                const ctxR9039 = context['R9039']
                if (!options._evalDebug) options._evalDebug = {}
                options._evalDebug[nodeId] = {
                    formula,
                    rewritten: node.item._rewrittenFormula || 'same',
                    nonZeroAt: nonZero,
                    v18,
                    ctxR9039_exists: !!ctxR9039,
                    ctxR9039_p18: ctxR9039?.[18],
                    evalOrder: nodeIdx,
                    isCluster: nodeToCluster.has(nodeId),
                    clusterId: nodeToCluster.get(nodeId),
                }
            }

            // Populate M-ref context aliases for converted module outputs
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

            const isDisabled = mod.enabled === false
            if (isDisabled) {
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
        }
    }

    // Build sorted node metadata for the Excel export (interleaved calcs + modules)
    const calcById = new Map()
    calcs.forEach(c => calcById.set(`R${c.id}`, c))

    const sortedNodeMeta = []
    const seenClusters = new Set()
    for (const nodeId of sortedNodes) {
        const node = graph.get(nodeId)
        if (!node) continue

        const clusterId = nodeToCluster.get(nodeId)
        if (clusterId !== undefined) {
            if (seenClusters.has(clusterId)) continue
            seenClusters.add(clusterId)
            // Emit all cluster members in their internal order
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

            // Build resolved formulas: substitute {inputKey} placeholders with configured values
            const resolvedFormulas = {}
            if (template.outputFormulas) {
                for (const [outputKey, templateFormula] of Object.entries(template.outputFormulas)) {
                    let formula = templateFormula
                    // Replace {inputKey} with configured values
                    for (const [inputKey, inputValue] of Object.entries(moduleInputs)) {
                        formula = formula.replace(new RegExp(`\\{${inputKey}\\}`, 'g'), String(inputValue))
                    }
                    // Replace remaining placeholders with defaults
                    if (template.inputs) {
                        for (const inp of template.inputs) {
                            formula = formula.replace(new RegExp(`\\{${inp.key}\\}`, 'g'), String(inp.default || inp.key))
                        }
                    }
                    resolvedFormulas[outputKey] = formula
                }
                // Resolve internal output refs (e.g., "depreciation" → "M2.3")
                // Must do a second pass since formulas can reference other outputs by key
                const outputKeyToRef = {}
                template.outputs.forEach((out, idx) => { outputKeyToRef[out.key] = `M${moduleNum}.${idx + 1}` })

                for (const outputKey of Object.keys(resolvedFormulas)) {
                    let formula = resolvedFormulas[outputKey]
                    // Replace output keys with M-refs (longest first to avoid partial matches)
                    const sortedKeys = Object.keys(outputKeyToRef).sort((a, b) => b.length - a.length)
                    for (const key of sortedKeys) {
                        formula = formula.replace(new RegExp(`\\b${key}\\b`, 'g'), outputKeyToRef[key])
                    }
                    // Clean up display chars: × → *
                    formula = formula.replace(/×/g, '*')
                    resolvedFormulas[outputKey] = formula
                }
            }

            // Emit one entry per remaining module output (solver/helper outputs)
            // These are static values since they can't be expressed as formulas
            // (e.g., binary search result, forward-looking sums, step functions)
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

    return { calculationResults: calcResults, moduleOutputs: modOutputs, timeline, referenceMap, sortedNodeMeta, clusterDebug, evalDebug: options._evalDebug || {} }
}
