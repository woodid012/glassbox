'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { DeferredInput } from '@/components/DeferredInput'

export default function ModulesPage() {
    const {
        appState,
        setters
    } = useDashboard()

    const { modules, moduleTemplates, keyPeriods } = appState
    const { setAppState } = setters

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
                    ? { ...m, inputs: { ...m.inputs, [inputKey]: value } }
                    : m
            )
        }))
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

                                            {/* Module Outputs */}
                                            <div className="pt-3 border-t border-slate-100">
                                                <span className="text-xs text-slate-400">Outputs: </span>
                                                {(module.outputs || template?.outputs || []).map((output, outputIdx) => (
                                                    <span key={output} className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded mr-1">
                                                        M{moduleIndex + 1}.{outputIdx + 1} <span className="text-orange-400">({output.replace(/_/g, ' ')})</span>
                                                    </span>
                                                ))}
                                            </div>
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
