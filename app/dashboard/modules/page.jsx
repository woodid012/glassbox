'use client'

import { Plus, Trash2, Play, RefreshCw } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { DeferredInput } from '@/components/DeferredInput'
import { MODULE_TEMPLATES } from '@/utils/moduleTemplates'
import { formatValue } from '@/utils/valueAggregation'
import { useMemo, useState } from 'react'

export default function ModulesPage() {
    const {
        appState,
        derived,
        uiState,
        setters
    } = useDashboard()

    const { modules, moduleTemplates, keyPeriods } = appState
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
    const aggregateValues = (monthlyValues, outputType = 'flow') => {
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
    }

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

    const updateModuleName = (moduleId, name) => {
        setAppState(prev => ({
            ...prev,
            modules: prev.modules.map(m =>
                m.id === moduleId ? { ...m, name } : m
            )
        }))
    }

    const removeModule = (moduleId) => {
        setAppState(prev => ({
            ...prev,
            modules: prev.modules.filter(m => m.id !== moduleId)
        }))
    }

    const updateInputValue = (moduleId, inputKey, value) => {
        setAppState(prev => ({
            ...prev,
            modules: prev.modules.map(m =>
                m.id === moduleId
                    ? { ...m, inputs: { ...m.inputs, [inputKey]: value }, solvedAt: null } // Clear solved state when inputs change
                    : m
            )
        }))
    }

    const [solvingModuleId, setSolvingModuleId] = useState(null)

    const solveModule = (moduleId) => {
        setSolvingModuleId(moduleId)
        // Small delay to show the solving state
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
    }

    return (
        <main className="max-w-[1800px] mx-auto px-6 py-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Modules Header */}
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Modules</h2>
                            <p className="text-sm text-slate-500">Pre-built calculation blocks and custom modules</p>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {/* Pre-built Templates Section */}
                    <div className="mb-8">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Pre-built Templates</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(moduleTemplates || []).map(template => (
                                <div
                                    key={template.id}
                                    className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer"
                                    onClick={() => addModuleFromTemplate(template)}
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
                                        Outputs: {template.outputs.join(', ')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

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
                            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
                                <div className="text-4xl mb-3">📦</div>
                                <p className="text-sm text-slate-500">No modules added yet</p>
                                <p className="text-xs text-slate-400 mt-1">Click a template above to add a module</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {modules.map((module, moduleIndex) => {
                                    const template = (moduleTemplates || []).find(t => t.id === module.templateId)
                                    return (
                                        <div
                                            key={module.id}
                                            className="border border-slate-200 rounded-lg p-4 bg-white"
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs px-1.5 py-0.5 rounded font-medium text-orange-600 bg-orange-100">
                                                        M{moduleIndex + 1}
                                                    </span>
                                                    <DeferredInput
                                                        type="text"
                                                        value={module.name}
                                                        onChange={(val) => updateModuleName(module.id, val)}
                                                        className="text-sm font-semibold text-slate-900 bg-slate-100 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                        module.category === 'financing' ? 'bg-blue-100 text-blue-700' :
                                                        module.category === 'accounting' ? 'bg-purple-100 text-purple-700' :
                                                        'bg-green-100 text-green-700'
                                                    }`}>
                                                        {module.category}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => removeModule(module.id)}
                                                    className="p-1.5 hover:bg-red-100 rounded text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* Module Inputs */}
                                            {template && (
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                                    {template.inputs.map(inputDef => {
                                                        // Hide DB Multiplier when Straight Line is selected
                                                        if (inputDef.key === 'dbMultiplier' &&
                                                            (module.inputs?.method || 'straight_line') === 'straight_line') {
                                                            return null
                                                        }
                                                        return (
                                                            <div key={inputDef.key}>
                                                                <label className="text-xs text-slate-500 mb-1 block">{inputDef.label}</label>

                                                                {/* Period type - show key period dropdown */}
                                                                {inputDef.type === 'period' ? (
                                                                    <select
                                                                        value={module.inputs[inputDef.key] || ''}
                                                                        onChange={(e) => updateInputValue(module.id, inputDef.key, e.target.value)}
                                                                        className="w-full text-sm border border-emerald-200 bg-emerald-50 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                                                    >
                                                                        <option value="">Select Key Period...</option>
                                                                        {keyPeriods.map(kp => (
                                                                            <option key={kp.id} value={kp.id}>{kp.name}</option>
                                                                        ))}
                                                                    </select>
                                                                ) : inputDef.type === 'select' ? (
                                                                    <select
                                                                        value={module.inputs[inputDef.key] || inputDef.default}
                                                                        onChange={(e) => updateInputValue(module.id, inputDef.key, e.target.value)}
                                                                        className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                    >
                                                                        {(Array.isArray(inputDef.options) && typeof inputDef.options[0] === 'object'
                                                                            ? inputDef.options
                                                                            : inputDef.options.map(opt => ({ value: opt, label: opt }))
                                                                        ).map(opt => (
                                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                        ))}
                                                                    </select>
                                                                ) : inputDef.type === 'boolean' ? (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={module.inputs[inputDef.key] ?? inputDef.default}
                                                                        onChange={(e) => updateInputValue(module.id, inputDef.key, e.target.checked)}
                                                                        className="w-4 h-4"
                                                                    />
                                                                ) : inputDef.type === 'date' ? (
                                                                    <input
                                                                        type="date"
                                                                        value={module.inputs[inputDef.key] ?? inputDef.default ?? ''}
                                                                        onChange={(e) => updateInputValue(module.id, inputDef.key, e.target.value)}
                                                                        className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                    />
                                                                ) : inputDef.type === 'text' ? (
                                                                    /* Plain text input for names/labels */
                                                                    <input
                                                                        type="text"
                                                                        value={module.inputs[inputDef.key] ?? inputDef.default ?? ''}
                                                                        onChange={(e) => updateInputValue(module.id, inputDef.key, e.target.value)}
                                                                        placeholder={inputDef.placeholder || ''}
                                                                        className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                    />
                                                                ) : (
                                                                    /* Unified formula input - accepts numbers, references, or formulas */
                                                                    <DeferredInput
                                                                        type="text"
                                                                        value={module.inputs[inputDef.key] ?? inputDef.default ?? ''}
                                                                        onChange={(val) => updateInputValue(module.id, inputDef.key, val)}
                                                                        placeholder="e.g., 1000 or V1.1 or V1 * 0.08"
                                                                        className="w-full text-sm font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                    />
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}

                                            {/* Solve Button for iterative modules */}
                                            {module.templateId === 'iterative_debt_sizing' && (
                                                <div className="flex items-center gap-3 mb-4">
                                                    <button
                                                        onClick={() => solveModule(module.id)}
                                                        disabled={solvingModuleId === module.id}
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                                                            solvingModuleId === module.id
                                                                ? 'bg-indigo-100 text-indigo-400 cursor-wait'
                                                                : module.solvedAt
                                                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                        }`}
                                                    >
                                                        {solvingModuleId === module.id ? (
                                                            <>
                                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                                Solving...
                                                            </>
                                                        ) : module.solvedAt ? (
                                                            <>
                                                                <RefreshCw className="w-4 h-4" />
                                                                Re-solve
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Play className="w-4 h-4" />
                                                                Solve
                                                            </>
                                                        )}
                                                    </button>
                                                    {module.solvedAt && (() => {
                                                        const sizedDebtRef = `M${moduleIndex + 1}.1`
                                                        const sizedDebtValues = moduleOutputs[sizedDebtRef] || []
                                                        const sizedDebt = sizedDebtValues[0] || 0

                                                        // Check if inputs resolved (support both old and new input key names)
                                                        const cfadsRef = module.inputs?.contractedCfadsRef || module.inputs?.cfadsRef
                                                        const cfadsArray = cfadsRef ? allRefs[cfadsRef] : null
                                                        const cfadsFound = cfadsArray && cfadsArray.length > 0 && cfadsArray.some(v => v > 0)

                                                        const flagRef = module.inputs?.debtFlagRef
                                                        const flagArray = flagRef ? allRefs[flagRef] : null
                                                        const flagFound = flagArray && flagArray.length > 0 && flagArray.some(v => v)

                                                        return (
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-4">
                                                                    <span className="text-xs text-green-600">
                                                                        Solved {new Date(module.solvedAt).toLocaleTimeString()}
                                                                    </span>
                                                                    <span className={`text-sm font-bold ${sizedDebt > 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                                                                        Sized Debt: {sizedDebt > 0 ? sizedDebt.toFixed(2) + ' $M' : 'No viable debt found'}
                                                                    </span>
                                                                </div>
                                                                {sizedDebt === 0 && (
                                                                    <div className="text-xs text-red-500 space-y-0.5">
                                                                        {!cfadsFound && cfadsRef && <div>CFADS ({cfadsRef}) not found or all zeros</div>}
                                                                        {!flagFound && flagRef && (
                                                                            <div>
                                                                                Flag ({flagRef}) not found or all zeros.
                                                                                Available flags: {Object.keys(allRefs).filter(k => k.startsWith('F') && !k.includes('.')).sort().join(', ') || 'none'}
                                                                            </div>
                                                                        )}
                                                                        {!cfadsRef && <div>No CFADS reference set</div>}
                                                                        {!flagRef && <div>No debt flag reference set</div>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })()}
                                                    {!module.solvedAt && (
                                                        <span className="text-xs text-amber-600">
                                                            Click Solve to run the debt sizing calculation
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Module Outputs */}
                                            <div className="pt-3 border-t border-slate-100">
                                                <span className="text-xs text-slate-400">Outputs: </span>
                                                {(module.outputs || template?.outputs || []).map((output, outputIdx) => (
                                                    <span key={output} className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded mr-1">
                                                        M{moduleIndex + 1}.{outputIdx + 1} <span className="text-orange-400">({output.replace(/_/g, ' ')})</span>
                                                    </span>
                                                ))}
                                            </div>

                                            {/* Generated Array Preview - only show when solved for iterative modules */}
                                            {template && displayPeriods.length > 0 && (module.templateId !== 'iterative_debt_sizing' || module.solvedAt) && (
                                                <div className="mt-4 border-t border-slate-200 pt-3">
                                                    {/* Input Summary */}
                                                    <div className="mb-3 p-2 bg-slate-50 rounded-lg">
                                                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Solved With Inputs</div>
                                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                                            {template.inputs.map(inputDef => {
                                                                const value = module.inputs[inputDef.key]
                                                                if (value === undefined || value === null || value === '') return null
                                                                return (
                                                                    <span key={inputDef.key} className="text-slate-600">
                                                                        <span className="text-slate-400">{inputDef.label}:</span>{' '}
                                                                        <span className="font-medium text-slate-800">{value}</span>
                                                                    </span>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
                                                        Generated Time Series Preview ({viewMode === 'M' ? 'Monthly' : viewMode === 'Q' ? 'Quarterly' : viewMode === 'Y' ? 'Yearly' : 'Financial Year'})
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="text-sm table-fixed w-full">
                                                            <thead>
                                                                <tr className="bg-slate-50 border-b border-slate-200">
                                                                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[180px] min-w-[180px] sticky left-0 z-10 bg-slate-50">
                                                                        Output
                                                                    </th>
                                                                    <th className="text-right py-1 px-2 text-xs font-semibold text-slate-500 uppercase w-[80px] min-w-[80px] sticky left-[180px] z-10 bg-slate-50 border-r border-slate-300">
                                                                        Total
                                                                    </th>
                                                                    {displayPeriods.map((period, i) => (
                                                                        <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[55px] w-[55px]">
                                                                            {period.label}
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(() => {
                                                                    const templateKey = module.templateId
                                                                    const actualTemplate = MODULE_TEMPLATES[templateKey]
                                                                    if (!actualTemplate) return null

                                                                    const rows = []

                                                                    // Add INPUT reference rows first (for references that resolve to arrays)
                                                                    actualTemplate.inputs.forEach((inputDef, inputIdx) => {
                                                                        if (inputDef.type !== 'reference') return
                                                                        const refValue = module.inputs[inputDef.key]
                                                                        if (!refValue) return

                                                                        // Get the array from allRefs (includes referenceMap, calculationResults, moduleOutputs)
                                                                        const monthlyValues = allRefs[refValue] || []
                                                                        if (monthlyValues.length === 0) return

                                                                        const displayValues = aggregateValues(monthlyValues, 'flow')
                                                                        const total = displayValues.reduce((sum, v) => sum + v, 0)

                                                                        rows.push(
                                                                            <tr key={`input-${inputIdx}`} className="border-b border-slate-100 bg-indigo-50/30 hover:bg-indigo-50/50">
                                                                                <td className="py-1.5 px-3 text-xs sticky left-0 z-10 bg-indigo-50/30">
                                                                                    <span className="text-indigo-600 font-medium">{refValue}</span>
                                                                                    <span className="text-slate-500 ml-2">{inputDef.label}</span>
                                                                                    <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-600">
                                                                                        input
                                                                                    </span>
                                                                                </td>
                                                                                <td className="py-1 px-2 text-right text-xs font-medium text-slate-900 sticky left-[180px] z-10 bg-indigo-50/30 border-r border-slate-200">
                                                                                    {formatValue(total, { emptyValue: '' })}
                                                                                </td>
                                                                                {displayValues.map((val, i) => (
                                                                                    <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${
                                                                                        val !== 0 ? 'text-indigo-700' : 'text-slate-300'
                                                                                    }`}>
                                                                                        {formatValue(val, { emptyValue: '' })}
                                                                                    </td>
                                                                                ))}
                                                                            </tr>
                                                                        )
                                                                    })

                                                                    // Add separator if we have inputs
                                                                    if (rows.length > 0) {
                                                                        rows.push(
                                                                            <tr key="separator" className="bg-slate-200">
                                                                                <td colSpan={2 + displayPeriods.length} className="py-0.5 text-[10px] text-slate-500 text-center font-medium">
                                                                                    OUTPUTS
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    }

                                                                    // Add OUTPUT rows
                                                                    actualTemplate.outputs.forEach((output, outputIdx) => {
                                                                        const ref = `M${moduleIndex + 1}.${outputIdx + 1}`
                                                                        const monthlyValues = moduleOutputs[ref] || []
                                                                        const outputType = output.type || 'flow'
                                                                        const displayValues = aggregateValues(monthlyValues, outputType)
                                                                        const isStock = outputType === 'stock' || outputType === 'stock_start'
                                                                        const total = isStock
                                                                            ? (outputType === 'stock_start' ? (displayValues[0] || 0) : (displayValues[displayValues.length - 1] || 0))
                                                                            : displayValues.reduce((sum, v) => sum + v, 0)

                                                                        rows.push(
                                                                            <tr key={`output-${outputIdx}`} className="border-b border-slate-100 hover:bg-orange-50/30">
                                                                                <td className="py-1.5 px-3 text-xs sticky left-0 z-10 bg-white">
                                                                                    <span className="text-orange-600 font-medium">{ref}</span>
                                                                                    <span className="text-slate-500 ml-2">{output.label}</span>
                                                                                    <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${
                                                                                        isStock ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                                                                                    }`}>
                                                                                        {outputType === 'stock_start' ? 'stock (start)' : outputType}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="py-1 px-2 text-right text-xs font-medium text-slate-900 sticky left-[180px] z-10 bg-white border-r border-slate-200">
                                                                                    {formatValue(total, { emptyValue: '' })}
                                                                                </td>
                                                                                {displayValues.map((val, i) => (
                                                                                    <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${
                                                                                        val !== 0 ? 'text-slate-700' : 'text-slate-300'
                                                                                    }`}>
                                                                                        {formatValue(val, { emptyValue: '' })}
                                                                                    </td>
                                                                                ))}
                                                                            </tr>
                                                                        )
                                                                    })

                                                                    return rows
                                                                })()}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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
