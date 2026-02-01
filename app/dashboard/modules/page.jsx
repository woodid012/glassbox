'use client'

import { Plus } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { MODULE_TEMPLATES } from '@/utils/modules'
import { DRAWDOWN_FORMULAS } from '@/utils/modules/constructionFunding'
import { useMemo, useState, useCallback, useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ModuleCard from './components/ModuleCard'
import SubTabBar from '../components/SubTabBar'

export default function ModulesPage() {
    const {
        appState,
        derived,
        uiState,
        setters,
        inputsEditMode
    } = useDashboard()

    const { modules, moduleTemplates, keyPeriods, inputGlass, calculations, indices } = appState
    const { moduleOutputs, timeline, viewHeaders, calculationResults, referenceMap } = derived
    const { viewMode } = uiState
    const { setAppState } = setters

    // --- Active module tab ---
    const [activeModuleId, setActiveModuleId] = useState(null)

    // Auto-select first module if none selected or selected was deleted
    useEffect(() => {
        if (!modules || modules.length === 0) {
            setActiveModuleId(null)
            return
        }
        if (activeModuleId === null || !modules.find(m => m.id === activeModuleId)) {
            setActiveModuleId(modules[0].id)
        }
    }, [modules, activeModuleId])

    // Build tab array with module names, grouped by template for display
    const TEMPLATE_GROUP_ORDER = {
        construction_funding: 0,
        iterative_debt_sizing: 1,
        dsrf: 2,
        reserve_account: 3,
        tax_losses: 4,
        gst_receivable: 5,
        distributions: 6,
        straight_line_amortisation: 7
    }

    const moduleTabs = useMemo(() => {
        const indexed = (modules || []).map((mod, idx) => ({
            id: mod.id,
            label: `M${idx + 1}: ${mod.name}`,
            dataIndex: idx,
            groupOrder: TEMPLATE_GROUP_ORDER[mod.templateId] ?? 99
        }))
        return indexed.slice().sort((a, b) => a.groupOrder - b.groupOrder || a.dataIndex - b.dataIndex)
    }, [modules])

    // Combined reference lookup for input arrays
    const allRefs = useMemo(() => ({
        ...referenceMap,
        ...calculationResults,
        ...moduleOutputs
    }), [referenceMap, calculationResults, moduleOutputs])

    // Get display periods based on viewMode
    const displayPeriods = useMemo(() => {
        if (!viewHeaders || viewHeaders.length === 0) return []
        return viewHeaders
    }, [viewHeaders])

    // Aggregate monthly values to display frequency using viewHeaders
    const aggregateValues = useCallback((monthlyValues, outputType = 'flow') => {
        if (!monthlyValues || !displayPeriods || displayPeriods.length === 0) return []

        return displayPeriods.map(period => {
            const indices = period.indices || [period.index]

            if (outputType === 'stock') {
                // Stock: take last value in period
                const lastIdx = indices[indices.length - 1]
                return monthlyValues[lastIdx] || 0
            } else if (outputType === 'stock_start') {
                // Stock at start of period: take first value in period
                const firstIdx = indices[0]
                return monthlyValues[firstIdx] || 0
            } else {
                // Flow: sum values in period
                let sum = 0
                for (const idx of indices) {
                    sum += monthlyValues[idx] || 0
                }
                return sum
            }
        })
    }, [displayPeriods])

    // --- State updaters ---

    const addModuleFromTemplate = (template) => {
        const newModule = {
            id: Date.now(),
            templateId: template.id,
            name: template.name,
            description: template.description,
            category: template.category,
            inputs: template.inputs.reduce((acc, input) => {
                acc[input.key] = input.default
                return acc
            }, {}),
            outputs: template.outputs
        }
        setAppState(prev => ({
            ...prev,
            modules: [...(prev.modules || []), newModule]
        }))
        // Auto-select the newly added module
        setActiveModuleId(newModule.id)
    }

    const updateModuleName = useCallback((moduleId, name) => {
        setAppState(prev => ({
            ...prev,
            modules: prev.modules.map(m =>
                m.id === moduleId ? { ...m, name } : m
            )
        }))
    }, [setAppState])

    const toggleModuleEnabled = useCallback((moduleId) => {
        setAppState(prev => ({
            ...prev,
            modules: prev.modules.map(m =>
                m.id === moduleId ? { ...m, enabled: m.enabled === false ? true : false } : m
            )
        }))
    }, [setAppState])

    const removeModule = useCallback((moduleId) => {
        setAppState(prev => {
            const remaining = prev.modules.filter(m => m.id !== moduleId)
            return { ...prev, modules: remaining }
        })
        // Fall back to first remaining module
        if (activeModuleId === moduleId) {
            const remaining = (modules || []).filter(m => m.id !== moduleId)
            setActiveModuleId(remaining.length > 0 ? remaining[0].id : null)
        }
    }, [setAppState, activeModuleId, modules])

    const updateInputValue = useCallback((moduleId, inputKey, value) => {
        setAppState(prev => {
            const updatedModules = prev.modules.map(m =>
                m.id === moduleId
                    ? { ...m, inputs: { ...m.inputs, [inputKey]: value }, solvedAt: null }
                    : m
            )

            // If drawdownMethod changed on a construction_funding module, swap formulas
            let updatedCalcs = prev.calculations
            if (inputKey === 'drawdownMethod') {
                const mod = prev.modules.find(m => m.id === moduleId)
                if (mod && mod.templateId === 'construction_funding') {
                    const formulaSet = DRAWDOWN_FORMULAS[value]
                    if (formulaSet) {
                        updatedCalcs = prev.calculations.map(c => {
                            if (formulaSet[c.id] !== undefined) {
                                return { ...c, formula: formulaSet[c.id] }
                            }
                            return c
                        })
                    }
                }
            }

            return {
                ...prev,
                modules: updatedModules,
                calculations: updatedCalcs
            }
        })
    }, [setAppState])

    // --- UI toggle state ---

    const [solvingModuleId, setSolvingModuleId] = useState(null)
    const [showFormulas, setShowFormulas] = useState(new Set())
    const [showDiff, setShowDiff] = useState(new Set())
    const [showSolverInfo, setShowSolverInfo] = useState(new Set())

    const toggleShowFormulas = useCallback((moduleId) => {
        setShowFormulas(prev => {
            const next = new Set(prev)
            next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId)
            return next
        })
    }, [])

    const toggleShowDiff = useCallback((moduleId) => {
        setShowDiff(prev => {
            const next = new Set(prev)
            next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId)
            return next
        })
    }, [])

    const toggleShowSolverInfo = useCallback((moduleId) => {
        setShowSolverInfo(prev => {
            const next = new Set(prev)
            next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId)
            return next
        })
    }, [])

    const solveModule = useCallback((moduleId) => {
        setSolvingModuleId(moduleId)
        setTimeout(() => {
            setAppState(prev => ({
                ...prev,
                modules: prev.modules.map(m =>
                    m.id === moduleId
                        ? { ...m, solvedAt: Date.now() }
                        : m
                )
            }))
            setSolvingModuleId(null)
        }, 100)
    }, [setAppState])

    // Find the active module and its index
    const activeModuleIndex = (modules || []).findIndex(m => m.id === activeModuleId)
    const activeModule = activeModuleIndex >= 0 ? modules[activeModuleIndex] : null

    // Category colors for template chips
    const categoryColors = {
        financing: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
        accounting: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
        default: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
    }

    return (
        <main className="max-w-[1800px] mx-auto px-6 py-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <PageHeader title="Modules" subtitle="Pre-built calculation blocks and custom modules" />

                {/* Template chips - edit mode only */}
                {inputsEditMode && (
                    <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-slate-500 mr-1">Add template:</span>
                            {Object.entries(MODULE_TEMPLATES).map(([templateId, template]) => (
                                <button
                                    key={templateId}
                                    title={template.description}
                                    onClick={() => addModuleFromTemplate({ ...template, id: templateId })}
                                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer ${
                                        categoryColors[template.category] || categoryColors.default
                                    }`}
                                >
                                    <Plus className="w-3 h-3" />
                                    {template.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Module tabs */}
                {moduleTabs.length > 0 && (
                    <SubTabBar
                        tabs={moduleTabs}
                        activeTab={activeModuleId}
                        onChange={setActiveModuleId}
                    />
                )}

                <div className="p-6">
                    {(!modules || modules.length === 0) ? (
                        <EmptyState
                            icon={"📦"}
                            title="No modules added yet"
                            subtitle="Click a template above to add a module"
                            className="border-2 border-dashed border-slate-200 rounded-lg"
                        />
                    ) : activeModule ? (
                        (() => {
                            const template = MODULE_TEMPLATES[activeModule.templateId] || (moduleTemplates || []).find(t => t.id === activeModule.templateId)
                            return (
                                <ModuleCard
                                    key={activeModule.id}
                                    module={activeModule}
                                    moduleIndex={activeModuleIndex}
                                    template={template}
                                    inputsEditMode={inputsEditMode}
                                    keyPeriods={keyPeriods}
                                    inputGlass={inputGlass}
                                    calculations={calculations}
                                    indices={indices}
                                    allRefs={allRefs}
                                    moduleOutputs={moduleOutputs}
                                    calculationResults={calculationResults}
                                    displayPeriods={displayPeriods}
                                    viewMode={viewMode}
                                    solvingModuleId={solvingModuleId}
                                    showFormulas={showFormulas.has(activeModule.id)}
                                    showDiff={showDiff.has(activeModule.id)}
                                    showSolverInfo={showSolverInfo.has(activeModule.id)}
                                    onUpdateModuleName={updateModuleName}
                                    onToggleEnabled={toggleModuleEnabled}
                                    onRemove={removeModule}
                                    onUpdateInput={updateInputValue}
                                    onSolve={solveModule}
                                    onToggleFormulas={toggleShowFormulas}
                                    onToggleDiff={toggleShowDiff}
                                    onToggleSolverInfo={toggleShowSolverInfo}
                                    aggregateValues={aggregateValues}
                                />
                            )
                        })()
                    ) : null}
                </div>
            </div>
        </main>
    )
}
