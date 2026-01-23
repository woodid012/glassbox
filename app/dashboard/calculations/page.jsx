'use client'

import React, { useState, useEffect, memo, useCallback } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, FolderPlus, Pencil } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { getAggregatedValueForArray, calculatePeriodValues, calculateTotal } from '@/utils/valueAggregation'
import { groupInputsBySubgroup } from '@/components/inputs/utils/inputHelpers'
import { DeferredInput } from '@/components/DeferredInput'
import { getModeColorClasses, getCalcTypeColorClasses, getCalcTypeDisplayClasses, getModePrefix, getTabItems, getViewModeLabel } from '@/utils/styleHelpers'

// Format number in accounting style: (1,234.56) for negatives, no negative sign
function formatAccounting(value, decimals = 2) {
    if (value === 0 || value === null || value === undefined) return ''
    const absValue = Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: decimals })
    return value < 0 ? `(${absValue})` : absValue
}

// Calculation row with live formula preview - memoized to prevent unnecessary re-renders
const CalcRow = memo(function CalcRow({
    calc,
    calcIndex,
    calcRef,
    isSelected,
    onSelect,
    onUpdateName,
    onUpdateFormula,
    onUpdateType,
    onRemove,
    expandFormulaToNames,
    evaluateFormula,
    timeline,
    viewHeaders,
    viewMode,
    referenceMap,
    calculationResults,
    calculationErrors
}) {
    const calcType = calc.type || 'flow'
    // Local state for formula - updates preview live, commits on blur
    const [localFormula, setLocalFormula] = useState(calc.formula ?? '')

    useEffect(() => {
        setLocalFormula(calc.formula ?? '')
    }, [calc.formula])

    const handleFormulaCommit = () => {
        if (localFormula !== calc.formula) {
            onUpdateFormula(localFormula)
        }
    }

    // Use local formula for the expanded preview
    const expandedFormula = expandFormulaToNames(localFormula)

    return (
        <div
            onClick={onSelect}
            className={`border rounded-lg p-4 bg-white transition-colors cursor-pointer ${
                isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-200'
                    : 'border-slate-200 hover:border-indigo-300'
            }`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    {/* Label row */}
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium text-rose-600 bg-rose-100">
                            {calcRef}
                        </span>
                        <DeferredInput
                            type="text"
                            value={calc.name}
                            onClick={(e) => e.stopPropagation()}
                            onChange={onUpdateName}
                            className="text-sm font-semibold text-slate-900 bg-slate-100 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Calculation name"
                        />
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                // 3-way cycle: flow → stock → stock_start → flow
                                const nextType = calcType === 'flow' ? 'stock'
                                    : calcType === 'stock' ? 'stock_start'
                                    : 'flow'
                                onUpdateType(nextType)
                            }}
                            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${getCalcTypeColorClasses(calcType)}`}
                            title={calcType === 'flow' ? 'Flow: sum values. Click for stock (end)'
                                : calcType === 'stock' ? 'Stock: end of period value. Click for stock_start'
                                : 'Stock start: start of period value. Click for flow'}
                        >
                            {calcType === 'stock_start' ? 'stock↑' : calcType === 'stock' ? 'stock↓' : calcType}
                        </button>
                        <span className="text-sm text-slate-500">=</span>
                        <span className="text-sm text-slate-600 italic">
                            {expandedFormula || 'Enter formula below...'}
                        </span>
                    </div>
                    {/* Formula input row */}
                    <div className="flex items-center gap-2 pl-8">
                        <span className="text-xs text-slate-400 w-14">Formula:</span>
                        <input
                            type="text"
                            value={localFormula}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setLocalFormula(e.target.value)}
                            onBlur={handleFormulaCommit}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.target.blur()
                                }
                            }}
                            className="flex-1 text-sm font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., V1 * F1 + S1.1"
                        />
                    </div>
                    {/* Preview - evaluates live as user types */}
                    {isSelected && localFormula && (
                        <CalculationPreview
                            calc={{ ...calc, formula: localFormula }}
                            timeline={timeline}
                            viewHeaders={viewHeaders}
                            viewMode={viewMode}
                            referenceMap={referenceMap}
                            calculationResults={calculationResults}
                            evaluateFormula={evaluateFormula}
                            error={calculationErrors?.[calcRef]}
                        />
                    )}
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove()
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
})

export default function CalculationsPage() {
    const {
        viewMode,
        appState,
        setters,
        derived,
        uiState,
        handlers
    } = useDashboard()

    const {
        calculations,
        calculationsTabs,
        calculationsGroups,
        collapsedCalculationsGroups,
        modules,
        inputGlass,
        inputGlassGroups
    } = appState

    const { setAppState, setSelectedCalculationId, setCollapsedCalculationsGroups, setCalculationsTabs } = setters

    // Tab state - active tab (default to 'all' for the ALL tab)
    const [activeTabId, setActiveTabId] = React.useState('all')

    const {
        timeline,
        viewHeaders,
        referenceMap,
        calculationResults,
        calculationErrors,
        calculationTypes,
        autoGeneratedFlags,
        autoGeneratedIndexations,
        expandFormulaToNames,
        evaluateFormula
    } = derived

    const {
        selectedCalculationId
    } = uiState

    // Tab management functions
    const addTab = () => {
        const tabs = calculationsTabs || []
        const newId = tabs.length > 0 ? Math.max(...tabs.map(t => t.id)) + 1 : 1
        setAppState(prev => ({
            ...prev,
            calculationsTabs: [...(prev.calculationsTabs || []), {
                id: newId,
                name: `Sheet ${newId}`
            }]
        }))
        setActiveTabId(newId)
    }

    const updateTab = (tabId, name) => {
        setAppState(prev => ({
            ...prev,
            calculationsTabs: (prev.calculationsTabs || []).map(t =>
                t.id === tabId ? { ...t, name } : t
            )
        }))
    }

    const removeTab = (tabId) => {
        const tabs = calculationsTabs || []
        const tab = tabs.find(t => t.id === tabId)
        const remainingTabs = tabs.filter(t => t.id !== tabId)
        const firstTabId = remainingTabs[0]?.id

        // Count affected items
        const tabCalcs = (calculations || []).filter(c => c.tabId === tabId)
        const tabGroups = (calculationsGroups || []).filter(g => g.tabId === tabId)

        // Build warning message
        let warningMsg = `Are you sure you want to delete the "${tab?.name || 'this'}" tab?`
        if (tabCalcs.length > 0 || tabGroups.length > 0) {
            warningMsg += `\n\nThis tab contains:`
            if (tabGroups.length > 0) warningMsg += `\n• ${tabGroups.length} group(s)`
            if (tabCalcs.length > 0) warningMsg += `\n• ${tabCalcs.length} calculation(s)`
            if (firstTabId) {
                warningMsg += `\n\nThese will be moved to "${remainingTabs[0]?.name}".`
            } else {
                warningMsg += `\n\n⚠️ These will be DELETED (no other tabs exist).`
            }
        }

        if (!window.confirm(warningMsg)) {
            return
        }

        // Move calculations and groups from deleted tab to first remaining tab (if any)
        setAppState(prev => ({
            ...prev,
            calculationsTabs: remainingTabs,
            calculationsGroups: firstTabId
                ? (prev.calculationsGroups || []).map(g =>
                    g.tabId === tabId ? { ...g, tabId: firstTabId } : g
                )
                : (prev.calculationsGroups || []).filter(g => g.tabId !== tabId),
            calculations: firstTabId
                ? (prev.calculations || []).map(c =>
                    c.tabId === tabId ? { ...c, tabId: firstTabId } : c
                )
                : (prev.calculations || []).filter(c => c.tabId !== tabId)
        }))

        if (activeTabId === tabId) {
            setActiveTabId(firstTabId || 'all')
        }
    }

    // Group management functions
    const addCalculationsGroup = () => {
        const groups = calculationsGroups || []
        const newId = groups.length > 0 ? Math.max(...groups.map(g => g.id)) + 1 : 1
        setAppState(prev => ({
            ...prev,
            calculationsGroups: [...(prev.calculationsGroups || []), {
                id: newId,
                tabId: activeTabId,
                name: `Group ${newId}`
            }]
        }))
    }

    const updateCalculationsGroup = (groupId, field, value) => {
        setAppState(prev => ({
            ...prev,
            calculationsGroups: (prev.calculationsGroups || []).map(g =>
                g.id === groupId ? { ...g, [field]: value } : g
            )
        }))
    }

    const removeCalculationsGroup = (groupId) => {
        // Move calculations to first remaining group or delete them
        const groups = calculationsGroups || []
        const remainingGroups = groups.filter(g => g.id !== groupId)
        const firstGroupId = remainingGroups.length > 0 ? remainingGroups[0].id : null

        setAppState(prev => ({
            ...prev,
            calculationsGroups: remainingGroups,
            calculations: firstGroupId
                ? (prev.calculations || []).map(c =>
                    c.groupId === groupId ? { ...c, groupId: firstGroupId } : c
                )
                : (prev.calculations || []).filter(c => c.groupId !== groupId)
        }))
    }

    const toggleGroupCollapse = (groupId) => {
        setCollapsedCalculationsGroups(prev => {
            const newSet = new Set(prev)
            if (newSet.has(groupId)) {
                newSet.delete(groupId)
            } else {
                newSet.add(groupId)
            }
            return newSet
        })
    }

    const addCalculation = (groupId = null) => {
        // If on ALL tab, create a new sheet first then add calc there
        if (activeTabId === 'all') {
            const tabs = calculationsTabs || []
            const newTabId = tabs.length > 0 ? Math.max(...tabs.map(t => t.id)) + 1 : 1
            const newGroupId = (calculationsGroups || []).length > 0
                ? Math.max(...(calculationsGroups || []).map(g => g.id)) + 1
                : 1

            setAppState(prev => ({
                ...prev,
                calculationsTabs: [...(prev.calculationsTabs || []), { id: newTabId, name: `Sheet ${newTabId}` }],
                calculationsGroups: [...(prev.calculationsGroups || []), { id: newGroupId, tabId: newTabId, name: 'Calculations' }],
                calculations: [...(prev.calculations || []), {
                    id: Date.now(),
                    tabId: newTabId,
                    groupId: newGroupId,
                    name: 'New Calculation',
                    formula: '',
                    description: ''
                }]
            }))
            setActiveTabId(newTabId)
            return
        }

        const tabGroups = (calculationsGroups || []).filter(g => g.tabId === activeTabId)
        const targetGroupId = groupId || (tabGroups.length > 0 ? tabGroups[0].id : null)

        // If no groups exist for this tab, create one first
        if (!targetGroupId) {
            const newGroupId = (calculationsGroups || []).length > 0
                ? Math.max(...(calculationsGroups || []).map(g => g.id)) + 1
                : 1
            setAppState(prev => ({
                ...prev,
                calculationsGroups: [...(prev.calculationsGroups || []), { id: newGroupId, tabId: activeTabId, name: 'Calculations' }],
                calculations: [...(prev.calculations || []), {
                    id: Date.now(),
                    tabId: activeTabId,
                    groupId: newGroupId,
                    name: 'New Calculation',
                    formula: '',
                    description: ''
                }]
            }))
            return
        }

        const newCalc = {
            id: Date.now(),
            tabId: activeTabId,
            groupId: targetGroupId,
            name: 'New Calculation',
            formula: '',
            description: ''
        }
        setAppState(prev => ({
            ...prev,
            calculations: [...(prev.calculations || []), newCalc]
        }))
    }

    const updateCalculation = (calcId, field, value) => {
        setAppState(prev => ({
            ...prev,
            calculations: prev.calculations.map(c =>
                c.id === calcId ? { ...c, [field]: value } : c
            )
        }))
    }

    const removeCalculation = (calcId) => {
        setAppState(prev => ({
            ...prev,
            calculations: prev.calculations.filter(c => c.id !== calcId)
        }))
    }

    // Build reference list for sidebar
    const buildReferenceList = () => {
        const activeGroups = inputGlassGroups.filter(group =>
            inputGlass.some(input => input.groupId === group.id)
        )
        const modeIndices = { values: 0, series: 0, constant: 0, timing: 0, lookup: 0 }

        return activeGroups.map(group => {
            const groupInputs = inputGlass.filter(input => input.groupId === group.id)

            // Determine group mode/type - check groupType first, then fall back to entryMode, then input mode
            let normalizedMode
            if (group.groupType === 'timing') {
                normalizedMode = 'timing'
            } else {
                const groupMode = group.entryMode || groupInputs[0]?.mode || 'values'
                // Normalize mode names
                if (groupMode === 'constants') normalizedMode = 'constant'
                else if (groupMode === 'lookup' || groupMode === 'lookup2') normalizedMode = 'lookup'
                else normalizedMode = groupMode
            }

            modeIndices[normalizedMode]++
            const groupRef = `${getModePrefix(normalizedMode)}${modeIndices[normalizedMode]}`

            return {
                group,
                groupRef,
                normalizedMode,
                groupInputs
            }
        })
    }

    const referenceList = buildReferenceList()

    // Build calculation index map for R references
    // Now uses calculation ID directly (not array position) for stable references
    const calcIndexMap = new Map()
    ;(calculations || []).forEach((calc) => {
        calcIndexMap.set(calc.id, calc.id)
    })

    return (
        <main className="max-w-[1800px] mx-auto px-6 py-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Calculations Header */}
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Calculations</h2>
                            <p className="text-sm text-slate-500">Build formulas using input references</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
                                <span className="font-medium text-slate-700">Syntax:</span>
                                <span><code className="bg-slate-200 px-1.5 py-0.5 rounded">V1 + S1</code> Addition</span>
                                <span><code className="bg-slate-200 px-1.5 py-0.5 rounded">V1 * F1</code> Multiply by flag</span>
                                <span><code className="bg-slate-200 px-1.5 py-0.5 rounded">C1 * T1.1</code> Stock × Timing = Flow</span>
                                <span><code className="bg-slate-200 px-1.5 py-0.5 rounded">R1 + R2</code> Chain calculations</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={addCalculationsGroup}
                                className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <FolderPlus className="w-4 h-4" />
                                Add Group
                            </button>
                            <button
                                onClick={() => addCalculation()}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Add Calculation
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex">
                    {/* Available References Panel */}
                    <div className="w-72 border-r border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3">Available References</h3>

                        {/* Input Arrays (excluding timing and lookup - shown separately) */}
                        {referenceList.filter(r => r.normalizedMode !== 'timing' && r.normalizedMode !== 'lookup').map(({ group, groupRef, normalizedMode, groupInputs }) => (
                            <div key={group.id} className="mb-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getModeColorClasses(normalizedMode, true)}`}>
                                        {groupRef}
                                    </span>
                                    <span className="text-xs font-medium text-slate-700">{group.name}</span>
                                </div>
                                <div className="pl-4 space-y-1">
                                    {groupInputs.map((input, idx) => (
                                        <div key={input.id} className="flex items-center gap-2 text-xs text-slate-600">
                                            <span className={`px-1 py-0.5 rounded ${getModeColorClasses(normalizedMode, false)}`}>
                                                {groupRef}.{idx + 1}
                                            </span>
                                            <span className="truncate">{input.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Flags */}
                        {Object.keys(autoGeneratedFlags).length > 0 && (
                            <div className="mb-3 pt-3 border-t border-slate-200">
                                <div className="text-xs font-semibold text-amber-600 mb-2">Flags</div>
                                <div className="space-y-1">
                                    {Object.values(autoGeneratedFlags).map((flag, idx) => (
                                        <div key={flag.id} className="flex items-center gap-2 text-xs text-slate-600">
                                            <span className="px-1 py-0.5 rounded text-amber-600 bg-amber-50">
                                                F{idx + 1}
                                            </span>
                                            <span className="truncate">{flag.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Indexations */}
                        {Object.keys(autoGeneratedIndexations).length > 0 && (
                            <div className="mb-3 pt-3 border-t border-slate-200">
                                <div className="text-xs font-semibold text-cyan-600 mb-2">Indexations</div>
                                <div className="space-y-1">
                                    {Object.values(autoGeneratedIndexations).map((idx, i) => (
                                        <div key={idx.id} className="flex items-center gap-2 text-xs text-slate-600">
                                            <span className="px-1 py-0.5 rounded text-cyan-600 bg-cyan-50">
                                                I{i + 1}
                                            </span>
                                            <span className="truncate">{idx.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Lookups */}
                        {(() => {
                            const lookupGroups = inputGlassGroups.filter(g => g.entryMode === 'lookup' || g.entryMode === 'lookup2')
                            if (lookupGroups.length === 0) return null

                            return (
                                <div className="mb-3 pt-3 border-t border-slate-200">
                                    <div className="text-xs font-semibold text-lime-600 mb-2">Lookups</div>
                                    <div className="space-y-3">
                                        {lookupGroups.map((group, groupIdx) => {
                                            const groupInputs = inputGlass.filter(input => input.groupId === group.id)
                                            const lookupRef = `L${groupIdx + 1}`
                                            const subgroups = group.subgroups || []
                                            const rootInputs = groupInputs.filter(inp => !inp.subgroupId)
                                            const hasActualSubgroups = subgroups.length > 0
                                            const selectedIndices = group.selectedIndices || {}

                                            return (
                                                <div key={group.id}>
                                                    {/* Group Header */}
                                                    <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                                                        <span className="px-1 py-0.5 rounded text-lime-600 bg-lime-100 font-medium">
                                                            {lookupRef}
                                                        </span>
                                                        <span className="truncate font-medium">{group.name}</span>
                                                    </div>

                                                    {/* No subgroups: show inputs directly as L3.1, L3.2, etc. */}
                                                    {!hasActualSubgroups && (
                                                        <div className="pl-3 space-y-0.5">
                                                            {rootInputs.map((input, inputIdx) => {
                                                                const inputRef = `${lookupRef}.${inputIdx + 1}`
                                                                return (
                                                                    <div key={input.id} className="flex items-center gap-2 text-xs text-slate-500">
                                                                        <span className="px-1 py-0.5 rounded text-lime-500 bg-lime-50">
                                                                            {inputRef}
                                                                        </span>
                                                                        <span className="text-slate-400">{input.name}</span>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    )}

                                                    {/* With subgroups: show L3.1 (subgroup), L3.1.1, L3.1.2 (options) */}
                                                    {hasActualSubgroups && (
                                                        <div className="pl-3 space-y-2">
                                                            {groupInputsBySubgroup(groupInputs, group).map((sg, sgIdx) => {
                                                                if (sg.inputs.length === 0) return null

                                                                const key = sg.id ?? 'root'
                                                                const hasSelection = selectedIndices[key] !== undefined
                                                                const selectedIdx = selectedIndices[key] ?? 0
                                                                const selectedInput = sg.inputs[selectedIdx] || sg.inputs[0]
                                                                const subgroupRef = `${lookupRef}.${sgIdx + 1}`

                                                                return (
                                                                    <div key={sg.id ?? 'root'}>
                                                                        {/* Selected value row */}
                                                                        <div className="flex items-center gap-2 text-xs mb-0.5">
                                                                            <span className={`px-1 py-0.5 rounded font-medium ${hasSelection ? 'text-amber-600 bg-amber-50' : 'text-lime-600 bg-lime-50'}`}>
                                                                                {subgroupRef}
                                                                            </span>
                                                                            {sg.name && (
                                                                                <span className="text-slate-500">{sg.name}:</span>
                                                                            )}
                                                                            <span className={hasSelection ? 'text-amber-700 font-medium' : 'text-slate-500'}>{selectedInput?.name}</span>
                                                                            {hasSelection && <span className="text-[10px] text-amber-500">● selected</span>}
                                                                        </div>
                                                                        {/* Individual options */}
                                                                        <div className="pl-4 space-y-0.5">
                                                                            {sg.inputs.map((input, inputIdx) => {
                                                                                const isSelected = hasSelection && inputIdx === selectedIdx
                                                                                const optionRef = `${subgroupRef}.${inputIdx + 1}`
                                                                                return (
                                                                                    <div key={input.id} className="flex items-center gap-2 text-xs text-slate-500">
                                                                                        <span className={`px-1 py-0.5 rounded ${isSelected ? 'text-amber-500 bg-amber-50/50' : 'text-lime-500 bg-lime-50'}`}>
                                                                                            {optionRef}
                                                                                        </span>
                                                                                        <span className="text-slate-400">{input.name}</span>
                                                                                        {isSelected && (
                                                                                            <span className="text-[10px] text-amber-400">●</span>
                                                                                        )}
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Time Constants */}
                        <div className="mb-3 pt-3 border-t border-slate-200">
                            <div className="text-xs font-semibold text-teal-600 mb-2">Time Constants</div>
                            <div className="space-y-0.5">
                                {[
                                    { ref: 'T.DiM', name: 'Days in Month', desc: '28-31' },
                                    { ref: 'T.DiY', name: 'Days in Year', desc: '365/366' },
                                    { ref: 'T.DiQ', name: 'Days in Quarter', desc: '~90-92' },
                                    { ref: 'T.MiY', name: 'Months in Year', desc: '12' },
                                    { ref: 'T.MiQ', name: 'Months in Quarter', desc: '3' },
                                    { ref: 'T.QiY', name: 'Quarters in Year', desc: '4' },
                                    { ref: 'T.WiY', name: 'Weeks in Year', desc: '52/53' },
                                    { ref: 'T.HiD', name: 'Hours in Day', desc: '24' },
                                    { ref: 'T.HiM', name: 'Hours in Month', desc: 'DiM×24' },
                                    { ref: 'T.HiY', name: 'Hours in Year', desc: '8760/8784' },
                                ].map(({ ref, name, desc }) => (
                                    <div key={ref} className="flex items-center gap-2 text-xs text-slate-600">
                                        <span className="px-1 py-0.5 rounded text-teal-600 bg-teal-50 font-mono text-[10px]">
                                            {ref}
                                        </span>
                                        <span className="truncate">{name}</span>
                                        <span className="text-slate-400 text-[10px]">({desc})</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Timing (user-defined flow converters) */}
                        {referenceList.filter(r => r.normalizedMode === 'timing').length > 0 && (
                            <div className="mb-3 pt-3 border-t border-slate-200">
                                <div className="text-xs font-semibold text-teal-600 mb-2">Timing (Custom)</div>
                                <div className="space-y-1">
                                    {referenceList.filter(r => r.normalizedMode === 'timing').map(({ groupRef, groupInputs }) => (
                                        groupInputs.map((input, idx) => (
                                            <div key={input.id} className="flex items-center gap-2 text-xs text-slate-600">
                                                <span className="px-1 py-0.5 rounded text-teal-600 bg-teal-50">
                                                    {groupRef}.{idx + 1}
                                                </span>
                                                <span className="truncate">{input.name}</span>
                                            </div>
                                        ))
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Modules */}
                        {modules && modules.length > 0 && (
                            <div className="mb-3 pt-3 border-t border-slate-200">
                                <div className="text-xs font-semibold text-orange-600 mb-2">Modules</div>
                                <div className="space-y-2">
                                    {modules.map((module, idx) => (
                                        <div key={module.id}>
                                            <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                                                <span className="px-1 py-0.5 rounded text-orange-600 bg-orange-50 font-medium">
                                                    M{idx + 1}
                                                </span>
                                                <span className="truncate font-medium">{module.name}</span>
                                            </div>
                                            <div className="pl-4 space-y-0.5">
                                                {module.outputs && module.outputs.map((output, outputIdx) => (
                                                    <div key={output} className="flex items-center gap-2 text-xs text-slate-500">
                                                        <span className="px-1 py-0.5 rounded text-orange-500 bg-orange-50">
                                                            M{idx + 1}.{outputIdx + 1}
                                                        </span>
                                                        <span className="text-slate-400">{output.replace(/_/g, ' ')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Calculations List - Grouped */}
                    <div className="flex-1 flex flex-col">
                        {/* Tab Bar */}
                        <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center gap-1 overflow-x-auto">
                            {/* ALL Tab - always first, not deletable */}
                            <div
                                onClick={() => setActiveTabId('all')}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg border-b-2 transition-colors cursor-pointer ${
                                    activeTabId === 'all'
                                        ? 'bg-slate-100 border-indigo-500 text-slate-900'
                                        : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <span className="text-sm font-medium">ALL</span>
                            </div>
                            {/* User tabs */}
                            {(calculationsTabs || []).map((tab) => (
                                <div
                                    key={tab.id}
                                    className={`group flex items-center gap-1 px-3 py-1.5 rounded-t-lg border-b-2 transition-colors ${
                                        activeTabId === tab.id
                                            ? 'bg-slate-100 border-indigo-500 text-slate-900'
                                            : 'bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                    }`}
                                >
                                    <DeferredInput
                                        type="text"
                                        value={tab.name}
                                        onChange={(val) => updateTab(tab.id, val)}
                                        onClick={() => setActiveTabId(tab.id)}
                                        className="bg-transparent border-none outline-none text-sm font-medium w-20 min-w-[60px] max-w-[120px]"
                                        style={{ width: `${Math.max(60, tab.name.length * 8)}px` }}
                                    />
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            removeTab(tab.id)
                                        }}
                                        className="p-0.5 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={addTab}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors"
                                title="Add new tab"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto">
                        {(() => {
                            // ALL tab - show all calculations sorted by R index, ungrouped
                            if (activeTabId === 'all') {
                                const allCalcs = calculations || []
                                if (allCalcs.length === 0) {
                                    return (
                                        <div className="text-center py-12 text-slate-500">
                                            <div className="text-4xl mb-3">∑</div>
                                            <p className="text-sm">No calculations yet</p>
                                            <p className="text-xs mt-1">Switch to a sheet tab to create calculations</p>
                                        </div>
                                    )
                                }

                                // Sort by R index
                                const sortedCalcs = [...allCalcs].sort((a, b) => {
                                    const idxA = calcIndexMap.get(a.id) || 0
                                    const idxB = calcIndexMap.get(b.id) || 0
                                    return idxA - idxB
                                })

                                return (
                                    <div className="space-y-2" onClick={() => setSelectedCalculationId(null)}>
                                        <div className="text-xs text-slate-500 mb-4">
                                            All {sortedCalcs.length} calculations sorted by reference (R1 → R{sortedCalcs.length})
                                        </div>
                                        {sortedCalcs.map((calc) => {
                                            const calcIndex = calcIndexMap.get(calc.id) - 1
                                            const isSelected = selectedCalculationId === calc.id

                                            return (
                                                <div
                                                    key={calc.id}
                                                    onClick={(e) => { e.stopPropagation(); setSelectedCalculationId(calc.id) }}
                                                    className={`border rounded-lg p-4 bg-white transition-colors cursor-pointer ${
                                                        isSelected
                                                            ? 'border-indigo-500 ring-2 ring-indigo-200'
                                                            : 'border-slate-200 hover:border-indigo-300'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className="text-xs px-1.5 py-0.5 rounded font-medium text-rose-600 bg-rose-100">
                                                                    R{calcIndexMap.get(calc.id)}
                                                                </span>
                                                                <span className="text-sm font-semibold text-slate-900">
                                                                    {calc.name}
                                                                </span>
                                                                <span className="text-sm text-slate-500">=</span>
                                                                <span className="text-sm text-slate-600 italic">
                                                                    {expandFormulaToNames(calc.formula) || 'No formula'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 pl-8">
                                                                <span className="text-xs text-slate-400 w-14">Formula:</span>
                                                                <code className="text-sm font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded">
                                                                    {calc.formula || '(empty)'}
                                                                </code>
                                                            </div>
                                                            {isSelected && calc.formula && (
                                                                <CalculationPreview
                                                                    calc={calc}
                                                                    timeline={timeline}
                                                                    viewHeaders={viewHeaders}
                                                                    viewMode={viewMode}
                                                                    referenceMap={referenceMap}
                                                                    calculationResults={calculationResults}
                                                                    evaluateFormula={evaluateFormula}
                                                                    error={calculationErrors?.[`R${calcIndexMap.get(calc.id)}`]}
                                                                />
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                // Navigate to the calc's tab and select it
                                                                const targetTab = calc.tabId || (calculationsTabs || [])[0]?.id
                                                                if (targetTab) {
                                                                    setActiveTabId(targetTab)
                                                                }
                                                                setSelectedCalculationId(calc.id)
                                                            }}
                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                            title="Edit calculation"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            }

                            // Get first tab id for backwards compatibility (calcs without tabId go to first tab)
                            const firstTabId = (calculationsTabs || [])[0]?.id
                            const isFirstTab = activeTabId === firstTabId

                            // Filter calculations and groups by active tab
                            const tabCalcs = getTabItems(calculations, activeTabId, isFirstTab)
                            const tabGroups = getTabItems(calculationsGroups, activeTabId, isFirstTab)

                            if (tabCalcs.length === 0 && tabGroups.length === 0) {
                                return (
                                    <div className="text-center py-12 text-slate-500">
                                        <div className="text-4xl mb-3">∑</div>
                                        <p className="text-sm">No calculations in this tab yet</p>
                                        <p className="text-xs mt-1">Click "Add Calculation" to create your first formula</p>
                                    </div>
                                )
                            }
                            return (
                            <div className="space-y-6">
                                {/* Ungrouped calculations (shown at top) */}
                                {(() => {
                                    const ungroupedCalcs = tabCalcs.filter(c =>
                                        !c.groupId || !tabGroups.some(g => g.id === c.groupId)
                                    )
                                    if (ungroupedCalcs.length === 0) return null

                                    return (
                                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                                            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
                                                <span className="text-sm font-semibold text-slate-700">Ungrouped</span>
                                                <span className="text-xs text-slate-500 ml-2">({ungroupedCalcs.length})</span>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                {ungroupedCalcs.map((calc) => {
                                                    const calcIndex = calcIndexMap.get(calc.id) - 1
                                                    return (
                                                        <CalcRow
                                                            key={calc.id}
                                                            calc={calc}
                                                            calcIndex={calcIndex}
                                                            calcRef={`R${calcIndexMap.get(calc.id)}`}
                                                            isSelected={selectedCalculationId === calc.id}
                                                            onSelect={() => setSelectedCalculationId(selectedCalculationId === calc.id ? null : calc.id)}
                                                            onUpdateName={(val) => updateCalculation(calc.id, 'name', val)}
                                                            onUpdateFormula={(val) => updateCalculation(calc.id, 'formula', val)}
                                                            onUpdateType={(val) => updateCalculation(calc.id, 'type', val)}
                                                            onRemove={() => removeCalculation(calc.id)}
                                                            expandFormulaToNames={expandFormulaToNames}
                                                            evaluateFormula={evaluateFormula}
                                                            timeline={timeline}
                                                            viewHeaders={viewHeaders}
                                                            viewMode={viewMode}
                                                            referenceMap={referenceMap}
                                                            calculationResults={calculationResults}
                                                            calculationErrors={calculationErrors}
                                                        />
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )
                                })()}

                                {tabGroups.map((group) => {
                                    const groupCalcs = tabCalcs.filter(c => c.groupId === group.id)
                                    const isCollapsed = collapsedCalculationsGroups?.has(group.id)

                                    return (
                                        <div key={group.id} className="border border-slate-200 rounded-lg overflow-hidden">
                                            {/* Group Header */}
                                            <div
                                                className="flex items-center justify-between px-4 py-3 bg-slate-100 border-b border-slate-200 cursor-pointer hover:bg-slate-150"
                                                onClick={() => toggleGroupCollapse(group.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {isCollapsed ? (
                                                        <ChevronRight className="w-4 h-4 text-slate-500" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4 text-slate-500" />
                                                    )}
                                                    <DeferredInput
                                                        type="text"
                                                        value={group.name}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onChange={(val) => updateCalculationsGroup(group.id, 'name', val)}
                                                        className="text-sm font-semibold text-slate-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white rounded px-1"
                                                    />
                                                    <span className="text-xs text-slate-500">({groupCalcs.length} calculations)</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            addCalculation(group.id)
                                                        }}
                                                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                        title="Add calculation to this group"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                    {(calculationsGroups || []).length > 1 && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                removeCalculationsGroup(group.id)
                                                            }}
                                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                            title="Delete group"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Group Content */}
                                            {!isCollapsed && (
                                                <div className="p-4 space-y-3">
                                                    {groupCalcs.length === 0 ? (
                                                        <div className="text-center py-6 text-slate-400 text-sm">
                                                            No calculations in this group
                                                        </div>
                                                    ) : (
                                                        groupCalcs.map((calc) => {
                                                            const calcIndex = calcIndexMap.get(calc.id) - 1
                                                            return (
                                                                <CalcRow
                                                                    key={calc.id}
                                                                    calc={calc}
                                                                    calcIndex={calcIndex}
                                                                    calcRef={`R${calcIndexMap.get(calc.id)}`}
                                                                    isSelected={selectedCalculationId === calc.id}
                                                                    onSelect={() => setSelectedCalculationId(selectedCalculationId === calc.id ? null : calc.id)}
                                                                    onUpdateName={(val) => updateCalculation(calc.id, 'name', val)}
                                                                    onUpdateFormula={(val) => updateCalculation(calc.id, 'formula', val)}
                                                                    onUpdateType={(val) => updateCalculation(calc.id, 'type', val)}
                                                                    onRemove={() => removeCalculation(calc.id)}
                                                                    expandFormulaToNames={expandFormulaToNames}
                                                                    evaluateFormula={evaluateFormula}
                                                                    timeline={timeline}
                                                                    viewHeaders={viewHeaders}
                                                                    viewMode={viewMode}
                                                                    referenceMap={referenceMap}
                                                                    calculationResults={calculationResults}
                                                                    calculationErrors={calculationErrors}
                                                                />
                                                            )
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                            )
                        })()}
                        </div>
                    </div>
                </div>

                {/* Help Text */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-6 text-xs text-slate-600">
                        <span className="font-medium text-slate-700">Formula syntax:</span>
                        <span><code className="bg-slate-200 px-1.5 py-0.5 rounded">V1 + S1</code> Addition</span>
                        <span><code className="bg-slate-200 px-1.5 py-0.5 rounded">V1 * F1</code> Multiply by flag</span>
                        <span><code className="bg-slate-200 px-1.5 py-0.5 rounded">V1.1 - V1.2</code> Sub-item math</span>
                        <span><code className="bg-slate-200 px-1.5 py-0.5 rounded">R1 + R2</code> Chain calculations</span>
                    </div>
                </div>

                {/* Generated Time Series Preview */}
                {calculations && calculations.length > 0 && (
                    <CalculationsTimeSeriesPreview
                        calculations={calculations}
                        calculationsGroups={calculationsGroups}
                        calculationResults={calculationResults}
                        calculationTypes={calculationTypes}
                        viewHeaders={viewHeaders}
                        viewMode={viewMode}
                        calcIndexMap={calcIndexMap}
                    />
                )}
            </div>
        </main>
    )
}

// Memoized to prevent re-renders when parent state changes but props are same
const CalculationPreview = memo(function CalculationPreview({ calc, timeline, viewHeaders, viewMode, referenceMap, calculationResults, evaluateFormula, error }) {
    // Evaluate the formula live for real-time preview as user types
    const liveResult = evaluateFormula ? evaluateFormula(calc.formula, calculationResults) : null
    // Use calc.id for stable reference (not array position)
    const resultArray = liveResult?.values || calculationResults[`R${calc.id}`] || []
    const liveError = liveResult?.error || error
    const calcType = calc.type || 'flow'

    // Show error if present
    if (liveError) {
        return (
            <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="text-sm font-medium text-red-700">Formula Error</div>
                    <div className="text-xs text-red-600 mt-1">{liveError}</div>
                </div>
            </div>
        )
    }

    // Use viewHeaders if available, otherwise fall back to monthly
    const headers = viewHeaders || []

    // Calculate aggregated values per viewHeader period
    const aggregatedValues = calculatePeriodValues(resultArray, headers, viewMode, calcType)

    // Find first non-zero aggregated period to start preview
    let startHeaderIndex = 0
    for (let i = 0; i < aggregatedValues.length; i++) {
        if (aggregatedValues[i] !== 0) {
            startHeaderIndex = i
            break
        }
    }

    // For sample calculation, use first raw month index of the first non-zero period
    const sampleMonthIndex = headers[startHeaderIndex]?.index ?? 0
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const formatPeriod = (idx) => {
        const year = timeline.year?.[idx]
        const month = timeline.month?.[idx]
        if (year !== undefined && month !== undefined) {
            return `${MONTH_NAMES[month - 1]} ${String(year).slice(-2)}`
        }
        return `P${idx + 1}`
    }
    const periodLabel = formatPeriod(sampleMonthIndex)

    // Build sample calculation breakdown
    const allRefs = { ...referenceMap, ...calculationResults }
    const sortedRefs = Object.keys(allRefs).sort((a, b) => b.length - a.length)
    let substitutedFormula = calc.formula
    for (const ref of sortedRefs) {
        const value = allRefs[ref]?.[sampleMonthIndex] ?? 0
        const formattedValue = value.toLocaleString('en-AU', { maximumFractionDigits: 2 })
        const regex = new RegExp(`\\b${ref.replace('.', '\\.')}\\b`, 'g')
        substitutedFormula = substitutedFormula.replace(regex, formattedValue)
    }
    const resultValue = resultArray[sampleMonthIndex] ?? 0

    const previewCount = Math.min(5, headers.length - startHeaderIndex)
    const viewModeLabel = getViewModeLabel(viewMode)

    return (
        <div className="mt-3 pt-3 border-t border-slate-100">
            {/* Sample Calculation */}
            <div className="mb-3 p-3 bg-slate-50 rounded-lg">
                <div className="text-xs text-slate-500 mb-2">Sample calculation ({periodLabel}):</div>
                <div className="font-mono text-sm space-y-1">
                    <div className="text-slate-600">{calc.formula}</div>
                    <div className="text-slate-500">= {substitutedFormula}</div>
                    <div className="text-rose-600 font-semibold">= {resultValue.toLocaleString('en-AU', { maximumFractionDigits: 2 })}</div>
                </div>
            </div>

            {/* Preview values - aggregated by viewMode */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-16">{viewModeLabel}:</span>
                <div className="flex gap-1">
                    {Array.from({ length: previewCount }).map((_, i) => {
                        const headerIdx = startHeaderIndex + i
                        const header = headers[headerIdx]
                        const value = aggregatedValues[headerIdx] ?? 0
                        return (
                            <div key={headerIdx} className="flex flex-col items-center">
                                <span className="text-[10px] text-slate-400">{header?.label}</span>
                                <span className={`text-xs font-mono px-2 py-1 rounded ${
                                    value === 0 ? 'bg-slate-100 text-slate-400' : 'bg-rose-50 text-rose-700'
                                }`}>
                                    {value.toLocaleString('en-AU', { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        )
                    })}
                    {headers.length > 5 && (
                        <span className="text-xs text-slate-400 self-end pb-1">...</span>
                    )}
                </div>
            </div>
        </div>
    )
})

// Memoized time series preview table
const CalculationsTimeSeriesPreview = memo(function CalculationsTimeSeriesPreview({ calculations, calculationsGroups, calculationResults, calculationTypes, viewHeaders, viewMode, calcIndexMap }) {
    const viewModeLabel = getViewModeLabel(viewMode)

    // Calculate grand total across all calculations (only sum flows, not stocks)
    const grandTotalByPeriod = viewHeaders.map((header) => {
        return calculations.reduce((sum, calc) => {
            const calcRef = `R${calcIndexMap.get(calc.id)}`
            const resultArray = calculationResults[calcRef] || []
            const calcType = calculationTypes?.[calcRef] || 'flow'

            // Only include flows in the grand total (stocks shouldn't be summed)
            if (calcType === 'stock') return sum

            if (viewMode === 'M') {
                return sum + (resultArray[header.index] ?? 0)
            } else {
                return sum + getAggregatedValueForArray(resultArray, header.indices || [header.index], calcType)
            }
        }, 0)
    })
    const overallTotal = grandTotalByPeriod.reduce((sum, v) => sum + v, 0)

    return (
        <div className="border-t border-slate-200 pt-4 pb-4 px-6">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-3">
                Generated Time Series Preview ({viewModeLabel})
            </div>
            <div className="overflow-x-auto">
                <table className="text-sm table-fixed">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[240px] min-w-[240px] sticky left-0 z-20 bg-slate-50">
                                Calculation
                            </th>
                            <th className="text-right py-1 px-3 text-xs font-semibold text-slate-500 uppercase w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-slate-50 border-r border-slate-300">
                                Total
                            </th>
                            {viewHeaders.map((header, i) => (
                                <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[55px] w-[55px]">
                                    {header.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Grouped calculations - group header without totals */}
                        {(calculationsGroups || []).map((group) => {
                            const groupCalcs = calculations.filter(c => c.groupId === group.id)
                            if (groupCalcs.length === 0) return null

                            return (
                                <React.Fragment key={group.id}>
                                    {/* Group header row - no totals */}
                                    <tr className="bg-rose-50 border-b border-rose-200">
                                        <td colSpan={2 + viewHeaders.length} className="py-1.5 px-3 text-xs font-semibold text-rose-800 sticky left-0 z-20 bg-rose-50">
                                            {group.name}
                                        </td>
                                    </tr>
                                    {/* Individual calculation rows */}
                                    {groupCalcs.map((calc) => {
                                        const calcRef = `R${calcIndexMap.get(calc.id)}`
                                        const resultArray = calculationResults[calcRef] || []
                                        const calcType = calculationTypes?.[calcRef] || 'flow'
                                        const periodValues = calculatePeriodValues(resultArray, viewHeaders, viewMode, calcType)
                                        const total = calculateTotal(periodValues, calcType)

                                        return (
                                            <tr key={calc.id} className="border-b border-slate-100 hover:bg-rose-50/30">
                                                <td className="py-1 px-3 text-xs text-slate-700 w-[240px] min-w-[240px] sticky left-0 z-20 bg-white">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs px-1.5 py-0.5 rounded font-medium text-rose-600 bg-rose-100">
                                                            {calcRef}
                                                        </span>
                                                        <span className="truncate">{calc.name}</span>
                                                        <span className={`text-[10px] px-1 py-0.5 rounded ${getCalcTypeDisplayClasses(calcType)}`}>
                                                            {calcType}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className={`py-1 px-3 text-right text-xs font-medium w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-white border-r border-slate-200 ${total < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                                    {formatAccounting(total, 2)}
                                                </td>
                                                {periodValues.map((val, i) => (
                                                    <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${val < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                                        {formatAccounting(val, 2)}
                                                    </td>
                                                ))}
                                            </tr>
                                        )
                                    })}
                                </React.Fragment>
                            )
                        })}

                        {/* Ungrouped calculations */}
                        {(() => {
                            const ungroupedCalcs = calculations.filter(c =>
                                !c.groupId || !(calculationsGroups || []).some(g => g.id === c.groupId)
                            )
                            if (ungroupedCalcs.length === 0) return null

                            return (
                                <React.Fragment>
                                    {/* Ungrouped header row */}
                                    <tr className="bg-rose-50 border-b border-rose-200">
                                        <td colSpan={2 + viewHeaders.length} className="py-1.5 px-3 text-xs font-semibold text-rose-800 sticky left-0 z-20 bg-rose-50">
                                            Ungrouped
                                        </td>
                                    </tr>
                                    {ungroupedCalcs.map((calc) => {
                                const calcRef = `R${calcIndexMap.get(calc.id)}`
                                const resultArray = calculationResults[calcRef] || []
                                const calcType = calculationTypes?.[calcRef] || 'flow'
                                const periodValues = calculatePeriodValues(resultArray, viewHeaders, viewMode, calcType)
                                const total = calculateTotal(periodValues, calcType)

                                return (
                                    <tr key={calc.id} className="border-b border-slate-100 hover:bg-rose-50/30">
                                        <td className="py-1 px-3 text-xs text-slate-700 w-[240px] min-w-[240px] sticky left-0 z-20 bg-white">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs px-1.5 py-0.5 rounded font-medium text-rose-600 bg-rose-100">
                                                    {calcRef}
                                                </span>
                                                <span className="truncate">{calc.name}</span>
                                                <span className={`text-[10px] px-1 py-0.5 rounded ${getCalcTypeDisplayClasses(calcType)}`}>
                                                    {calcType}
                                                </span>
                                            </div>
                                        </td>
                                        <td className={`py-1 px-3 text-right text-xs font-medium w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-white border-r border-slate-200 ${total < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                            {formatAccounting(total, 2)}
                                        </td>
                                        {periodValues.map((val, i) => (
                                            <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${val < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                                {formatAccounting(val, 2)}
                                            </td>
                                        ))}
                                    </tr>
                                )
                            })}
                                </React.Fragment>
                            )
                        })()}

                        {/* Grand Total row */}
                        <tr className="bg-slate-100">
                            <td className="py-1.5 px-3 text-xs font-semibold text-slate-700 w-[240px] min-w-[240px] sticky left-0 z-20 bg-slate-100">
                                Grand Total
                            </td>
                            <td className={`py-1.5 px-3 text-right text-xs font-bold w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-slate-100 border-r border-slate-300 ${overallTotal < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                {formatAccounting(overallTotal, 2)}
                            </td>
                            {grandTotalByPeriod.map((val, i) => (
                                <td key={i} className={`py-1 px-0.5 text-right text-[11px] font-semibold min-w-[55px] w-[55px] border-r border-slate-100 ${val < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                                    {formatAccounting(val, 1)}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
})
