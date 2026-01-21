'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import * as helpers from '../../../utils/timeArrayHelpers'
import { getDefaultState } from '../../../utils/glassInputsState'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useInputManagement } from '@/hooks/useInputManagement'
import { useInputArrays } from '@/hooks/useInputArrays'
import { detectFlowOrStock } from '@/utils/valueProvider'

export function useDashboardState(viewMode) {
    // Single state object - all state in one place for easy save/load
    const [appState, setAppState] = useState(() => getDefaultState())

    // Array View sub-tab state
    const [arrayViewSubTab, setArrayViewSubTab] = useState('inputs') // 'inputs' | 'modules' | 'results'

    // Destructure state for easier access
    const {
        config,
        activeTab,
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
        modules,
        moduleTemplates,
        calculations,
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
    const setActiveTab = useCallback((tab) => {
        setAppState(prev => ({ ...prev, activeTab: typeof tab === 'function' ? tab(prev.activeTab) : tab }))
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
    const setCalculations = useCallback((calculations) => {
        setAppState(prev => ({ ...prev, calculations: typeof calculations === 'function' ? calculations(prev.calculations) : calculations }))
    }, [])
    const setCalculationsGroups = useCallback((groups) => {
        setAppState(prev => ({ ...prev, calculationsGroups: typeof groups === 'function' ? groups(prev.calculationsGroups) : groups }))
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

                // Build mapping: old position (1-indexed) -> new position (1-indexed)
                const oldIdToOldPos = {}
                oldCalcs.forEach((calc, idx) => {
                    oldIdToOldPos[calc.id] = idx + 1
                })

                const idToNewPos = {}
                newCalcs.forEach((calc, idx) => {
                    idToNewPos[calc.id] = idx + 1
                })

                // Map old R position -> new R position
                const oldPosToNewPos = {}
                oldCalcs.forEach((calc) => {
                    const oldPos = oldIdToOldPos[calc.id]
                    const newPos = idToNewPos[calc.id]
                    oldPosToNewPos[oldPos] = newPos
                })

                // Update all formulas to use new R positions
                const updatedCalcs = newCalcs.map(calc => {
                    if (!calc.formula) return calc
                    let newFormula = calc.formula
                    // Replace R references from highest to lowest to avoid R1 replacing part of R10
                    const sortedOldPositions = Object.keys(oldPosToNewPos)
                        .map(Number)
                        .sort((a, b) => b - a)

                    // Use placeholder to avoid double-replacement
                    sortedOldPositions.forEach(oldPos => {
                        const newPos = oldPosToNewPos[oldPos]
                        const regex = new RegExp(`R${oldPos}(?![0-9])`, 'g')
                        newFormula = newFormula.replace(regex, `__R_PLACEHOLDER_${newPos}__`)
                    })
                    // Replace placeholders with actual R references
                    newFormula = newFormula.replace(/__R_PLACEHOLDER_(\d+)__/g, 'R$1')

                    return { ...calc, formula: newFormula }
                })

                return { ...prev, calculations: updatedCalcs }
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

        return groups
    }, [timeline, viewMode])

    // Forward-fill an array: extend the last non-zero value to fill remaining periods
    const forwardFillArray = useCallback((arr, length) => {
        if (!arr || arr.length === 0) return new Array(length).fill(0)
        const result = [...arr]
        while (result.length < length) {
            result.push(0)
        }

        let lastNonZeroIndex = -1
        let lastNonZeroValue = 0
        for (let i = result.length - 1; i >= 0; i--) {
            if (result[i] !== 0 && result[i] !== undefined) {
                lastNonZeroIndex = i
                lastNonZeroValue = result[i]
                break
            }
        }

        if (lastNonZeroIndex >= 0) {
            for (let i = lastNonZeroIndex + 1; i < result.length; i++) {
                if (result[i] === 0 || result[i] === undefined) {
                    result[i] = lastNonZeroValue
                }
            }
        }
        return result
    }, [])

    // Build reference map for calculations (V1, V1.1, S1, T1, F1, I1, R1, etc.)
    const referenceMap = useMemo(() => {
        const refs = {}

        const activeGroups = inputGlassGroups.filter(group =>
            inputGlass.some(input => input.groupId === group.id)
        )
        const modeIndices = { values: 0, series: 0, constant: 0, timing: 0 }

        activeGroups.forEach(group => {
            const groupInputs = inputGlass.filter(input => input.groupId === group.id)

            // Determine group mode/type - check groupType first, then fall back to input mode
            let normalizedMode
            if (group.groupType === 'timing') {
                normalizedMode = 'timing'
            } else {
                const groupMode = groupInputs[0]?.mode || 'values'
                normalizedMode = groupMode === 'constants' ? 'constant' : groupMode
            }

            modeIndices[normalizedMode]++
            const modePrefix = normalizedMode === 'timing' ? 'T' :
                              normalizedMode === 'series' ? 'S' :
                              normalizedMode === 'constant' ? 'C' : 'V'
            const groupIndex = modeIndices[normalizedMode]
            const groupRef = `${modePrefix}${groupIndex}`

            const groupArrays = groupInputs.map(input =>
                forwardFillArray(inputGlassArrays[`inputtype3_${input.id}`] || [], timeline.periods)
            )
            const subtotalArray = new Array(timeline.periods).fill(0)
            for (let i = 0; i < timeline.periods; i++) {
                subtotalArray[i] = groupArrays.reduce((sum, arr) => sum + (arr[i] || 0), 0)
            }
            refs[groupRef] = subtotalArray

            groupInputs.forEach((input, idx) => {
                const itemRef = `${groupRef}.${idx + 1}`
                refs[itemRef] = forwardFillArray(inputGlassArrays[`inputtype3_${input.id}`] || [], timeline.periods)
            })
        })

        Object.values(autoGeneratedFlags).forEach((flag, idx) => {
            refs[`F${idx + 1}`] = flag.array || new Array(timeline.periods).fill(0)
        })

        Object.values(autoGeneratedIndexations).forEach((indexation, idx) => {
            refs[`I${idx + 1}`] = indexation.array || new Array(timeline.periods).fill(0)
        })

        // Add time conversion constants (T.DiM, T.DiY, T.QiY, etc.)
        // Helper to get days in month
        const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate()
        const isLeapYear = (year) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)

        // DiM - Days in Month (varies: 28-31)
        refs['T.DiM'] = new Array(timeline.periods).fill(0).map((_, i) =>
            getDaysInMonth(timeline.year[i], timeline.month[i])
        )
        // DiY - Days in Year (365 or 366)
        refs['T.DiY'] = new Array(timeline.periods).fill(0).map((_, i) =>
            isLeapYear(timeline.year[i]) ? 366 : 365
        )
        // MiY - Months in Year (always 12)
        refs['T.MiY'] = new Array(timeline.periods).fill(12)
        // QiY - Quarters in Year (always 4)
        refs['T.QiY'] = new Array(timeline.periods).fill(4)
        // WiY - Weeks in Year (52 or 53)
        refs['T.WiY'] = new Array(timeline.periods).fill(0).map((_, i) => {
            const year = timeline.year[i]
            const dec31 = new Date(year, 11, 31)
            const jan1 = new Date(year, 0, 1)
            // ISO week calculation
            return dec31.getDay() === 4 || jan1.getDay() === 4 ? 53 : 52
        })
        // HiD - Hours in Day (always 24)
        refs['T.HiD'] = new Array(timeline.periods).fill(24)
        // HiM - Hours in Month (DiM * 24)
        refs['T.HiM'] = refs['T.DiM'].map(d => d * 24)
        // HiY - Hours in Year (8760 or 8784)
        refs['T.HiY'] = new Array(timeline.periods).fill(0).map((_, i) =>
            isLeapYear(timeline.year[i]) ? 8784 : 8760
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

        // Add lookup references with subgroup structure:
        // L1 - Group (no direct array)
        // L1.1 - Selected from subgroup 1 (or root)
        // L1.1.1, L1.1.2 - Individual options in subgroup 1
        // L1.2 - Selected from subgroup 2
        // L1.2.1, L1.2.2 - Individual options in subgroup 2
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
                const subgroupedInputs = []
                const rootInputs = groupInputs.filter(inp => !inp.subgroupId)
                if (rootInputs.length > 0 || subgroups.length === 0) {
                    subgroupedInputs.push({ id: null, name: null, inputs: rootInputs })
                }
                subgroups.forEach(sg => {
                    const sgInputs = groupInputs.filter(inp => inp.subgroupId === sg.id)
                    subgroupedInputs.push({ id: sg.id, name: sg.name, inputs: sgInputs })
                })

                // Process each subgroup
                subgroupedInputs.forEach((sg, sgIdx) => {
                    if (sg.inputs.length === 0) return

                    const key = sg.id ?? 'root'
                    const selectedIdx = selectedIndices[key] ?? 0
                    const selectedInput = sg.inputs[selectedIdx] || sg.inputs[0]
                    const subgroupRef = `${lookupRef}.${sgIdx + 1}`

                    // Add subgroup reference (L1.1) - points to selected input's array
                    if (selectedInput) {
                        refs[subgroupRef] = forwardFillArray(
                            inputGlassArrays[`inputtype3_${selectedInput.id}`] || [],
                            timeline.periods
                        )
                    }

                    // Add individual option references (L1.1.1, L1.1.2, etc.)
                    sg.inputs.forEach((input, inputIdx) => {
                        const optionRef = `${subgroupRef}.${inputIdx + 1}`
                        refs[optionRef] = forwardFillArray(
                            inputGlassArrays[`inputtype3_${input.id}`] || [],
                            timeline.periods
                        )
                    })
                })
            })

        return refs
    }, [inputGlass, inputGlassGroups, inputGlassArrays, autoGeneratedFlags, autoGeneratedIndexations, timeline.periods, forwardFillArray])

    // Build reference type map (flow vs stock vs flowConverter) for each reference
    // Types: 'flow' (accumulates over time), 'stock' (point-in-time), 'flowConverter' (converts calc to flow)
    const referenceTypeMap = useMemo(() => {
        const types = {}

        const activeGroups = inputGlassGroups.filter(group =>
            inputGlass.some(input => input.groupId === group.id)
        )
        const modeIndices = { values: 0, series: 0, constant: 0, timing: 0 }

        activeGroups.forEach(group => {
            const groupInputs = inputGlass.filter(input => input.groupId === group.id)

            // Determine group mode/type - check groupType first, then fall back to input mode
            let normalizedMode
            if (group.groupType === 'timing') {
                normalizedMode = 'timing'
            } else {
                const groupMode = groupInputs[0]?.mode || 'values'
                normalizedMode = groupMode === 'constants' ? 'constant' : groupMode
            }

            modeIndices[normalizedMode]++
            const modePrefix = normalizedMode === 'timing' ? 'T' :
                              normalizedMode === 'series' ? 'S' :
                              normalizedMode === 'constant' ? 'C' : 'V'
            const groupRef = `${modePrefix}${modeIndices[normalizedMode]}`

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
                    const detected = detectFlowOrStock(input.name)
                    spreadMethod = detected === 'stock' ? 'lookup' : 'spread'
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
            types[`F${idx + 1}`] = 'stock'
        })

        // Indexations are always stock (multiplier factors)
        Object.values(autoGeneratedIndexations).forEach((indexation, idx) => {
            types[`I${idx + 1}`] = 'stock'
        })

        // Time conversion constants are flowConverters
        const timeConstants = ['T.DiM', 'T.DiY', 'T.MiY', 'T.QiY', 'T.WiY', 'T.HiD', 'T.HiM', 'T.HiY', 'T.MiQ', 'T.DiQ']
        timeConstants.forEach(tc => {
            types[tc] = 'flowConverter'
        })

        // Lookups are stock (selected values)
        // Structure: L1.1 (selected), L1.1.1, L1.1.2 (options), L1.2 (selected), etc.
        let lookupIndex = 0
        inputGlassGroups
            .filter(group => group.entryMode === 'lookup' || group.entryMode === 'lookup2')
            .forEach(group => {
                lookupIndex++
                const groupInputs = inputGlass.filter(input => input.groupId === group.id)
                const lookupRef = `L${lookupIndex}`

                // Group inputs by subgroup
                const subgroups = group.subgroups || []
                const subgroupedInputs = []
                const rootInputs = groupInputs.filter(inp => !inp.subgroupId)
                if (rootInputs.length > 0 || subgroups.length === 0) {
                    subgroupedInputs.push({ id: null, inputs: rootInputs })
                }
                subgroups.forEach(sg => {
                    const sgInputs = groupInputs.filter(inp => inp.subgroupId === sg.id)
                    subgroupedInputs.push({ id: sg.id, inputs: sgInputs })
                })

                // Process each subgroup
                subgroupedInputs.forEach((sg, sgIdx) => {
                    if (sg.inputs.length === 0) return

                    const subgroupRef = `${lookupRef}.${sgIdx + 1}`

                    // Subgroup reference type (L1.1)
                    types[subgroupRef] = 'stock'

                    // Individual option types (L1.1.1, L1.1.2, etc.)
                    sg.inputs.forEach((_, inputIdx) => {
                        types[`${subgroupRef}.${inputIdx + 1}`] = 'stock'
                    })
                })
            })

        return types
    }, [inputGlass, inputGlassGroups, autoGeneratedFlags, autoGeneratedIndexations])

    // Build reference-to-name map for formula expansion
    const referenceNameMap = useMemo(() => {
        const names = {}

        const activeGroups = inputGlassGroups.filter(group =>
            inputGlass.some(input => input.groupId === group.id)
        )
        const modeIndices = { values: 0, series: 0, constant: 0, timing: 0 }

        activeGroups.forEach(group => {
            const groupInputs = inputGlass.filter(input => input.groupId === group.id)

            // Determine group mode/type - check groupType first, then fall back to input mode
            let normalizedMode
            if (group.groupType === 'timing') {
                normalizedMode = 'timing'
            } else {
                const groupMode = groupInputs[0]?.mode || 'values'
                normalizedMode = groupMode === 'constants' ? 'constant' : groupMode
            }

            modeIndices[normalizedMode]++
            const modePrefix = normalizedMode === 'timing' ? 'T' :
                              normalizedMode === 'series' ? 'S' :
                              normalizedMode === 'constant' ? 'C' : 'V'
            const groupRef = `${modePrefix}${modeIndices[normalizedMode]}`

            names[groupRef] = group.name

            groupInputs.forEach((input, idx) => {
                names[`${groupRef}.${idx + 1}`] = input.name
            })
        })

        Object.values(autoGeneratedFlags).forEach((flag, idx) => {
            names[`F${idx + 1}`] = flag.name
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

        // Lookup names
        // Structure: L1.1 (selected), L1.1.1, L1.1.2 (options), L1.2 (selected), etc.
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
                const subgroupedInputs = []
                const rootInputs = groupInputs.filter(inp => !inp.subgroupId)
                if (rootInputs.length > 0 || subgroups.length === 0) {
                    subgroupedInputs.push({ id: null, name: null, inputs: rootInputs })
                }
                subgroups.forEach(sg => {
                    const sgInputs = groupInputs.filter(inp => inp.subgroupId === sg.id)
                    subgroupedInputs.push({ id: sg.id, name: sg.name, inputs: sgInputs })
                })

                // Group name (L1)
                names[lookupRef] = group.name

                // Process each subgroup
                subgroupedInputs.forEach((sg, sgIdx) => {
                    if (sg.inputs.length === 0) return

                    const key = sg.id ?? 'root'
                    const selectedIdx = selectedIndices[key] ?? 0
                    const selectedInput = sg.inputs[selectedIdx] || sg.inputs[0]
                    const subgroupRef = `${lookupRef}.${sgIdx + 1}`

                    // Subgroup name (L1.1) - shows selected input
                    const prefix = sg.name ? `${group.name} - ${sg.name}` : group.name
                    names[subgroupRef] = selectedInput ? `${prefix} (${selectedInput.name})` : prefix

                    // Individual option names (L1.1.1, L1.1.2, etc.)
                    sg.inputs.forEach((input, inputIdx) => {
                        const optionRef = `${subgroupRef}.${inputIdx + 1}`
                        names[optionRef] = sg.name
                            ? `${group.name} - ${sg.name} - ${input.name}`
                            : `${group.name} - ${input.name}`
                    })
                })
            })

        if (modules) {
            modules.forEach((module, idx) => {
                names[`M${idx + 1}`] = module.name
                if (module.outputs) {
                    module.outputs.forEach((output, outputIdx) => {
                        names[`M${idx + 1}.${outputIdx + 1}`] = `${module.name} - ${output.replace(/_/g, ' ')}`
                    })
                }
            })
        }

        if (calculations) {
            calculations.forEach((calc, idx) => {
                names[`R${idx + 1}`] = calc.name
            })
        }

        return names
    }, [inputGlass, inputGlassGroups, autoGeneratedFlags, autoGeneratedIndexations, modules, calculations])

    // Expand a formula to show input names instead of references
    const expandFormulaToNames = useCallback((formula) => {
        if (!formula || !formula.trim()) return ''

        let expanded = formula
        const sortedRefs = Object.keys(referenceNameMap).sort((a, b) => b.length - a.length)

        for (const ref of sortedRefs) {
            const name = referenceNameMap[ref]
            if (name) {
                const regex = new RegExp(`\\b${ref.replace('.', '\\.')}\\b`, 'g')
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
            const allRefs = { ...referenceMap, ...calcResults }
            const resultArray = new Array(timeline.periods).fill(0)

            // Check for unresolved references before evaluation
            // Match patterns like V1, V1.1, S1, C1, T1, F1, I1, L1, L1.1, L1.1.1, R1, M1, M1.1, T.DiM, etc.
            const refPattern = /\b([VSCTIFLRM]\d+(?:\.\d+)*|T\.[A-Za-z]+)\b/g
            const refsInFormula = [...formula.matchAll(refPattern)].map(m => m[1])
            const missingRefs = refsInFormula.filter(ref => !allRefs[ref])

            if (missingRefs.length > 0) {
                return {
                    values: new Array(timeline.periods).fill(0),
                    error: `Unknown reference(s): ${missingRefs.join(', ')}`
                }
            }

            for (let i = 0; i < timeline.periods; i++) {
                let expr = formula
                const sortedRefs = Object.keys(allRefs).sort((a, b) => b.length - a.length)

                for (const ref of sortedRefs) {
                    const value = allRefs[ref]?.[i] ?? 0
                    const regex = new RegExp(`\\b${ref.replace('.', '\\.')}\\b`, 'g')
                    expr = expr.replace(regex, value.toString())
                }

                const safeExpr = expr.replace(/[^0-9+\-*/().e\s]/gi, '')
                if (safeExpr.trim()) {
                    try {
                        const evalFn = new Function(`return (${safeExpr})`)
                        const result = evalFn()
                        resultArray[i] = typeof result === 'number' && isFinite(result) ? result : 0
                    } catch {
                        resultArray[i] = 0
                    }
                }
            }

            return { values: resultArray, error: null }
        } catch (e) {
            return { values: new Array(timeline.periods).fill(0), error: e.message }
        }
    }, [referenceMap, timeline.periods])

    // Evaluate all calculations in dependency order
    const { calculationResults, calculationErrors } = useMemo(() => {
        const results = {}
        const errors = {}
        if (!calculations || calculations.length === 0) return { calculationResults: results, calculationErrors: errors }

        const calcCount = calculations.length

        const getDependencies = (formula) => {
            if (!formula) return []
            const deps = []
            const regex = /R(\d+)(?![0-9])/g
            let match
            while ((match = regex.exec(formula)) !== null) {
                const refNum = parseInt(match[1])
                if (refNum >= 1 && refNum <= calcCount) {
                    deps.push(refNum)
                }
            }
            return [...new Set(deps)]
        }

        const dependencies = {}
        calculations.forEach((calc, idx) => {
            const rNum = idx + 1
            dependencies[rNum] = getDependencies(calc.formula)
        })

        const inDegree = {}
        const adjList = {}
        for (let i = 1; i <= calcCount; i++) {
            inDegree[i] = 0
            adjList[i] = []
        }

        for (let i = 1; i <= calcCount; i++) {
            for (const dep of dependencies[i]) {
                adjList[dep].push(i)
                inDegree[i]++
            }
        }

        const queue = []
        for (let i = 1; i <= calcCount; i++) {
            if (inDegree[i] === 0) {
                queue.push(i)
            }
        }

        const evalOrder = []
        while (queue.length > 0) {
            const node = queue.shift()
            evalOrder.push(node)
            for (const neighbor of adjList[node]) {
                inDegree[neighbor]--
                if (inDegree[neighbor] === 0) {
                    queue.push(neighbor)
                }
            }
        }

        if (evalOrder.length !== calcCount) {
            calculations.forEach((calc, idx) => {
                const { values, error } = evaluateFormula(calc.formula, results)
                results[`R${idx + 1}`] = values
                if (error) errors[`R${idx + 1}`] = error
            })
        } else {
            for (const rNum of evalOrder) {
                const calc = calculations[rNum - 1]
                const { values, error } = evaluateFormula(calc.formula, results)
                results[`R${rNum}`] = values
                if (error) errors[`R${rNum}`] = error
            }
        }

        return { calculationResults: results, calculationErrors: errors }
    }, [calculations, evaluateFormula])

    // Determine flow/stock type for each calculation based on formula references
    // Rule: If ANY referenced input is a flow OR flowConverter, the calculation result is a flow
    const calculationTypes = useMemo(() => {
        const types = {}
        if (!calculations || calculations.length === 0) return types

        // Helper to extract all references from a formula
        const extractRefs = (formula) => {
            if (!formula) return []
            const refs = []
            // Match patterns like V1, V1.1, S1, S1.2, C1, T1, F1, I1, R1, M1, M1.1
            const regex = /\b([VSCFTIMR]\d+(?:\.\d+)?)\b/g
            let match
            while ((match = regex.exec(formula)) !== null) {
                refs.push(match[1])
            }
            return [...new Set(refs)]
        }

        // Helper to determine if a calculation is a flow based on its formula
        const isCalcFlow = (formula, visited = new Set()) => {
            const refs = extractRefs(formula)

            for (const ref of refs) {
                // Check direct input references - flow or flowConverter both make result a flow
                const refType = referenceTypeMap[ref]
                if (refType === 'flow' || refType === 'flowConverter') {
                    return true
                }

                // Check calculation references (R1, R2, etc.)
                if (ref.startsWith('R')) {
                    const calcNum = parseInt(ref.slice(1))
                    const calcIdx = calcNum - 1
                    if (calcIdx >= 0 && calcIdx < calculations.length && !visited.has(calcIdx)) {
                        visited.add(calcIdx)
                        const referencedCalc = calculations[calcIdx]
                        if (referencedCalc && isCalcFlow(referencedCalc.formula, visited)) {
                            return true
                        }
                    }
                }
            }

            return false
        }

        calculations.forEach((calc, idx) => {
            const rRef = `R${idx + 1}`
            types[rRef] = isCalcFlow(calc.formula) ? 'flow' : 'stock'
        })

        return types
    }, [calculations, referenceTypeMap])

    // Input management hook
    const inputManagement = useInputManagement({
        config,
        keyPeriods,
        setKeyPeriods,
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
        setActiveTab,
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
        setCalculations,
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
        forwardFillArray,
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
