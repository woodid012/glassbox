// Server-side calculation engine
// Builds timeline + reference map from raw model JSON, then delegates
// evaluation to the shared calculationCore.js.

import { runCalculationPass } from './calculationCore'
import { getGroupRef } from './groupRefResolver'

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
    // Pre-compute timeline lookup for O(1) access
    const timelineLookup = new Map()
    for (let i = 0; i < periods; i++) {
        timelineLookup.set(`${timeline.year[i]}-${timeline.month[i]}`, i)
    }

    activeGroups.forEach(group => {
        const groupInputs = inputGlass.filter(input => input.groupId === group.id)
        const groupRef = getGroupRef(group, groupInputs)
        if (!groupRef) return

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
    inputGlassGroups
        .filter(g => g.entryMode === 'lookup' || g.entryMode === 'lookup2')
        .forEach(group => {
            const groupInputs = inputGlass.filter(input => input.groupId === group.id)
            const lookupRef = getGroupRef(group, groupInputs)
            if (!lookupRef) return
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

/**
 * Run the complete model calculation server-side.
 * Returns { calculationResults, moduleOutputs, timeline, referenceMap, sortedNodeMeta, clusterDebug, evalDebug }
 *
 * @param {Object} inputs - Raw model-inputs.json data
 * @param {Object} calculations - Raw model-calculations.json data
 * @param {Object} options - { debug, _evalDebug }
 */
export function runServerModel(inputs, calculations, options = {}) {
    const config = inputs.config || {}
    const timeline = buildTimeline(config)
    const referenceMap = buildReferenceMap(inputs, timeline)

    const result = runCalculationPass(
        calculations.calculations || [],
        calculations.modules || [],
        referenceMap,
        timeline,
        calculations._mRefMap || {},
        options
    )

    return { ...result, timeline, referenceMap }
}
