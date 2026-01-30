'use client'

import { Plus } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { MODULE_TEMPLATES } from '@/utils/modules'
import { DRAWDOWN_FORMULAS } from '@/utils/modules/constructionFunding'
import { useMemo, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ModuleCard from './components/ModuleCard'

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
        setAppState(prev => ({
            ...prev,
            modules: prev.modules.filter(m => m.id !== moduleId)
        }))
    }, [setAppState])

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

    return (
        <main className="max-w-[1800px] mx-auto px-6 py-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Modules Header */}
                <PageHeader title="Modules" subtitle="Pre-built calculation blocks and custom modules" />

                <div className="p-6">
                    {/* Pre-built Templates Section - only in edit mode */}
                    {inputsEditMode && (
                    <div className="mb-8">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Pre-built Templates</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Object.entries(MODULE_TEMPLATES).map(([templateId, template]) => (
                                <div
                                    key={templateId}
                                    className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer"
                                    onClick={() => addModuleFromTemplate({ ...template, id: templateId })}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <h4 className="font-semibold text-slate-900">{template.name}</h4>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                template.category === 'financing' ? 'bg-blue-100 text-blue-700' :
                                                template.category === 'accounting' ? 'bg-purple-100 text-purple-700' :
                                                'bg-green-100 text-green-700'
                                            }`}>
                                                {template.category}
                                            </span>
                                        </div>
                                        <Plus className="w-5 h-5 text-slate-400" />
                                    </div>
                                    <p className="text-sm text-slate-500 mb-3">{template.description}</p>
                                    <div className="text-xs text-slate-400">
                                        Outputs: {template.outputs.map(o => typeof o === 'string' ? o : o.key).join(', ')}
                                        {template.convertedOutputs && (
                                            <span className="ml-1 text-green-600">+ {template.convertedOutputs.length} calcs</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    )}

                    {/* Active Modules Section */}
                    <div>
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">
                            Active Modules
                            {(modules || []).length > 0 && (
                                <span className="ml-2 text-xs font-normal text-slate-500">
                                    ({modules.length} {modules.length === 1 ? 'module' : 'modules'})
                                </span>
                            )}
                        </h3>

                        {(!modules || modules.length === 0) ? (
                            <EmptyState
                                icon={"📦"}
                                title="No modules added yet"
                                subtitle="Click a template above to add a module"
                                className="border-2 border-dashed border-slate-200 rounded-lg"
                            />
                        ) : (
                            <div className="space-y-4">
                                {modules.map((module, moduleIndex) => {
                                    const template = MODULE_TEMPLATES[module.templateId] || (moduleTemplates || []).find(t => t.id === module.templateId)
                                    return (
                                        <ModuleCard
                                            key={module.id}
                                            module={module}
                                            moduleIndex={moduleIndex}
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
                                            showFormulas={showFormulas.has(module.id)}
                                            showDiff={showDiff.has(module.id)}
                                            showSolverInfo={showSolverInfo.has(module.id)}
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
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    )
}
