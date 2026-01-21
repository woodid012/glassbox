'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'

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

    const updateInputMode = (moduleId, inputKey, newMode) => {
        setAppState(prev => ({
            ...prev,
            modules: prev.modules.map(m =>
                m.id === moduleId
                    ? { ...m, inputModes: { ...(m.inputModes || {}), [inputKey]: newMode } }
                    : m
            )
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
                                                    <input
                                                        type="text"
                                                        value={module.name}
                                                        onChange={(e) => updateModuleName(module.id, e.target.value)}
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
                                                        // Check showWhen condition
                                                        if (inputDef.showWhen) {
                                                            const conditionMode = (module.inputModes || {})[inputDef.showWhen.key]
                                                            if (conditionMode !== inputDef.showWhen.mode) {
                                                                return null
                                                            }
                                                        }

                                                        const inputModes = module.inputModes || {}
                                                        const currentMode = inputModes[inputDef.key] || (inputDef.modes ? inputDef.modes[0] : 'constant')
                                                        const availableModes = inputDef.modes || ['constant', 'reference']
                                                        const hasModeOptions = availableModes.length > 1

                                                        return (
                                                            <div key={inputDef.key}>
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <label className="text-xs text-slate-500">{inputDef.label}</label>
                                                                    {hasModeOptions && (
                                                                        <select
                                                                            value={currentMode}
                                                                            onChange={(e) => updateInputMode(module.id, inputDef.key, e.target.value)}
                                                                            className="text-xs px-1 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600"
                                                                        >
                                                                            {availableModes.map(mode => (
                                                                                <option key={mode} value={mode}>
                                                                                    {mode === 'constant' ? '#' : mode === 'reference' ? 'Ref' : mode === 'keyPeriod' ? 'Key Period' : 'Duration'}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    )}
                                                                </div>

                                                                {/* Period type - show key period dropdown or duration input */}
                                                                {inputDef.type === 'period' ? (
                                                                    currentMode === 'keyPeriod' ? (
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
                                                                    ) : (
                                                                        <div className="text-xs text-slate-400 italic py-1.5">Set duration below</div>
                                                                    )
                                                                ) : inputDef.type === 'select' ? (
                                                                    <select
                                                                        value={module.inputs[inputDef.key] || inputDef.default}
                                                                        onChange={(e) => updateInputValue(module.id, inputDef.key, e.target.value)}
                                                                        className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                    >
                                                                        {inputDef.options.map(opt => (
                                                                            <option key={opt} value={opt}>{opt}</option>
                                                                        ))}
                                                                    </select>
                                                                ) : inputDef.type === 'boolean' ? (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={module.inputs[inputDef.key] ?? inputDef.default}
                                                                        onChange={(e) => updateInputValue(module.id, inputDef.key, e.target.checked)}
                                                                        className="w-4 h-4"
                                                                    />
                                                                ) : currentMode === 'reference' ? (
                                                                    <input
                                                                        type="text"
                                                                        value={module.inputs[inputDef.key] || ''}
                                                                        onChange={(e) => updateInputValue(module.id, inputDef.key, e.target.value)}
                                                                        placeholder="e.g., V1.1, S1, C1.2"
                                                                        className="w-full text-sm font-mono border border-indigo-200 bg-indigo-50 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                    />
                                                                ) : (
                                                                    <input
                                                                        type={inputDef.type === 'date' ? 'date' : 'number'}
                                                                        value={module.inputs[inputDef.key] ?? inputDef.default ?? ''}
                                                                        onChange={(e) => {
                                                                            const val = inputDef.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                                                                            updateInputValue(module.id, inputDef.key, val)
                                                                        }}
                                                                        className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                                                {module.outputs.map((output, outputIdx) => (
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
