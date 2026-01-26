'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import * as helpers from '../../../utils/timeArrayHelpers'
import { getDefaultState } from '../../../utils/glassInputsState'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useInputManagement } from '@/hooks/useInputManagement'
import { useInputArrays } from '@/hooks/useInputArrays'
import { MODULE_TEMPLATES } from '@/utils/moduleTemplates'
import { useReferenceMap } from './useReferenceMap'
import { useUnifiedCalculation } from './useUnifiedCalculation'

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
    // EXTRACTED HOOKS FOR BETTER MEMOIZATION
    // ============================================

    // Reference Map Hook - builds V, S, C, F, I, T, L references
    const { referenceMap } = useReferenceMap({
        inputGlass,
        inputGlassGroups,
        inputGlassArrays,
        autoGeneratedFlags,
        autoGeneratedIndexations,
        timeline
    })

    // Unified Calculation Hook - evaluates all calculations and modules in a single pass
    // Uses topological sort to handle dependencies correctly (no more 3-pass architecture)
    // Fast enough (~5ms) to run on every change - no caching needed
    const {
        calculationResults: finalCalculationResults,
        moduleOutputs: allModuleOutputs,
        calculationErrors,
        calculationTypes,
        evaluateFormula,
        previewFormula
    } = useUnifiedCalculation({
        calculations,
        modules,
        referenceMap,
        timeline
    })

    // Build reference type map (flow vs stock vs flowConverter) for each reference
    const referenceTypeMap = useMemo(() => {
        const types = {}

        const activeGroups = inputGlassGroups.filter(group =>
            inputGlass.some(input => input.groupId === group.id)
        )
        const modeIndices = { values: 0, series: 0, constant: 0, timing: 0, lookup: 0 }

        activeGroups.forEach(group => {
            const groupInputs = inputGlass.filter(input => input.groupId === group.id)

            let normalizedMode
            if (group.groupType === 'timing') {
                normalizedMode = 'timing'
            } else if (group.groupType === 'constant') {
                normalizedMode = 'constant'
            } else {
                const groupMode = group.entryMode || groupInputs[0]?.mode || 'values'
                if (groupMode === 'lookup' || groupMode === 'lookup2') normalizedMode = 'lookup'
                else normalizedMode = groupMode
            }

            modeIndices[normalizedMode]++
            const modePrefix = normalizedMode === 'timing' ? 'T' :
                              normalizedMode === 'series' ? 'S' :
                              normalizedMode === 'constant' ? 'C' :
                              normalizedMode === 'lookup' ? 'L' : 'V'
            const groupRef = `${modePrefix}${modeIndices[normalizedMode]}`

            let groupIsFlow = false
            let groupHasFlowConverter = false

            groupInputs.forEach((input) => {
                const inputNum = group.id === 100 ? input.id - 99 : input.id
                const entryMode = input.entryMode || input.mode || 'values'
                const isConstantMode = entryMode === 'constant'

                if (input.flowConverter || normalizedMode === 'timing') {
                    types[`${groupRef}.${inputNum}`] = 'flowConverter'
                    groupHasFlowConverter = true
                    return
                }

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
                    spreadMethod = 'spread'
                }

                const isFlow = spreadMethod === 'spread'
                types[`${groupRef}.${inputNum}`] = isFlow ? 'flow' : 'stock'

                if (isFlow) groupIsFlow = true
            })

            if (groupHasFlowConverter) {
                types[groupRef] = 'flowConverter'
            } else if (groupIsFlow) {
                types[groupRef] = 'flow'
            } else {
                types[groupRef] = 'stock'
            }
        })

        // Flags are always stock (binary 0/1 values)
        Object.values(autoGeneratedFlags).forEach((flag) => {
            const idMatch = flag.id?.match(/flag_keyperiod_(\d+)/)
            if (!idMatch) return
            const refNum = parseInt(idMatch[1], 10)
            types[`F${refNum}`] = 'stock'
            if (flag.startArray) types[`F${refNum}.Start`] = 'stock'
            if (flag.endArray) types[`F${refNum}.End`] = 'stock'
        })

        // Indexations are always stock (multiplier factors)
        Object.values(autoGeneratedIndexations).forEach((indexation) => {
            const idMatch = indexation.id?.match(/index_(\d+)/)
            if (!idMatch) return
            const refNum = parseInt(idMatch[1], 10)
            types[`I${refNum}`] = 'stock'
        })

        // Time conversion constants are flowConverters
        const timeConstants = ['T.DiM', 'T.DiY', 'T.MiY', 'T.QiY', 'T.WiY', 'T.HiD', 'T.HiM', 'T.HiY', 'T.MiQ', 'T.DiQ', 'T.QE', 'T.CYE', 'T.FYE']
        timeConstants.forEach(tc => {
            types[tc] = 'flowConverter'
        })

        // Lookups are stock
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
                    rootInputs.forEach((_, inputIdx) => {
                        types[`${lookupRef}.${inputIdx + 1}`] = 'stock'
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
                const templateKey = module.templateId
                const template = MODULE_TEMPLATES[templateKey]
                if (template && template.outputs) {
                    template.outputs.forEach((output, outputIdx) => {
                        types[`M${idx + 1}.${outputIdx + 1}`] = output.type || 'flow'
                    })
                }
            })
        }

        return types
    }, [inputGlass, inputGlassGroups, autoGeneratedFlags, autoGeneratedIndexations, modules])

    // Build reference-to-name map for formula expansion
    // Also pre-computes sorted refs and regex patterns for performance
    const referenceNameMapData = useMemo(() => {
        const names = {}

        const activeGroups = inputGlassGroups.filter(group =>
            inputGlass.some(input => input.groupId === group.id)
        )
        const modeIndices = { values: 0, series: 0, constant: 0, timing: 0, lookup: 0 }

        activeGroups.forEach(group => {
            const groupInputs = inputGlass.filter(input => input.groupId === group.id)

            let normalizedMode
            if (group.groupType === 'timing') {
                normalizedMode = 'timing'
            } else if (group.groupType === 'constant') {
                normalizedMode = 'constant'
            } else {
                const groupMode = group.entryMode || groupInputs[0]?.mode || 'values'
                if (groupMode === 'lookup' || groupMode === 'lookup2') normalizedMode = 'lookup'
                else normalizedMode = groupMode
            }

            modeIndices[normalizedMode]++
            const modePrefix = normalizedMode === 'timing' ? 'T' :
                              normalizedMode === 'series' ? 'S' :
                              normalizedMode === 'constant' ? 'C' :
                              normalizedMode === 'lookup' ? 'L' : 'V'
            const groupRef = `${modePrefix}${modeIndices[normalizedMode]}`

            names[groupRef] = group.name

            groupInputs.forEach((input) => {
                const inputNum = group.id === 100 ? input.id - 99 : input.id
                names[`${groupRef}.${inputNum}`] = input.name
            })
        })

        // Flags
        Object.values(autoGeneratedFlags).forEach((flag) => {
            const idMatch = flag.id?.match(/flag_keyperiod_(\d+)/)
            if (!idMatch) return
            const refNum = parseInt(idMatch[1], 10)
            names[`F${refNum}`] = flag.name
            if (flag.startArray) names[`F${refNum}.Start`] = `${flag.name} Start`
            if (flag.endArray) names[`F${refNum}.End`] = `${flag.name} End`
        })

        // Indexations
        Object.values(autoGeneratedIndexations).forEach((indexation) => {
            const idMatch = indexation.id?.match(/index_(\d+)/)
            if (!idMatch) return
            const refNum = parseInt(idMatch[1], 10)
            names[`I${refNum}`] = indexation.name
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

                names[lookupRef] = group.name

                if (!hasActualSubgroups) {
                    rootInputs.forEach((input, inputIdx) => {
                        names[`${lookupRef}.${inputIdx + 1}`] = `${group.name} - ${input.name}`
                    })
                } else {
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
                const templateKey = module.templateId
                const template = MODULE_TEMPLATES[templateKey]
                if (template && template.outputs) {
                    template.outputs.forEach((output, outputIdx) => {
                        names[`M${idx + 1}.${outputIdx + 1}`] = `${module.name} - ${output.label}`
                    })
                }
            })
        }

        if (calculations) {
            calculations.forEach((calc) => {
                names[`R${calc.id}`] = calc.name
            })
        }

        // Pre-compute sorted refs and regex patterns for expandFormulaToNames
        // This avoids O(n log n) sort on every keystroke
        const sortedRefs = Object.keys(names).sort((a, b) => b.length - a.length)
        const refPatterns = sortedRefs.map(ref => ({
            ref,
            name: names[ref],
            regex: new RegExp(`\\b${ref.replace(/\./g, '\\.')}\\b`, 'g')
        }))

        return { names, sortedRefs, refPatterns }
    }, [inputGlass, inputGlassGroups, autoGeneratedFlags, autoGeneratedIndexations, modules, calculations])

    // Extract names map for backward compatibility
    const referenceNameMap = referenceNameMapData.names

    // Expand a formula to show input names instead of references
    // Uses pre-computed sorted refs and regex patterns for performance
    const expandFormulaToNames = useCallback((formula) => {
        if (!formula || !formula.trim()) return ''

        let expanded = formula
        const { refPatterns } = referenceNameMapData

        for (const { name, regex } of refPatterns) {
            if (name) {
                regex.lastIndex = 0  // Reset regex state
                expanded = expanded.replace(regex, name)
            }
        }

        return expanded
    }, [referenceNameMapData])

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
        calculationResults: finalCalculationResults,
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
        evaluateFormula,
        previewFormula
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
