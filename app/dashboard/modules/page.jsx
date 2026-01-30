'use client'

import { Plus, Trash2, Play, RefreshCw, ToggleLeft, ToggleRight, Code, CheckCircle, AlertTriangle, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'
import { DeferredInput } from '@/components/DeferredInput'
import { MODULE_TEMPLATES } from '@/utils/modules'
import { formatValue } from '@/utils/valueAggregation'
import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

/**
 * Format a module input value for display.
 * - For constants (C1.X): shows "1.4 (C1.25)"
 * - For flags (F1, F2): shows "Construction (F1)"
 * - For calculations (R123): shows "CFADS (R115)"
 * - For indices (I2): shows "CPI (I2)"
 * - For module outputs (M1.1): shows the ref as-is
 * - For plain numbers: shows the number
 */
function formatInputDisplay(value, { allRefs, inputGlass, keyPeriods, calculations, indices }) {
    if (value === undefined || value === null || value === '') return null

    // Plain number
    if (typeof value === 'number') {
        return { display: value.toString(), type: 'number' }
    }

    const strValue = String(value).trim()

    // Check if it's a reference pattern
    const constantMatch = strValue.match(/^C1\.(\d+)$/)
    if (constantMatch) {
        // Constant reference - get value from allRefs and name from inputGlass
        const constNum = parseInt(constantMatch[1])
        const constId = constNum + 99 // C1.19 = id 118
        const constant = (inputGlass || []).find(inp => inp.id === constId && inp.groupId === 100)
        const refArray = allRefs[strValue]
        const resolvedValue = refArray ? (refArray.find(v => v !== 0) || refArray[0] || 0) : null

        if (resolvedValue !== null) {
            const displayVal = typeof resolvedValue === 'number'
                ? (Math.abs(resolvedValue) >= 1000 ? resolvedValue.toLocaleString() : resolvedValue.toString())
                : resolvedValue
            return {
                display: `${displayVal} (${strValue})`,
                name: constant?.name,
                type: 'constant'
            }
        }
        return { display: strValue, name: constant?.name, type: 'constant' }
    }

    const flagMatch = strValue.match(/^F(\d+)(\.Start|\.End)?$/)
    if (flagMatch) {
        // Flag reference - get name from keyPeriods
        const flagId = parseInt(flagMatch[1])
        const suffix = flagMatch[2] || ''
        const keyPeriod = (keyPeriods || []).find(kp => kp.id === flagId)
        const name = keyPeriod?.name || `Flag ${flagId}`
        return {
            display: `${name}${suffix ? ' ' + suffix.slice(1) : ''} (${strValue})`,
            name,
            type: 'flag'
        }
    }

    const calcMatch = strValue.match(/^R(\d+)$/)
    if (calcMatch) {
        // Calculation reference - get name from calculations
        const calcId = parseInt(calcMatch[1])
        const calc = (calculations || []).find(c => c.id === calcId)
        const name = calc?.name || `Calc ${calcId}`
        return {
            display: `${name} (${strValue})`,
            name,
            type: 'calculation'
        }
    }

    const moduleMatch = strValue.match(/^M(\d+)\.(\d+)$/)
    if (moduleMatch) {
        // Module output reference - just show as-is
        return { display: strValue, type: 'module' }
    }

    const indexMatch = strValue.match(/^I(\d+)$/)
    if (indexMatch) {
        // Index reference - get name from indices
        const indexId = parseInt(indexMatch[1])
        const index = (indices || []).find(idx => idx.id === indexId)
        const name = index?.name || `Index ${indexId}`
        return {
            display: `${name} (${strValue})`,
            name,
            type: 'index'
        }
    }

    // Check if it's a parseable number string
    const parsed = parseFloat(strValue)
    if (!isNaN(parsed)) {
        return { display: strValue, type: 'number' }
    }

    // Unknown format - return as-is
    return { display: strValue, type: 'unknown' }
}

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

    const toggleModuleEnabled = (moduleId) => {
        setAppState(prev => ({
            ...prev,
            modules: prev.modules.map(m =>
                m.id === moduleId ? { ...m, enabled: m.enabled === false ? true : false } : m
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
    const [showFormulas, setShowFormulas] = useState(new Set())
    const [showDiff, setShowDiff] = useState(new Set())
    const [showSolverInfo, setShowSolverInfo] = useState(new Set())

    const toggleShowFormulas = (moduleId) => {
        setShowFormulas(prev => {
            const next = new Set(prev)
            next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId)
            return next
        })
    }

    const toggleShowDiff = (moduleId) => {
        setShowDiff(prev => {
            const next = new Set(prev)
            next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId)
            return next
        })
    }

    const toggleShowSolverInfo = (moduleId) => {
        setShowSolverInfo(prev => {
            const next = new Set(prev)
            next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId)
            return next
        })
    }

    /**
     * Highlight known module input references within a formula string.
     * Returns an array of React elements with matched refs styled.
     */
    const highlightInputRefs = (formula, moduleInputs, template) => {
        if (!formula || !template) return formula
        // Collect all reference values from the module's inputs
        const refValues = []
        template.inputs.forEach(inputDef => {
            const val = moduleInputs?.[inputDef.key]
            if (val && typeof val === 'string' && /^[A-Z]/.test(val)) {
                refValues.push(val)
            }
        })
        if (refValues.length === 0) return formula

        // Build regex matching any of the ref values
        const escaped = refValues.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        const regex = new RegExp(`(${escaped.join('|')})`, 'g')
        const parts = formula.split(regex)
        return parts.map((part, i) =>
            refValues.includes(part)
                ? <span key={i} className="text-indigo-600 font-bold bg-indigo-50 px-0.5 rounded">{part}</span>
                : part
        )
    }

    /**
     * Compare actual formula vs template-expected formula for diff view.
     * Substitutes module input values into outputFormulas patterns.
     */
    const buildDiffRows = (module, template, actualTemplate) => {
        if (!actualTemplate?.convertedOutputs || !actualTemplate?.outputFormulas) return []
        const rows = []
        actualTemplate.convertedOutputs.forEach(co => {
            const calc = (calculations || []).find(c => `R${c.id}` === co.calcRef)
            const actualFormula = calc?.formula || '(not found)'

            // Build expected formula from template pattern
            let expectedPattern = actualTemplate.outputFormulas?.[co.key] || null
            if (expectedPattern) {
                // Substitute input placeholders like {additionsRef} with actual values
                Object.entries(module.inputs || {}).forEach(([key, val]) => {
                    expectedPattern = expectedPattern.replace(new RegExp(`\\{${key}\\}`, 'g'), val || `{${key}}`)
                })
            }

            const matches = expectedPattern
                ? actualFormula.trim() === expectedPattern.trim()
                : null // Can't compare if no pattern

            rows.push({
                calcRef: co.calcRef,
                label: co.label,
                actual: actualFormula,
                expected: expectedPattern || '(no pattern defined)',
                matches
            })
        })
        return rows
    }

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
                                icon="📦"
                                title="No modules added yet"
                                subtitle="Click a template above to add a module"
                                className="border-2 border-dashed border-slate-200 rounded-lg"
                            />
                        ) : (
                            <div className="space-y-4">
                                {modules.map((module, moduleIndex) => {
                                    const template = MODULE_TEMPLATES[module.templateId] || (moduleTemplates || []).find(t => t.id === module.templateId)
                                    return (
                                        <div
                                            key={module.id}
                                            className={`border rounded-lg p-4 transition-all ${
                                                module.enabled === false
                                                    ? 'border-slate-200 bg-slate-50 opacity-60'
                                                    : 'border-slate-200 bg-white'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs px-1.5 py-0.5 rounded font-medium text-orange-600 bg-orange-100">
                                                        M{moduleIndex + 1}
                                                    </span>
                                                    {inputsEditMode ? (
                                                        <DeferredInput
                                                            type="text"
                                                            value={module.name}
                                                            onChange={(val) => updateModuleName(module.id, val)}
                                                            className="text-sm font-semibold text-slate-900 bg-slate-100 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    ) : (
                                                        <span className="text-sm font-semibold text-slate-900">{module.name}</span>
                                                    )}
                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                        module.category === 'financing' ? 'bg-blue-100 text-blue-700' :
                                                        module.category === 'accounting' ? 'bg-purple-100 text-purple-700' :
                                                        'bg-green-100 text-green-700'
                                                    }`}>
                                                        {module.category}
                                                    </span>
                                                </div>
                                                {inputsEditMode && (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => toggleModuleEnabled(module.id)}
                                                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                                            module.enabled === false
                                                                ? 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                                                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                        }`}
                                                        title={module.enabled === false ? 'Enable module' : 'Disable module'}
                                                    >
                                                        {module.enabled === false ? (
                                                            <>
                                                                <ToggleLeft className="w-4 h-4" />
                                                                Disabled
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ToggleRight className="w-4 h-4" />
                                                                Enabled
                                                            </>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => removeModule(module.id)}
                                                        className="p-1.5 hover:bg-red-100 rounded text-slate-400 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                )}
                                            </div>

                                            {/* Module Inputs - only in edit mode */}
                                            {inputsEditMode && template && (
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
                                                                    (() => {
                                                                        const inputValue = module.inputs[inputDef.key] ?? inputDef.default ?? ''
                                                                        const formatted = formatInputDisplay(inputValue, { allRefs, inputGlass, keyPeriods, calculations, indices })
                                                                        const showFormatted = formatted && formatted.type !== 'number' && formatted.type !== 'unknown'
                                                                        return (
                                                                            <DeferredInput
                                                                                type="text"
                                                                                value={inputValue}
                                                                                displayValue={showFormatted ? formatted.display : undefined}
                                                                                onChange={(val) => updateInputValue(module.id, inputDef.key, val)}
                                                                                placeholder="e.g., 1000 or V1.1 or V1 * 0.08"
                                                                                className={`w-full text-sm font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                                                                    showFormatted
                                                                                        ? formatted.type === 'constant' ? 'text-purple-600' :
                                                                                          formatted.type === 'flag' ? 'text-emerald-600' :
                                                                                          formatted.type === 'calculation' ? 'text-blue-600' :
                                                                                          formatted.type === 'index' ? 'text-amber-600' :
                                                                                          'text-slate-500'
                                                                                        : 'text-slate-700'
                                                                                }`}
                                                                            />
                                                                        )
                                                                    })()
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}

                                            {/* Solve Button for iterative modules - only in edit mode */}
                                            {inputsEditMode && module.templateId === 'iterative_debt_sizing' && (
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

                                            {/* Module Outputs Summary */}
                                            {template && !template.fullyConverted && (
                                            <div className="pt-3 border-t border-slate-100">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs text-slate-400">Module outputs: </span>
                                                    {template?.partiallyConverted && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700">
                                                            Solver
                                                        </span>
                                                    )}
                                                    {template?.partiallyConverted && (
                                                        <button
                                                            onClick={() => toggleShowSolverInfo(module.id)}
                                                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                                                                showSolverInfo.has(module.id)
                                                                    ? 'bg-indigo-100 text-indigo-700'
                                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                            }`}
                                                        >
                                                            <Info className="w-3 h-3" />
                                                            {showSolverInfo.has(module.id) ? 'Hide Details' : 'How It Works'}
                                                        </button>
                                                    )}
                                                    {template?.convertedOutputs?.length > 0 && (
                                                        <button
                                                            onClick={() => toggleShowFormulas(module.id)}
                                                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                                                                showFormulas.has(module.id)
                                                                    ? 'bg-indigo-100 text-indigo-700'
                                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                            }`}
                                                        >
                                                            <Code className="w-3 h-3" />
                                                            {showFormulas.has(module.id) ? 'Hide Formulas' : 'Show Formulas'}
                                                        </button>
                                                    )}
                                                    {inputsEditMode && template?.convertedOutputs?.length > 0 && (
                                                        <button
                                                            onClick={() => toggleShowDiff(module.id)}
                                                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                                                                showDiff.has(module.id)
                                                                    ? 'bg-amber-100 text-amber-700'
                                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                            }`}
                                                        >
                                                            <CheckCircle className="w-3 h-3" />
                                                            {showDiff.has(module.id) ? 'Hide Check' : 'Check Formulas'}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Solver Info Panel (Task #5) */}
                                                {showSolverInfo.has(module.id) && (() => {
                                                    const actualTemplate = MODULE_TEMPLATES[module.templateId]
                                                    if (!actualTemplate) return null
                                                    const solverLog = moduleOutputs?.[`_solverLog_M${moduleIndex + 1}`]
                                                    return (
                                                        <div className="mb-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                                                            <div className="text-[10px] font-semibold text-indigo-700 uppercase mb-2">Solver Details</div>
                                                            {/* Show outputFormulas descriptions for solver outputs */}
                                                            {actualTemplate.outputFormulas && (
                                                                <div className="space-y-1 mb-2">
                                                                    {actualTemplate.outputs
                                                                        .filter(o => o.isSolver)
                                                                        .map(o => {
                                                                            const desc = actualTemplate.outputFormulas[o.key]
                                                                            if (!desc) return null
                                                                            return (
                                                                                <div key={o.key} className="text-xs">
                                                                                    <span className="font-mono text-indigo-600 font-medium">{o.key}:</span>{' '}
                                                                                    <span className="font-mono text-slate-700 whitespace-pre-wrap">{desc}</span>
                                                                                </div>
                                                                            )
                                                                        })
                                                                    }
                                                                </div>
                                                            )}
                                                            {/* Solver log from last run */}
                                                            {solverLog && (
                                                                <div className="mt-2 pt-2 border-t border-indigo-200">
                                                                    <div className="text-[10px] font-semibold text-indigo-600 uppercase mb-1">Last Solve Result</div>
                                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                                                        {solverLog.iterations !== undefined && (
                                                                            <div>
                                                                                <span className="text-slate-500">Iterations:</span>{' '}
                                                                                <span className="font-medium text-slate-800">{solverLog.iterations}</span>
                                                                            </div>
                                                                        )}
                                                                        {solverLog.converged !== undefined && (
                                                                            <div>
                                                                                <span className="text-slate-500">Converged:</span>{' '}
                                                                                <span className={`font-medium ${solverLog.converged ? 'text-green-700' : 'text-red-600'}`}>
                                                                                    {solverLog.converged ? 'Yes' : 'No'}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                        {solverLog.finalTolerance !== undefined && (
                                                                            <div>
                                                                                <span className="text-slate-500">Tolerance:</span>{' '}
                                                                                <span className="font-medium text-slate-800">{solverLog.finalTolerance.toFixed(4)}</span>
                                                                            </div>
                                                                        )}
                                                                        {solverLog.sizedDebt !== undefined && (
                                                                            <div>
                                                                                <span className="text-slate-500">Sized Debt:</span>{' '}
                                                                                <span className="font-medium text-slate-800">{solverLog.sizedDebt.toFixed(2)} $M</span>
                                                                            </div>
                                                                        )}
                                                                        {solverLog.method && (
                                                                            <div className="col-span-full">
                                                                                <span className="text-slate-500">Method:</span>{' '}
                                                                                <span className="font-medium text-slate-800">{solverLog.method}</span>
                                                                            </div>
                                                                        )}
                                                                        {solverLog.description && (
                                                                            <div className="col-span-full">
                                                                                <span className="text-slate-500">Description:</span>{' '}
                                                                                <span className="font-mono text-slate-700 text-[11px]">{solverLog.description}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {!solverLog && (
                                                                <div className="text-xs text-slate-500 italic">
                                                                    Run the solver to see detailed results
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })()}

                                                {/* Formula Panel for converted outputs (Task #3 + #4) */}
                                                {showFormulas.has(module.id) && (() => {
                                                    const actualTemplate = MODULE_TEMPLATES[module.templateId]
                                                    if (!actualTemplate?.convertedOutputs) return null
                                                    return (
                                                        <div className="mb-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                            {actualTemplate.outputFormulas && Object.keys(actualTemplate.outputFormulas).length > 0 && (
                                                                <div className="mb-3 p-2 bg-indigo-50 rounded border border-indigo-100">
                                                                    <div className="text-[10px] font-semibold text-indigo-600 uppercase mb-1">Template Patterns</div>
                                                                    {Object.entries(actualTemplate.outputFormulas).map(([key, pattern]) => (
                                                                        <div key={key} className="text-xs font-mono text-indigo-800 mb-0.5">
                                                                            <span className="text-indigo-500">{key}:</span> {pattern}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <table className="w-full text-xs">
                                                                <thead>
                                                                    <tr className="border-b border-slate-300">
                                                                        <th className="text-left py-1 px-2 font-semibold text-slate-600 w-20">Ref</th>
                                                                        <th className="text-left py-1 px-2 font-semibold text-slate-600 w-40">Name</th>
                                                                        <th className="text-left py-1 px-2 font-semibold text-slate-600">Formula</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {actualTemplate.convertedOutputs.map((co) => {
                                                                        const calc = (calculations || []).find(c => `R${c.id}` === co.calcRef)
                                                                        return (
                                                                            <tr key={co.calcRef} className="border-b border-slate-100 hover:bg-white">
                                                                                <td className="py-1.5 px-2 font-mono text-blue-600 font-medium">{co.calcRef}</td>
                                                                                <td className="py-1.5 px-2 text-slate-700">{co.label}</td>
                                                                                <td className="py-1.5 px-2 font-mono text-slate-800">
                                                                                    {calc?.formula
                                                                                        ? highlightInputRefs(calc.formula, module.inputs, actualTemplate)
                                                                                        : <span className="text-slate-400 italic">not found</span>
                                                                                    }
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )
                                                })()}

                                                {/* Diff View for converted outputs (Task #6) */}
                                                {showDiff.has(module.id) && (() => {
                                                    const actualTemplate = MODULE_TEMPLATES[module.templateId]
                                                    if (!actualTemplate?.convertedOutputs) return null
                                                    const diffRows = buildDiffRows(module, template, actualTemplate)
                                                    return (
                                                        <div className="mb-3 bg-amber-50/50 border border-amber-200 rounded-lg p-3">
                                                            <div className="text-[10px] font-semibold text-amber-700 uppercase mb-2">Formula Check: Template vs Actual</div>
                                                            <table className="w-full text-xs">
                                                                <thead>
                                                                    <tr className="border-b border-amber-200">
                                                                        <th className="text-left py-1 px-2 font-semibold text-slate-600 w-16">Ref</th>
                                                                        <th className="text-left py-1 px-2 font-semibold text-slate-600 w-32">Output</th>
                                                                        <th className="text-left py-1 px-2 font-semibold text-slate-600">Expected</th>
                                                                        <th className="text-left py-1 px-2 font-semibold text-slate-600">Actual</th>
                                                                        <th className="text-center py-1 px-2 font-semibold text-slate-600 w-12">OK?</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {diffRows.map((row) => (
                                                                        <tr key={row.calcRef} className="border-b border-amber-100">
                                                                            <td className="py-1.5 px-2 font-mono text-blue-600">{row.calcRef}</td>
                                                                            <td className="py-1.5 px-2 text-slate-700">{row.label}</td>
                                                                            <td className="py-1.5 px-2 font-mono text-slate-600 text-[11px]">{row.expected}</td>
                                                                            <td className="py-1.5 px-2 font-mono text-slate-800 text-[11px]">{row.actual}</td>
                                                                            <td className="py-1.5 px-2 text-center">
                                                                                {row.matches === null ? (
                                                                                    <span className="text-slate-400">-</span>
                                                                                ) : row.matches ? (
                                                                                    <CheckCircle className="w-4 h-4 text-green-500 inline" />
                                                                                ) : (
                                                                                    <AlertTriangle className="w-4 h-4 text-amber-500 inline" />
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                            {diffRows.length > 0 && diffRows.every(r => r.matches === true) && (
                                                                <div className="mt-2 text-xs text-green-700 flex items-center gap-1">
                                                                    <CheckCircle className="w-3.5 h-3.5" />
                                                                    All formulas match the template
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })()}
                                                {(module.outputs || template?.outputs || []).map((output, outputIdx) => {
                                                    const outputObj = typeof output === 'string' ? { key: output, label: output.replace(/_/g, ' ') } : output
                                                    return (
                                                        <span key={outputObj.key} className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded mr-1">
                                                            M{moduleIndex + 1}.{outputIdx + 1} <span className="text-orange-400">({outputObj.label})</span>
                                                        </span>
                                                    )
                                                })}
                                                {template?.convertedOutputs && template.convertedOutputs.length > 0 && (
                                                    <div className="mt-2">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs text-slate-400">+ transparent calcs: </span>
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700">
                                                                {template.convertedOutputs.length} converted
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            )}

                                            {/* Calcs Preview — for fully converted modules, show inputs + outputs from calculationResults */}
                                            {template?.fullyConverted && displayPeriods.length > 0 && (
                                                <div className="mt-4 border-t border-slate-200 pt-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700">
                                                            Fully Converted
                                                        </span>
                                                        <span className="text-xs text-slate-400">
                                                            {template.convertedOutputs?.length || 0} transparent calculations
                                                        </span>
                                                        <button
                                                            onClick={() => toggleShowFormulas(module.id)}
                                                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                                                                showFormulas.has(module.id)
                                                                    ? 'bg-indigo-100 text-indigo-700'
                                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                            }`}
                                                        >
                                                            <Code className="w-3 h-3" />
                                                            {showFormulas.has(module.id) ? 'Hide Formulas' : 'Show Formulas'}
                                                        </button>
                                                        {inputsEditMode && (
                                                            <button
                                                                onClick={() => toggleShowDiff(module.id)}
                                                                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                                                                    showDiff.has(module.id)
                                                                        ? 'bg-amber-100 text-amber-700'
                                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                                }`}
                                                            >
                                                                <CheckCircle className="w-3 h-3" />
                                                                {showDiff.has(module.id) ? 'Hide Check' : 'Check Formulas'}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Formula Panel (Task #3 + #4) */}
                                                    {showFormulas.has(module.id) && (() => {
                                                        const actualTemplate = MODULE_TEMPLATES[module.templateId]
                                                        if (!actualTemplate) return null
                                                        return (
                                                            <div className="mb-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                                {actualTemplate.outputFormulas && Object.keys(actualTemplate.outputFormulas).length > 0 && (
                                                                    <div className="mb-3 p-2 bg-indigo-50 rounded border border-indigo-100">
                                                                        <div className="text-[10px] font-semibold text-indigo-600 uppercase mb-1">Template Patterns</div>
                                                                        {Object.entries(actualTemplate.outputFormulas).map(([key, pattern]) => (
                                                                            <div key={key} className="text-xs font-mono text-indigo-800 mb-0.5">
                                                                                <span className="text-indigo-500">{key}:</span> {pattern}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                <table className="w-full text-xs">
                                                                    <thead>
                                                                        <tr className="border-b border-slate-300">
                                                                            <th className="text-left py-1 px-2 font-semibold text-slate-600 w-20">Ref</th>
                                                                            <th className="text-left py-1 px-2 font-semibold text-slate-600 w-40">Name</th>
                                                                            <th className="text-left py-1 px-2 font-semibold text-slate-600">Formula</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {(actualTemplate.convertedOutputs || []).map((co) => {
                                                                            const calc = (calculations || []).find(c => `R${c.id}` === co.calcRef)
                                                                            return (
                                                                                <tr key={co.calcRef} className="border-b border-slate-100 hover:bg-white">
                                                                                    <td className="py-1.5 px-2 font-mono text-blue-600 font-medium">{co.calcRef}</td>
                                                                                    <td className="py-1.5 px-2 text-slate-700">{co.label}</td>
                                                                                    <td className="py-1.5 px-2 font-mono text-slate-800">
                                                                                        {calc?.formula
                                                                                            ? highlightInputRefs(calc.formula, module.inputs, actualTemplate)
                                                                                            : <span className="text-slate-400 italic">not found</span>
                                                                                        }
                                                                                    </td>
                                                                                </tr>
                                                                            )
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )
                                                    })()}

                                                    {/* Diff View (Task #6) */}
                                                    {showDiff.has(module.id) && (() => {
                                                        const actualTemplate = MODULE_TEMPLATES[module.templateId]
                                                        if (!actualTemplate) return null
                                                        const diffRows = buildDiffRows(module, template, actualTemplate)
                                                        return (
                                                            <div className="mb-3 bg-amber-50/50 border border-amber-200 rounded-lg p-3">
                                                                <div className="text-[10px] font-semibold text-amber-700 uppercase mb-2">Formula Check: Template vs Actual</div>
                                                                <table className="w-full text-xs">
                                                                    <thead>
                                                                        <tr className="border-b border-amber-200">
                                                                            <th className="text-left py-1 px-2 font-semibold text-slate-600 w-16">Ref</th>
                                                                            <th className="text-left py-1 px-2 font-semibold text-slate-600 w-32">Output</th>
                                                                            <th className="text-left py-1 px-2 font-semibold text-slate-600">Expected (template)</th>
                                                                            <th className="text-left py-1 px-2 font-semibold text-slate-600">Actual (model)</th>
                                                                            <th className="text-center py-1 px-2 font-semibold text-slate-600 w-12">OK?</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {diffRows.map((row) => (
                                                                            <tr key={row.calcRef} className="border-b border-amber-100">
                                                                                <td className="py-1.5 px-2 font-mono text-blue-600">{row.calcRef}</td>
                                                                                <td className="py-1.5 px-2 text-slate-700">{row.label}</td>
                                                                                <td className="py-1.5 px-2 font-mono text-slate-600 text-[11px]">{row.expected}</td>
                                                                                <td className="py-1.5 px-2 font-mono text-slate-800 text-[11px]">{row.actual}</td>
                                                                                <td className="py-1.5 px-2 text-center">
                                                                                    {row.matches === null ? (
                                                                                        <span className="text-slate-400">-</span>
                                                                                    ) : row.matches ? (
                                                                                        <CheckCircle className="w-4 h-4 text-green-500 inline" />
                                                                                    ) : (
                                                                                        <AlertTriangle className="w-4 h-4 text-amber-500 inline" />
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                                {diffRows.every(r => r.matches === true) && (
                                                                    <div className="mt-2 text-xs text-green-700 flex items-center gap-1">
                                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                                        All formulas match the template
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })()}
                                                    <div className="overflow-x-auto">
                                                        <table className="text-sm table-fixed w-full">
                                                            <thead>
                                                                <tr className="bg-slate-50 border-b border-slate-200">
                                                                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[240px] min-w-[240px] sticky left-0 z-10 bg-slate-50">
                                                                        Ref
                                                                    </th>
                                                                    <th className="text-right py-1 px-3 text-xs font-semibold text-slate-500 uppercase w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-slate-50 border-r border-slate-300">
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
                                                                    const actualTemplate = MODULE_TEMPLATES[module.templateId]
                                                                    if (!actualTemplate) return null
                                                                    const rows = []

                                                                    // INPUT rows
                                                                    actualTemplate.inputs.forEach((inputDef, inputIdx) => {
                                                                        if (inputDef.type !== 'reference') return
                                                                        const refValue = module.inputs[inputDef.key]
                                                                        if (!refValue) return
                                                                        const monthlyValues = allRefs[refValue] || []
                                                                        if (monthlyValues.length === 0) return
                                                                        const displayValues = aggregateValues(monthlyValues, 'flow')
                                                                        const total = displayValues.reduce((sum, v) => sum + v, 0)

                                                                        rows.push(
                                                                            <tr key={`input-${inputIdx}`} className="border-b border-slate-100 bg-indigo-50/30 hover:bg-indigo-50/50">
                                                                                <td className="py-1.5 px-3 text-xs w-[240px] min-w-[240px] sticky left-0 z-10 bg-indigo-50/30">
                                                                                    <span className="text-indigo-600 font-medium">{refValue}</span>
                                                                                    <span className="text-slate-500 ml-2">{inputDef.label}</span>
                                                                                    <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-600">input</span>
                                                                                </td>
                                                                                <td className={`py-1 px-3 text-right text-xs font-medium w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-indigo-50/30 border-r border-slate-200 ${
                                                                                    total < 0 ? 'text-red-600' : 'text-slate-900'
                                                                                }`}>
                                                                                    {formatValue(total, { accounting: true, emptyValue: '' })}
                                                                                </td>
                                                                                {displayValues.map((val, i) => (
                                                                                    <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${
                                                                                        val < 0 ? 'text-red-600' : val !== 0 ? 'text-indigo-700' : 'text-slate-300'
                                                                                    }`}>
                                                                                        {formatValue(val, { accounting: true, emptyValue: '' })}
                                                                                    </td>
                                                                                ))}
                                                                            </tr>
                                                                        )
                                                                    })

                                                                    if (rows.length > 0) {
                                                                        rows.push(
                                                                            <tr key="separator" className="bg-slate-200">
                                                                                <td colSpan={2 + displayPeriods.length} className="py-0.5 text-[10px] text-slate-500 text-center font-medium">
                                                                                    OUTPUTS
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    }

                                                                    // OUTPUT rows from convertedOutputs using calculationResults
                                                                    (actualTemplate.convertedOutputs || []).forEach((co, coIdx) => {
                                                                        const calc = (calculations || []).find(c => `R${c.id}` === co.calcRef)
                                                                        const calcType = calc?.type || 'flow'
                                                                        const monthlyValues = calculationResults[co.calcRef] || []
                                                                        const displayValues = aggregateValues(monthlyValues, calcType)
                                                                        const isStock = calcType === 'stock' || calcType === 'stock_start'
                                                                        const total = isStock
                                                                            ? (calcType === 'stock_start' ? (displayValues[0] || 0) : (displayValues[displayValues.length - 1] || 0))
                                                                            : displayValues.reduce((sum, v) => sum + v, 0)

                                                                        rows.push(
                                                                            <tr key={`output-${coIdx}`} className="border-b border-slate-100 hover:bg-green-50/30">
                                                                                <td className="py-1.5 px-3 text-xs w-[240px] min-w-[240px] sticky left-0 z-10 bg-white">
                                                                                    <span className="text-blue-600 font-medium">{co.calcRef}</span>
                                                                                    <span className="text-slate-500 ml-2">{co.label}</span>
                                                                                    <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${
                                                                                        isStock ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                                                                                    }`}>
                                                                                        {calcType}
                                                                                    </span>
                                                                                </td>
                                                                                <td className={`py-1 px-3 text-right text-xs font-medium w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-white border-r border-slate-200 ${
                                                                                    total < 0 ? 'text-red-600' : 'text-slate-900'
                                                                                }`}>
                                                                                    {formatValue(total, { accounting: true, emptyValue: '' })}
                                                                                </td>
                                                                                {displayValues.map((val, i) => (
                                                                                    <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${
                                                                                        val < 0 ? 'text-red-600' : val !== 0 ? 'text-slate-700' : 'text-slate-300'
                                                                                    }`}>
                                                                                        {formatValue(val, { accounting: true, emptyValue: '' })}
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

                                            {/* Generated Array Preview - for partially converted / solver modules */}
                                            {template && !template.fullyConverted && displayPeriods.length > 0 && (module.templateId !== 'iterative_debt_sizing' || module.solvedAt) && (
                                                <div className="mt-4 border-t border-slate-200 pt-3">
                                                    {/* Input Summary */}
                                                    <div className="mb-3 p-2 bg-slate-50 rounded-lg">
                                                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Solved With Inputs</div>
                                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                                            {template.inputs.map(inputDef => {
                                                                const value = module.inputs[inputDef.key]
                                                                if (value === undefined || value === null || value === '') return null
                                                                const formatted = formatInputDisplay(value, { allRefs, inputGlass, keyPeriods, calculations, indices })
                                                                return (
                                                                    <span key={inputDef.key} className="text-slate-600">
                                                                        <span className="text-slate-400">{inputDef.label}:</span>{' '}
                                                                        <span className={`font-medium ${
                                                                            formatted?.type === 'constant' ? 'text-purple-700' :
                                                                            formatted?.type === 'flag' ? 'text-emerald-700' :
                                                                            formatted?.type === 'calculation' ? 'text-blue-700' :
                                                                            formatted?.type === 'index' ? 'text-amber-700' :
                                                                            'text-slate-800'
                                                                        }`}>
                                                                            {formatted?.display || value}
                                                                        </span>
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
                                                                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[240px] min-w-[240px] sticky left-0 z-10 bg-slate-50">
                                                                        Output
                                                                    </th>
                                                                    <th className="text-right py-1 px-3 text-xs font-semibold text-slate-500 uppercase w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-slate-50 border-r border-slate-300">
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
                                                                                <td className="py-1.5 px-3 text-xs w-[240px] min-w-[240px] sticky left-0 z-10 bg-indigo-50/30">
                                                                                    <span className="text-indigo-600 font-medium">{refValue}</span>
                                                                                    <span className="text-slate-500 ml-2">{inputDef.label}</span>
                                                                                    <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-600">
                                                                                        input
                                                                                    </span>
                                                                                </td>
                                                                                <td className={`py-1 px-3 text-right text-xs font-medium w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-indigo-50/30 border-r border-slate-200 ${
                                                                                    total < 0 ? 'text-red-600' : 'text-slate-900'
                                                                                }`}>
                                                                                    {formatValue(total, { accounting: true, emptyValue: '' })}
                                                                                </td>
                                                                                {displayValues.map((val, i) => (
                                                                                    <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${
                                                                                        val < 0 ? 'text-red-600' : val !== 0 ? 'text-indigo-700' : 'text-slate-300'
                                                                                    }`}>
                                                                                        {formatValue(val, { accounting: true, emptyValue: '' })}
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

                                                                    // Add OUTPUT rows (module outputs + converted calc outputs)
                                                                    let currentSection = null
                                                                    actualTemplate.outputs.forEach((output, outputIdx) => {
                                                                        // Insert section header when section changes
                                                                        if (output.section && output.section !== currentSection) {
                                                                            currentSection = output.section
                                                                            rows.push(
                                                                                <tr key={`section-${outputIdx}`} className="bg-slate-50 border-b border-slate-200">
                                                                                    <td colSpan={2 + displayPeriods.length} className="py-1 px-3 text-[10px] text-slate-500 font-semibold uppercase tracking-wide">
                                                                                        {currentSection}
                                                                                    </td>
                                                                                </tr>
                                                                            )
                                                                        }

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
                                                                                <td className="py-1.5 px-3 text-xs w-[240px] min-w-[240px] sticky left-0 z-10 bg-white">
                                                                                    <span className="text-orange-600 font-medium">{ref}</span>
                                                                                    <span className="text-slate-500 ml-2">{output.label}</span>
                                                                                    {output.isSolver && (
                                                                                        <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-600">solver</span>
                                                                                    )}
                                                                                    <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${
                                                                                        isStock ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                                                                                    }`}>
                                                                                        {outputType === 'stock_start' ? 'stock (start)' : outputType}
                                                                                    </span>
                                                                                </td>
                                                                                <td className={`py-1 px-3 text-right text-xs font-medium w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-white border-r border-slate-200 ${
                                                                                    total < 0 ? 'text-red-600' : 'text-slate-900'
                                                                                }`}>
                                                                                    {formatValue(total, { accounting: true, emptyValue: '' })}
                                                                                </td>
                                                                                {displayValues.map((val, i) => (
                                                                                    <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${
                                                                                        val < 0 ? 'text-red-600' : val !== 0 ? 'text-slate-700' : 'text-slate-300'
                                                                                    }`}>
                                                                                        {formatValue(val, { accounting: true, emptyValue: '' })}
                                                                                    </td>
                                                                                ))}
                                                                            </tr>
                                                                        )
                                                                    })

                                                                    // Add converted outputs (now regular calcs) if available
                                                                    if (actualTemplate.convertedOutputs && actualTemplate.convertedOutputs.length > 0) {
                                                                        rows.push(
                                                                            <tr key="converted-separator" className="bg-green-50 border-b border-green-200">
                                                                                <td colSpan={2 + displayPeriods.length} className="py-0.5 text-[10px] text-green-700 text-center font-medium">
                                                                                    CONVERTED TO CALCS (transparent formulas)
                                                                                </td>
                                                                            </tr>
                                                                        )

                                                                        actualTemplate.convertedOutputs.forEach((co, coIdx) => {
                                                                            const monthlyValues = calculationResults[co.calcRef] || []
                                                                            const displayValues = aggregateValues(monthlyValues, 'flow')
                                                                            const total = displayValues.reduce((sum, v) => sum + v, 0)

                                                                            rows.push(
                                                                                <tr key={`converted-${coIdx}`} className="border-b border-slate-100 hover:bg-green-50/30">
                                                                                    <td className="py-1.5 px-3 text-xs w-[240px] min-w-[240px] sticky left-0 z-10 bg-white">
                                                                                        <span className="text-blue-600 font-medium">{co.calcRef}</span>
                                                                                        <span className="text-slate-500 ml-2">{co.label}</span>
                                                                                        <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-600">calc</span>
                                                                                    </td>
                                                                                    <td className={`py-1 px-3 text-right text-xs font-medium w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-white border-r border-slate-200 ${
                                                                                        total < 0 ? 'text-red-600' : 'text-slate-900'
                                                                                    }`}>
                                                                                        {formatValue(total, { accounting: true, emptyValue: '' })}
                                                                                    </td>
                                                                                    {displayValues.map((val, i) => (
                                                                                        <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${
                                                                                            val < 0 ? 'text-red-600' : val !== 0 ? 'text-slate-700' : 'text-slate-300'
                                                                                        }`}>
                                                                                            {formatValue(val, { accounting: true, emptyValue: '' })}
                                                                                        </td>
                                                                                    ))}
                                                                                </tr>
                                                                            )
                                                                        })
                                                                    }

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
