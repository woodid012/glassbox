'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import * as helpers from '../../../utils/timeArrayHelpers'
import { getDefaultState } from '../../../utils/glassInputsState'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useInputManagement } from '@/hooks/useInputManagement'
import { useInputArrays } from '@/hooks/useInputArrays'
import { calculateModuleOutputs, MODULE_TEMPLATES } from '@/utils/moduleTemplates'
import { processArrayFunctions, evaluateSafeExpression, getCachedRegex } from '@/utils/formulaEvaluator'

export function useDashboardState(viewMode) {
    // Single state object - all state in one place for easy save/load
    const [appState, setAppState] = useState(() => getDefaultState())

    // Array View sub-tab state
    const [arrayViewSubTab, setArrayViewSubTab] = useState('inputs') // 'inputs' | 'modules' | 'results'

    // Destructure state for easier access
    const {
        config,
        showConfig,
        showKeyPeriods,
        showInputs,
        showIndices,
        showNominal,
        showTimeseries,
        showCalculations,
        keyPeriods,
        inputType1,
        inputGlass,
        indices,
        inputType1Groups,
        inputGlassGroups,
        collapsedInputType1Groups,
        collapsedInputGlassGroups,
        collapsedKeyPeriodGroups,
        modules,
        moduleTemplates,
        calculations,
        calculationsTabs,
        calculationsGroups,
        collapsedCalculationsGroups,
        groups,
        collapsedGroups,
        inputs
    } = appState

    // Helper setter functions - maintain same API as before
    const setConfig = useCallback((newConfig) => {
        setAppState(prev => ({ ...prev, config: typeof newConfig === 'function' ? newConfig(prev.config) : newConfig }))
    }, [])
    const setShowConfig = useCallback((show) => {
        setAppState(prev => ({ ...prev, showConfig: typeof show === 'function' ? show(prev.showConfig) : show }))
    }, [])
    const setShowKeyPeriods = useCallback((show) => {
        setAppState(prev => ({ ...prev, showKeyPeriods: typeof show === 'function' ? show(prev.showKeyPeriods) : show }))
    }, [])
    const setShowInputs = useCallback((show) => {
        setAppState(prev => ({ ...prev, showInputs: typeof show === 'function' ? show(prev.showInputs) : show }))
    }, [])
    const setShowIndices = useCallback((show) => {
        setAppState(prev => ({ ...prev, showIndices: typeof show === 'function' ? show(prev.showIndices) : show }))
    }, [])
    const setShowNominal = useCallback((show) => {
        setAppState(prev => ({ ...prev, showNominal: typeof show === 'function' ? show(prev.showNominal) : show }))
    }, [])
    const setShowTimeseries = useCallback((show) => {
        setAppState(prev => ({ ...prev, showTimeseries: typeof show === 'function' ? show(prev.showTimeseries) : show }))
    }, [])
    const setShowCalculations = useCallback((show) => {
        setAppState(prev => ({ ...prev, showCalculations: typeof show === 'function' ? show(prev.showCalculations) : show }))
    }, [])
    const setKeyPeriods = useCallback((periods) => {
        setAppState(prev => ({ ...prev, keyPeriods: typeof periods === 'function' ? periods(prev.keyPeriods) : periods }))
    }, [])
    const setInputType1 = useCallback((inputs) => {
        setAppState(prev => ({ ...prev, inputType1: typeof inputs === 'function' ? inputs(prev.inputType1) : inputs }))
    }, [])
    const setInputGlass = useCallback((inputs) => {
        setAppState(prev => ({ ...prev, inputGlass: typeof inputs === 'function' ? inputs(prev.inputGlass) : inputs }))
    }, [])
    const setIndices = useCallback((indices) => {
        setAppState(prev => ({ ...prev, indices: typeof indices === 'function' ? indices(prev.indices) : indices }))
    }, [])
    const setInputType1Groups = useCallback((groups) => {
        setAppState(prev => ({ ...prev, inputType1Groups: typeof groups === 'function' ? groups(prev.inputType1Groups) : groups }))
    }, [])
    const setInputGlassGroups = useCallback((groups) => {
        setAppState(prev => ({ ...prev, inputGlassGroups: typeof groups === 'function' ? groups(prev.inputGlassGroups) : groups }))
    }, [])
    const setCollapsedInputType1Groups = useCallback((setOrArray) => {
        setAppState(prev => {
            let newSet
            if (setOrArray instanceof Set) {
                newSet = setOrArray
            } else if (typeof setOrArray === 'function') {
                const result = setOrArray(prev.collapsedInputType1Groups)
                newSet = result instanceof Set ? result : new Set(result || [])
            } else {
                newSet = new Set(setOrArray || [])
            }
            return { ...prev, collapsedInputType1Groups: newSet }
        })
    }, [])
    const setCollapsedInputGlassGroups = useCallback((setOrArray) => {
        setAppState(prev => {
            let newSet
            if (setOrArray instanceof Set) {
                newSet = setOrArray
            } else if (typeof setOrArray === 'function') {
                const result = setOrArray(prev.collapsedInputGlassGroups)
                newSet = result instanceof Set ? result : new Set(result || [])
            } else {
                newSet = new Set(setOrArray || [])
            }
            return { ...prev, collapsedInputGlassGroups: newSet }
        })
    }, [])
    const setCollapsedKeyPeriodGroups = useCallback((setOrArray) => {
        setAppState(prev => {
            let newSet
            if (setOrArray instanceof Set) {
                newSet = setOrArray
            } else if (typeof setOrArray === 'function') {
                const result = setOrArray(prev.collapsedKeyPeriodGroups || new Set())
                newSet = result instanceof Set ? result : new Set(result || [])
            } else {
                newSet = new Set(setOrArray || [])
            }
            return { ...prev, collapsedKeyPeriodGroups: newSet }
        })
    }, [])
    const setCalculations = useCallback((calculations) => {
        setAppState(prev => ({ ...prev, calculations: typeof calculations === 'function' ? calculations(prev.calculations) : calculations }))
    }, [])
    const setCalculationsGroups = useCallback((groups) => {
        setAppState(prev => ({ ...prev, calculationsGroups: typeof groups === 'function' ? groups(prev.calculationsGroups) : groups }))
    }, [])
    const setCalculationsTabs = useCallback((tabs) => {
        setAppState(prev => ({ ...prev, calculationsTabs: typeof tabs === 'function' ? tabs(prev.calculationsTabs) : tabs }))
    }, [])
    const setCollapsedCalculationsGroups = useCallback((setOrArray) => {
        setAppState(prev => {
            let newSet
            if (setOrArray instanceof Set) {
                newSet = setOrArray
            } else if (typeof setOrArray === 'function') {
                const result = setOrArray(prev.collapsedCalculationsGroups)
                newSet = result instanceof Set ? result : new Set(result || [])
            } else {
                newSet = new Set(setOrArray || [])
            }
            return { ...prev, collapsedCalculationsGroups: newSet }
        })
    }, [])
    const setGroups = useCallback((groups) => {
        setAppState(prev => ({ ...prev, groups: typeof groups === 'function' ? groups(prev.groups) : groups }))
    }, [])
    const setCollapsedGroups = useCallback((setOrArray) => {
        setAppState(prev => {
            let newSet
            if (setOrArray instanceof Set) {
                newSet = setOrArray
            } else if (typeof setOrArray === 'function') {
                const result = setOrArray(prev.collapsedGroups)
                newSet = result instanceof Set ? result : new Set(result || [])
            } else {
                newSet = new Set(setOrArray || [])
            }
            return { ...prev, collapsedGroups: newSet }
        })
    }, [])
    const setInputs = useCallback((inputs) => {
        setAppState(prev => ({ ...prev, inputs: typeof inputs === 'function' ? inputs(prev.inputs) : inputs }))
    }, [])

    // Cell refs for navigation
    const cellRefs = useRef({})

    const [selectedCalculationId, setSelectedCalculationId] = useState(null)

    // Drag state for calculation reordering
    const [calcDraggedIndex, setCalcDraggedIndex] = useState(null)
    const [calcDragOverIndex, setCalcDragOverIndex] = useState(null)

    // Calculation drag handlers
    const handleCalcDragStart = useCallback((e, index) => {
        setCalcDraggedIndex(index)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', index.toString())
    }, [])

    const handleCalcDragOver = useCallback((e, index) => {
        e.preventDefault()
        setCalcDragOverIndex(index)
    }, [])

    const handleCalcDrop = useCallback((e, dropIndex) => {
        e.preventDefault()
        if (calcDraggedIndex !== null && calcDraggedIndex !== dropIndex) {
            setAppState(prev => {
                const oldCalcs = prev.calculations || []
                const newCalcs = [...oldCalcs]
                const [moved] = newCalcs.splice(calcDraggedIndex, 1)
                newCalcs.splice(dropIndex, 0, moved)
                // No formula migration needed - R references use calc IDs, not positions
                return { ...prev, calculations: newCalcs }
            })
        }
        setCalcDraggedIndex(null)
        setCalcDragOverIndex(null)
    }, [calcDraggedIndex])

    const handleCalcDragEnd = useCallback(() => {
        setCalcDraggedIndex(null)
        setCalcDragOverIndex(null)
    }, [])

    // Auto-save hook
    const { hasLoadedFromStorage, isAutoSaving, lastSaved, saveStatus, handleRevertToOriginal } = useAutoSave(appState, setAppState)

    // Generate Timeline
    const timeline = useMemo(() => {
        try {
            return helpers.createTimeline(
                config.startYear,
                config.startMonth,
                config.endYear,
                config.endMonth,
                config.minFrequency,
                config.fyStartMonth || 7
            )
        } catch (e) {
            console.error('Timeline creation error:', e)
            throw e
        }
    }, [config.startYear, config.startMonth, config.endYear, config.endMonth, config.minFrequency, config.fyStartMonth])

    // All inputs
    const allInputs = useMemo(() => inputs, [inputs])

    // Input arrays hook
    const {
        inputType1Arrays,
        inputGlassArrays,
        autoGeneratedIndexations,
        autoGeneratedFlags,
        inputArrays
    } = useInputArrays({
        timeline,
        config,
        inputType1,
        inputType1Groups,
        inputGlass,
        inputGlassGroups,
        indices,
        keyPeriods,
        inputs
    })

    // View Headers (Aggregation columns)
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const viewHeaders = useMemo(() => {
        if (viewMode === 'M') {
            return timeline.index.map((idx, i) => {
                const year = timeline.year[i]
                const month = timeline.month[i]
                const monthName = MONTH_NAMES[month - 1]
                const shortYear = String(year).slice(-2)
                return {
                    label: `${monthName} ${shortYear}`,
                    shortLabel: monthName,
                    index: i,
                    indices: [i],
                    isTotal: false
                }
            })
        }

        const groups = []
        let currentGroup = null

        timeline.index.forEach((idx, i) => {
            let key
            if (viewMode === 'Y') key = timeline.year[i]
            if (viewMode === 'Q') key = `${timeline.year[i]}-Q${timeline.quarter[i]}`
            if (viewMode === 'FY') key = `FY${timeline.fyear[i]}`

            if (!currentGroup || currentGroup.key !== key) {
                if (currentGroup) groups.push(currentGroup)
                currentGroup = { key, label: String(key), indices: [] }
            }
            currentGroup.indices.push(i)
        })
        if (currentGroup) groups.push(currentGroup)

        // Add index property (first period in group) for pass-through display
        return groups.map(g => ({ ...g, index: g.indices[0] }))
    }, [timeline, viewMode])

    // ============================================
    // SPLIT REFERENCE MAP INTO FOCUSED MEMOS
    // This allows granular invalidation - changing flags
    // won't recalculate input groups, etc.
    // ============================================

    // 0. Pre-compute group metadata to avoid repeating expensive operations
    // This is shared by inputGroupRefs, referenceTypeMap, and referenceNameMap
    const groupMetadata = useMemo(() => {
        // Build a map of group.id -> inputs for O(1) lookup
        const inputsByGroupId = new Map()
        inputGlass.forEach(input => {
            if (!inputsByGroupId.has(input.groupId)) {
                inputsByGroupId.set(input.groupId, [])
            }
            inputsByGroupId.get(input.groupId).push(input)
        })

        // Filter to active groups (groups that have inputs)
        const activeGroups = inputGlassGroups.filter(group => inputsByGroupId.has(group.id))

        // Build metadata for each group
        const modeIndices = { values: 0, series: 0, constant: 0, timing: 0, lookup: 0 }
        const metadata = []

        activeGroups.forEach(group => {
            const groupInputs = inputsByGroupId.get(group.id) || []

            // Determine group mode/type - check groupType first, then fall back to entryMode, then input mode
            let normalizedMode
            if (group.groupType === 'timing') {
                normalizedMode = 'timing'
            } else if (group.groupType === 'constants') {
                normalizedMode = 'constant'
            } else {
                const groupMode = group.entryMode || groupInputs[0]?.mode || 'values'
                if (groupMode === 'constants' || groupMode === 'constant') normalizedMode = 'constant'
                else if (groupMode === 'lookup' || groupMode === 'lookup2') normalizedMode = 'lookup'
                else normalizedMode = groupMode
            }

            modeIndices[normalizedMode]++
            const modePrefix = normalizedMode === 'timing' ? 'T' :
                              normalizedMode === 'series' ? 'S' :
                              normalizedMode === 'constant' ? 'C' :
                              normalizedMode === 'lookup' ? 'L' : 'V'
            const groupRef = `${modePrefix}${modeIndices[normalizedMode]}`

            metadata.push({
                group,
                groupInputs,
                normalizedMode,
                groupRef
            })
        })

        return metadata
    }, [inputGlass, inputGlassGroups])

    // 1. Input Group References (V, S, C groups) - only invalidates when inputs/groups change
    const inputGroupRefs = useMemo(() => {
        const refs = {}

        groupMetadata.forEach(({ groupInputs, groupRef }) => {
            const groupArrays = groupInputs.map(input =>
                inputGlassArrays[`inputtype3_${input.id}`] || new Array(timeline.periods).fill(0)
            )
            const subtotalArray = new Array(timeline.periods).fill(0)
            for (let i = 0; i < timeline.periods; i++) {
                subtotalArray[i] = groupArrays.reduce((sum, arr) => sum + (arr[i] || 0), 0)
            }
            refs[groupRef] = subtotalArray

            groupInputs.forEach((input, idx) => {
                const itemRef = `${groupRef}.${idx + 1}`
                refs[itemRef] = inputGlassArrays[`inputtype3_${input.id}`] || new Array(timeline.periods).fill(0)
            })
        })

        return refs
    }, [groupMetadata, inputGlassArrays, timeline.periods])

    // 2. Flag References (F1, F2, F1.Start, F1.End, etc.) - only invalidates when flags change
    const flagRefs = useMemo(() => {
        const refs = {}
        Object.values(autoGeneratedFlags).forEach((flag, idx) => {
            const refNum = idx + 1
            refs[`F${refNum}`] = flag.array || new Array(timeline.periods).fill(0)
            // Add .Start and .End variants for key period flags
            if (flag.startArray) refs[`F${refNum}.Start`] = flag.startArray
            if (flag.endArray) refs[`F${refNum}.End`] = flag.endArray
        })
        return refs
    }, [autoGeneratedFlags, timeline.periods])

    // 3. Indexation References (I1, I2, etc.) - only invalidates when indexations change
    const indexationRefs = useMemo(() => {
        const refs = {}
        Object.values(autoGeneratedIndexations).forEach((indexation, idx) => {
            refs[`I${idx + 1}`] = indexation.array || new Array(timeline.periods).fill(0)
        })
        return refs
    }, [autoGeneratedIndexations, timeline.periods])

    // 4. Time Constant References (T.DiM, T.DiY, etc.) - only invalidates when timeline changes
    const timeConstantRefs = useMemo(() => {
        const refs = {}

        // Cache year-based calculations to avoid redundant computations
        const yearCache = new Map()
        const getYearData = (year) => {
            if (!yearCache.has(year)) {
                const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
                const dec31 = new Date(year, 11, 31)
                const jan1 = new Date(year, 0, 1)
                const weeksInYear = dec31.getDay() === 4 || jan1.getDay() === 4 ? 53 : 52
                yearCache.set(year, { isLeap, weeksInYear })
            }
            return yearCache.get(year)
        }

        const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate()

        // DiM - Days in Month (varies: 28-31)
        refs['T.DiM'] = new Array(timeline.periods).fill(0).map((_, i) =>
            getDaysInMonth(timeline.year[i], timeline.month[i])
        )
        // DiY - Days in Year (365 or 366)
        refs['T.DiY'] = new Array(timeline.periods).fill(0).map((_, i) =>
            getYearData(timeline.year[i]).isLeap ? 366 : 365
        )
        // MiY - Months in Year (always 12)
        refs['T.MiY'] = new Array(timeline.periods).fill(12)
        // QiY - Quarters in Year (always 4)
        refs['T.QiY'] = new Array(timeline.periods).fill(4)
        // WiY - Weeks in Year (52 or 53)
        refs['T.WiY'] = new Array(timeline.periods).fill(0).map((_, i) =>
            getYearData(timeline.year[i]).weeksInYear
        )
        // HiD - Hours in Day (always 24)
        refs['T.HiD'] = new Array(timeline.periods).fill(24)
        // HiM - Hours in Month (DiM * 24)
        refs['T.HiM'] = refs['T.DiM'].map(d => d * 24)
        // HiY - Hours in Year (8760 or 8784)
        refs['T.HiY'] = new Array(timeline.periods).fill(0).map((_, i) =>
            getYearData(timeline.year[i]).isLeap ? 8784 : 8760
        )
        // MiQ - Months in Quarter (always 3)
        refs['T.MiQ'] = new Array(timeline.periods).fill(3)
        // DiQ - Days in Quarter (varies: ~90-92)
        refs['T.DiQ'] = new Array(timeline.periods).fill(0).map((_, i) => {
            const year = timeline.year[i]
            const month = timeline.month[i]
            const quarter = Math.floor((month - 1) / 3)
            const startMonth = quarter * 3 + 1
            return getDaysInMonth(year, startMonth) + getDaysInMonth(year, startMonth + 1) + getDaysInMonth(year, startMonth + 2)
        })

        // Time-based flags (1 at period end, 0 otherwise)
        // QE - Quarter End (1 at months 3, 6, 9, 12)
        refs['T.QE'] = new Array(timeline.periods).fill(0).map((_, i) =>
            [3, 6, 9, 12].includes(timeline.month[i]) ? 1 : 0
        )
        // CYE - Calendar Year End (1 at December)
        refs['T.CYE'] = new Array(timeline.periods).fill(0).map((_, i) =>
            timeline.month[i] === 12 ? 1 : 0
        )
        // FYE - Financial Year End (1 at June - Australian FY)
        refs['T.FYE'] = new Array(timeline.periods).fill(0).map((_, i) =>
            timeline.month[i] === 6 ? 1 : 0
        )

        return refs
    }, [timeline.periods, timeline.year, timeline.month])

    // 5. Lookup References (L1, L1.1, L1.1.1, etc.) - only invalidates when lookups change
    const lookupRefs = useMemo(() => {
        const refs = {}
        let lookupIndex = 0

        inputGlassGroups
            .filter(group => group.entryMode === 'lookup' || group.entryMode === 'lookup2')
            .forEach(group => {
                lookupIndex++
                const groupInputs = inputGlass.filter(input => input.groupId === group.id)
                const lookupRef = `L${lookupIndex}`
                const selectedIndices = group.selectedIndices || {}

                // Group inputs by subgroup
                const subgroups = group.subgroups || []
                const rootInputs = groupInputs.filter(inp => !inp.subgroupId)
                const hasActualSubgroups = subgroups.length > 0

                // If NO subgroups, reference inputs directly as L3.1, L3.2, etc.
                if (!hasActualSubgroups) {
                    rootInputs.forEach((input, inputIdx) => {
                        const inputRef = `${lookupRef}.${inputIdx + 1}`
                        refs[inputRef] = inputGlassArrays[`inputtype3_${input.id}`] || new Array(timeline.periods).fill(0)
                    })
                } else {
                    // WITH subgroups: L3.1 (subgroup), L3.1.1 (input in subgroup), etc.
                    const subgroupedInputs = []
                    if (rootInputs.length > 0) {
                        subgroupedInputs.push({ id: null, name: null, inputs: rootInputs })
                    }
                    subgroups.forEach(sg => {
                        const sgInputs = groupInputs.filter(inp => inp.subgroupId === sg.id)
                        subgroupedInputs.push({ id: sg.id, name: sg.name, inputs: sgInputs })
                    })

                    subgroupedInputs.forEach((sg, sgIdx) => {
                        if (sg.inputs.length === 0) return

                        const key = sg.id ?? 'root'
                        const selectedIdx = selectedIndices[key] ?? 0
                        const selectedInput = sg.inputs[selectedIdx] || sg.inputs[0]
                        const subgroupRef = `${lookupRef}.${sgIdx + 1}`

                        // Add subgroup reference (L1.1) - points to selected input's array
                        if (selectedInput) {
                            refs[subgroupRef] = inputGlassArrays[`inputtype3_${selectedInput.id}`] || new Array(timeline.periods).fill(0)
                        }

                        // Add individual option references (L1.1.1, L1.1.2, etc.)
                        sg.inputs.forEach((input, inputIdx) => {
                            const optionRef = `${subgroupRef}.${inputIdx + 1}`
                            refs[optionRef] = inputGlassArrays[`inputtype3_${input.id}`] || new Array(timeline.periods).fill(0)
                        })
                    })
                }
            })

        return refs
    }, [inputGlass, inputGlassGroups, inputGlassArrays, timeline.periods])

    // 6. COMBINED Reference Map - merges all focused refs
    // Only re-merges when a sub-ref changes, not when unrelated data changes
    const referenceMap = useMemo(() => ({
        ...inputGroupRefs,
        ...flagRefs,
        ...indexationRefs,
        ...timeConstantRefs,
        ...lookupRefs
    }), [inputGroupRefs, flagRefs, indexationRefs, timeConstantRefs, lookupRefs])

    // Calculate non-iterative module outputs (before calculations)
    const regularModuleOutputs = useMemo(() => {
        const outputs = {}
        if (!modules || modules.length === 0) return outputs

        modules.forEach((module, moduleIdx) => {
            const templateId = module.templateId
            const templateKey = templateId

            // Skip iterative modules - they're calculated after calculations
            if (templateKey === 'iterative_debt_sizing') {
                const template = MODULE_TEMPLATES[templateKey]
                if (template) {
                    template.outputs.forEach((output, outputIdx) => {
                        const ref = `M${moduleIdx + 1}.${outputIdx + 1}`
                        outputs[ref] = new Array(timeline.periods).fill(0)
                    })
                }
                return
            }

            if (!MODULE_TEMPLATES[templateKey]) return

            const template = MODULE_TEMPLATES[templateKey]
            const context = { ...referenceMap, timeline }

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

        return outputs
    }, [modules, referenceMap, timeline])

    // Placeholder for iterative outputs - will be populated after calculations
    const moduleOutputs = regularModuleOutputs

    // Build reference type map (flow vs stock vs flowConverter) for each reference
    // Types: 'flow' (accumulates over time), 'stock' (point-in-time), 'flowConverter' (converts calc to flow)
    const referenceTypeMap = useMemo(() => {
        const types = {}

        groupMetadata.forEach(({ groupInputs, normalizedMode, groupRef }) => {
            // Determine group type - if ANY input is a flow or flowConverter, group inherits that
            let groupIsFlow = false
            let groupHasFlowConverter = false

            groupInputs.forEach((input, idx) => {
                const entryMode = input.entryMode || input.mode || 'values'
                const isConstantMode = entryMode === 'constant' || entryMode === 'constants'

                // Check for flowConverter flag (time factors like Hours in Year)
                // Also, all inputs in timing groups are flow converters
                if (input.flowConverter || normalizedMode === 'timing') {
                    types[`${groupRef}.${idx + 1}`] = 'flowConverter'
                    groupHasFlowConverter = true
                    return
                }

                // Determine spreadMethod for this input
                let spreadMethod
                if (input.spreadMethod) {
                    spreadMethod = input.spreadMethod
                } else if (input.type === 'stock') {
                    spreadMethod = 'lookup'
                } else if (input.type === 'flow') {
                    spreadMethod = 'spread'
                } else if (isConstantMode) {
                    spreadMethod = 'lookup'
                } else {
                    // Default to flow (spread) - no hidden auto-detection based on name
                    spreadMethod = 'spread'
                }

                const isFlow = spreadMethod === 'spread'
                types[`${groupRef}.${idx + 1}`] = isFlow ? 'flow' : 'stock'

                if (isFlow) groupIsFlow = true
            })

            // Group total inherits type - flowConverter > flow > stock
            if (groupHasFlowConverter) {
                types[groupRef] = 'flowConverter'
            } else if (groupIsFlow) {
                types[groupRef] = 'flow'
            } else {
                types[groupRef] = 'stock'
            }
        })

        // Flags are always stock (binary 0/1 values)
        Object.values(autoGeneratedFlags).forEach((flag, idx) => {
            const refNum = idx + 1
            types[`F${refNum}`] = 'stock'
            if (flag.startArray) types[`F${refNum}.Start`] = 'stock'
            if (flag.endArray) types[`F${refNum}.End`] = 'stock'
        })

        // Indexations are always stock (multiplier factors)
        Object.values(autoGeneratedIndexations).forEach((indexation, idx) => {
            types[`I${idx + 1}`] = 'stock'
        })

        // Time conversion constants are flowConverters
        const timeConstants = ['T.DiM', 'T.DiY', 'T.MiY', 'T.QiY', 'T.WiY', 'T.HiD', 'T.HiM', 'T.HiY', 'T.MiQ', 'T.DiQ', 'T.QE', 'T.CYE', 'T.FYE']
        timeConstants.forEach(tc => {
            types[tc] = 'flowConverter'
        })

        // Lookups are stock (selected values)
        // Structure without subgroups: L1.1, L1.2, etc. (direct inputs)
        // Structure with subgroups: L1.1 (subgroup selected), L1.1.1, L1.1.2 (options), etc.
        let lookupIndex = 0
        inputGlassGroups
            .filter(group => group.entryMode === 'lookup' || group.entryMode === 'lookup2')
            .forEach(group => {
                lookupIndex++
                const groupInputs = inputGlass.filter(input => input.groupId === group.id)
                const lookupRef = `L${lookupIndex}`

                const subgroups = group.subgroups || []
                const rootInputs = groupInputs.filter(inp => !inp.subgroupId)
                const hasActualSubgroups = subgroups.length > 0

                if (!hasActualSubgroups) {
                    // No subgroups: L3.1, L3.2, etc.
                    rootInputs.forEach((_, inputIdx) => {
                        types[`${lookupRef}.${inputIdx + 1}`] = 'stock'
                    })
                } else {
                    // With subgroups: L3.1 (subgroup), L3.1.1 (input), etc.
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

                        const subgroupRef = `${lookupRef}.${sgIdx + 1}`
                        types[subgroupRef] = 'stock'

                        sg.inputs.forEach((_, inputIdx) => {
                            types[`${subgroupRef}.${inputIdx + 1}`] = 'stock'
                        })
                    })
                }
            })

        // Module outputs - get types from MODULE_TEMPLATES
        if (modules) {
            modules.forEach((module, idx) => {
                const templateKeyMap = { 'iterative_debt_sizing': 'iterative_debt_sizing' }
                const templateKey = templateKeyMap[module.templateId] || module.templateId
                const template = MODULE_TEMPLATES[templateKey]
                if (template && template.outputs) {
                    template.outputs.forEach((output, outputIdx) => {
                        types[`M${idx + 1}.${outputIdx + 1}`] = output.type || 'flow'
                    })
                }
            })
        }

        return types
    }, [groupMetadata, inputGlass, inputGlassGroups, autoGeneratedFlags, autoGeneratedIndexations, modules])

    // Build reference-to-name map for formula expansion
    const referenceNameMap = useMemo(() => {
        const names = {}

        groupMetadata.forEach(({ group, groupInputs, groupRef }) => {
            names[groupRef] = group.name

            groupInputs.forEach((input, idx) => {
                names[`${groupRef}.${idx + 1}`] = input.name
            })
        })

        Object.values(autoGeneratedFlags).forEach((flag, idx) => {
            const refNum = idx + 1
            names[`F${refNum}`] = flag.name
            if (flag.startArray) names[`F${refNum}.Start`] = `${flag.name} Start`
            if (flag.endArray) names[`F${refNum}.End`] = `${flag.name} End`
        })

        Object.values(autoGeneratedIndexations).forEach((indexation, idx) => {
            names[`I${idx + 1}`] = indexation.name
        })

        // Time conversion constant names
        names['T.DiM'] = 'Days in Month'
        names['T.DiY'] = 'Days in Year'
        names['T.MiY'] = 'Months in Year'
        names['T.QiY'] = 'Quarters in Year'
        names['T.WiY'] = 'Weeks in Year'
        names['T.HiD'] = 'Hours in Day'
        names['T.HiM'] = 'Hours in Month'
        names['T.HiY'] = 'Hours in Year'
        names['T.MiQ'] = 'Months in Quarter'
        names['T.DiQ'] = 'Days in Quarter'
        names['T.QE'] = 'Quarter End'
        names['T.CYE'] = 'Calendar Year End'
        names['T.FYE'] = 'Financial Year End'

        // Lookup names
        // Structure without subgroups: L1.1, L1.2, etc. (direct inputs)
        // Structure with subgroups: L1.1 (subgroup selected), L1.1.1, L1.1.2 (options), etc.
        let lookupIndex = 0
        inputGlassGroups
            .filter(group => group.entryMode === 'lookup' || group.entryMode === 'lookup2')
            .forEach(group => {
                lookupIndex++
                const groupInputs = inputGlass.filter(input => input.groupId === group.id)
                const lookupRef = `L${lookupIndex}`
                const selectedIndices = group.selectedIndices || {}

                const subgroups = group.subgroups || []
                const rootInputs = groupInputs.filter(inp => !inp.subgroupId)
                const hasActualSubgroups = subgroups.length > 0

                // Group name (L1)
                names[lookupRef] = group.name

                if (!hasActualSubgroups) {
                    // No subgroups: L3.1, L3.2, etc. are direct input names
                    rootInputs.forEach((input, inputIdx) => {
                        names[`${lookupRef}.${inputIdx + 1}`] = `${group.name} - ${input.name}`
                    })
                } else {
                    // With subgroups
                    const subgroupedInputs = []
                    if (rootInputs.length > 0) {
                        subgroupedInputs.push({ id: null, name: null, inputs: rootInputs })
                    }
                    subgroups.forEach(sg => {
                        const sgInputs = groupInputs.filter(inp => inp.subgroupId === sg.id)
                        subgroupedInputs.push({ id: sg.id, name: sg.name, inputs: sgInputs })
                    })

                    subgroupedInputs.forEach((sg, sgIdx) => {
                        if (sg.inputs.length === 0) return

                        const key = sg.id ?? 'root'
                        const selectedIdx = selectedIndices[key] ?? 0
                        const selectedInput = sg.inputs[selectedIdx] || sg.inputs[0]
                        const subgroupRef = `${lookupRef}.${sgIdx + 1}`

                        const prefix = sg.name ? `${group.name} - ${sg.name}` : group.name
                        names[subgroupRef] = selectedInput ? `${prefix} (${selectedInput.name})` : prefix

                        sg.inputs.forEach((input, inputIdx) => {
                            const optionRef = `${subgroupRef}.${inputIdx + 1}`
                            names[optionRef] = sg.name
                                ? `${group.name} - ${sg.name} - ${input.name}`
                                : `${group.name} - ${input.name}`
                        })
                    })
                }
            })

        if (modules) {
            modules.forEach((module, idx) => {
                names[`M${idx + 1}`] = module.name
                // Get output labels from MODULE_TEMPLATES
                const templateKeyMap = { 'iterative_debt_sizing': 'iterative_debt_sizing' }
                const templateKey = templateKeyMap[module.templateId] || module.templateId
                const template = MODULE_TEMPLATES[templateKey]
                if (template && template.outputs) {
                    template.outputs.forEach((output, outputIdx) => {
                        names[`M${idx + 1}.${outputIdx + 1}`] = `${module.name} - ${output.label}`
                    })
                }
            })
        }

        if (calculations) {
            // Use calculation ID instead of array position for stable references
            calculations.forEach((calc) => {
                names[`R${calc.id}`] = calc.name
            })
        }

        return names
    }, [groupMetadata, inputGlass, inputGlassGroups, autoGeneratedFlags, autoGeneratedIndexations, modules, calculations])

    // Expand a formula to show input names instead of references
    const expandFormulaToNames = useCallback((formula) => {
        if (!formula || !formula.trim()) return ''

        let expanded = formula
        const sortedRefs = Object.keys(referenceNameMap).sort((a, b) => b.length - a.length)

        for (const ref of sortedRefs) {
            const name = referenceNameMap[ref]
            if (name) {
                const regex = getCachedRegex(ref)
                regex.lastIndex = 0 // Reset for global patterns
                expanded = expanded.replace(regex, name)
            }
        }

        return expanded
    }, [referenceNameMap])

    // Evaluate a formula string and return the result array
    const evaluateFormula = useCallback((formula, calcResults = {}) => {
        if (!formula || !formula.trim()) {
            return { values: new Array(timeline.periods).fill(0), error: null }
        }

        try {
            const allRefs = { ...referenceMap, ...moduleOutputs, ...calcResults }
            const resultArray = new Array(timeline.periods).fill(0)

            // Check for unresolved references before evaluation
            // Remove SHIFT(...) patterns first - these are lagged dependencies that may not be computed yet
            // and will be resolved correctly during evaluation (using prior period values)
            const formulaWithoutShift = formula.replace(/SHIFT\s*\([^)]+\)/gi, '')
            // Match patterns like V1, V1.1, S1, C1, T1, F1, I1, L1, L1.1, L1.1.1, R1, M1, M1.1, T.DiM, etc.
            const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*|T\.[A-Za-z]+)\b/g
            const refsInFormula = [...formulaWithoutShift.matchAll(refPattern)].map(m => m[1])
            const missingRefs = refsInFormula.filter(ref => !allRefs[ref])

            if (missingRefs.length > 0) {
                return {
                    values: new Array(timeline.periods).fill(0),
                    error: `Unknown reference(s): ${missingRefs.join(', ')}`
                }
            }

            // Pre-process array functions (CUMPROD, CUMPROD_Y, CUMSUM, CUMSUM_Y)
            // These need to be evaluated across all periods first, then substituted
            const { processedFormula, arrayFnResults } = processArrayFunctions(formula, allRefs, timeline)

            // Pre-sort refs and filter to only those in formula (optimization)
            const sortedRefs = Object.keys(allRefs).sort((a, b) => b.length - a.length)
            const relevantRefs = sortedRefs.filter(ref => processedFormula.includes(ref.split('.')[0]))

            for (let i = 0; i < timeline.periods; i++) {
                let expr = processedFormula

                for (const ref of relevantRefs) {
                    const value = allRefs[ref]?.[i] ?? 0
                    const regex = getCachedRegex(ref)
                    regex.lastIndex = 0 // Reset for global patterns
                    expr = expr.replace(regex, value.toString())
                }

                // Substitute array function results
                for (const [placeholder, arr] of Object.entries(arrayFnResults)) {
                    expr = expr.replace(placeholder, arr[i].toString())
                }

                resultArray[i] = evaluateSafeExpression(expr)
            }

            return { values: resultArray, error: null }
        } catch (e) {
            return { values: new Array(timeline.periods).fill(0), error: e.message }
        }
    }, [referenceMap, moduleOutputs, timeline.periods, timeline.year])

    // Evaluate all calculations in dependency order (using IDs, not positions)
    const { calculationResults, calculationErrors } = useMemo(() => {
        const results = {}
        const errors = {}
        if (!calculations || calculations.length === 0) return { calculationResults: results, calculationErrors: errors }

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

        // Evaluate in topological order
        if (evalOrder.length !== calculations.length) {
            // Cycle detected - identify which calculations are in the cycle
            const inCycle = new Set(allIds)
            evalOrder.forEach(id => inCycle.delete(id))
            const cycleCalcs = [...inCycle].map(id => `R${id}`).join(', ')

            // Evaluate non-cyclic calculations first
            for (const id of evalOrder) {
                const calc = calcById.get(id)
                const { values, error } = evaluateFormula(calc.formula, results)
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
                const { values, error } = evaluateFormula(calc.formula, results)
                results[`R${id}`] = values
                if (error) errors[`R${id}`] = error
            }
        }

        return { calculationResults: results, calculationErrors: errors }
    }, [calculations, evaluateFormula, timeline.periods])

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

    // Calculate iterative module outputs (AFTER calculations, so can reference R-values)
    const iterativeModuleOutputs = useMemo(() => {
        const outputs = {}
        if (!modules || modules.length === 0) return outputs

        modules.forEach((module, moduleIdx) => {
            const templateKey = module.templateId

            // Only process iterative modules here
            if (templateKey !== 'iterative_debt_sizing') return

            const template = MODULE_TEMPLATES[templateKey]
            if (!template) return

            // Only calculate if solved
            if (!module.solvedAt) {
                template.outputs.forEach((output, outputIdx) => {
                    const ref = `M${moduleIdx + 1}.${outputIdx + 1}`
                    outputs[ref] = new Array(timeline.periods).fill(0)
                })
                return
            }

            // Build context with referenceMap, calculationResults, and timeline
            const context = { ...referenceMap, ...calculationResults, timeline }

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

        return outputs
    }, [modules, referenceMap, calculationResults, timeline])

    // Merge all module outputs
    const allModuleOutputs = useMemo(() => ({
        ...regularModuleOutputs,
        ...iterativeModuleOutputs
    }), [regularModuleOutputs, iterativeModuleOutputs])

    // Input management hook
    const inputManagement = useInputManagement({
        config,
        keyPeriods,
        setKeyPeriods,
        collapsedKeyPeriodGroups,
        setCollapsedKeyPeriodGroups,
        inputType1,
        setInputType1,
        inputType1Groups,
        setInputType1Groups,
        inputGlass,
        setInputGlass,
        inputGlassGroups,
        setInputGlassGroups,
        indices,
        setIndices,
        calculations,
        setCalculations,
        calculationsTabs,
        setCalculationsTabs,
        calculationsGroups,
        setCalculationsGroups,
        groups,
        setGroups,
        inputs,
        setInputs,
        setCollapsedGroups
    })

    // Organize inputs by group
    const inputsByGroup = useMemo(() => {
        const organized = {}
        groups.forEach(group => {
            organized[group.id] = {
                group,
                inputs: allInputs
                    .filter(input => input.groupId === group.id)
                    .sort((a, b) => a.id - b.id)
            }
        })
        return Object.values(organized).sort((a, b) => a.group.order - b.group.order)
    }, [allInputs, groups])

    // Navigate between cells with arrow keys/tab
    const handleCellNavigate = useCallback((direction, rowId, colIndex) => {
        const rowIndex = inputs.findIndex(i => i.id === rowId)
        let nextRowIndex = rowIndex
        let nextColIndex = colIndex

        switch (direction) {
            case 'next':
            case 'right':
                nextColIndex = colIndex + 1
                if (nextColIndex >= viewHeaders.length) {
                    nextColIndex = 0
                    nextRowIndex = rowIndex + 1
                }
                break
            case 'left':
                nextColIndex = colIndex - 1
                if (nextColIndex < 0) {
                    nextColIndex = viewHeaders.length - 1
                    nextRowIndex = rowIndex - 1
                }
                break
            case 'down':
                nextRowIndex = rowIndex + 1
                break
            case 'up':
                nextRowIndex = rowIndex - 1
                break
        }

        if (nextRowIndex >= 0 && nextRowIndex < inputs.length && nextColIndex >= 0 && nextColIndex < viewHeaders.length) {
            const nextRowId = inputs[nextRowIndex].id
            const cellKey = `${nextRowId}-${nextColIndex}`
            const nextInput = cellRefs.current[cellKey]
            if (nextInput) {
                nextInput.focus()
                nextInput.select()
            }
        }
    }, [inputs, viewHeaders.length])

    // Fill right - copy value to all subsequent cells in the row
    const fillRight = useCallback((inputId, fromIndex) => {
        const input = inputs.find(i => i.id === inputId)
        if (!input) return

        const arr = inputArrays[inputId]
        const sourceValue = arr[fromIndex]

        const newValues = { ...input.values }
        for (let i = fromIndex; i < timeline.periods; i++) {
            newValues[i] = sourceValue
        }

        inputManagement.updateInput(inputId, 'values', newValues)
    }, [inputs, inputArrays, timeline.periods, inputManagement])

    // Reset row to defaults
    const resetRow = useCallback((inputId) => {
        inputManagement.updateInput(inputId, 'values', {})
    }, [inputManagement])

    // Collect all setters
    const setters = {
        setConfig,
        setShowConfig,
        setShowKeyPeriods,
        setShowInputs,
        setShowIndices,
        setShowNominal,
        setShowTimeseries,
        setShowCalculations,
        setKeyPeriods,
        setInputType1,
        setInputGlass,
        setIndices,
        setInputType1Groups,
        setInputGlassGroups,
        setCollapsedInputType1Groups,
        setCollapsedInputGlassGroups,
        setCollapsedKeyPeriodGroups,
        setCalculations,
        setCalculationsTabs,
        setCalculationsGroups,
        setCollapsedCalculationsGroups,
        setGroups,
        setCollapsedGroups,
        setInputs,
        setAppState,
        setArrayViewSubTab,
        setSelectedCalculationId
    }

    // Collect derived values
    const derived = {
        timeline,
        viewHeaders,
        referenceMap,
        referenceNameMap,
        referenceTypeMap,
        moduleOutputs: allModuleOutputs,
        calculationResults,
        calculationErrors,
        calculationTypes,
        inputsByGroup,
        allInputs,
        inputType1Arrays,
        inputGlassArrays,
        autoGeneratedIndexations,
        autoGeneratedFlags,
        inputArrays,
        expandFormulaToNames,
        evaluateFormula
    }

    // Collect handlers
    const handlers = {
        handleCellNavigate,
        fillRight,
        resetRow,
        handleRevertToOriginal,
        handleCalcDragStart,
        handleCalcDragOver,
        handleCalcDrop,
        handleCalcDragEnd,
        ...inputManagement
    }

    // Collect auto-save state
    const autoSaveState = {
        hasLoadedFromStorage,
        isAutoSaving,
        lastSaved,
        saveStatus
    }

    // Collect UI state
    const uiState = {
        arrayViewSubTab,
        selectedCalculationId,
        calcDraggedIndex,
        calcDragOverIndex,
        cellRefs
    }

    return {
        appState,
        setters,
        derived,
        handlers,
        autoSaveState,
        uiState
    }
}
