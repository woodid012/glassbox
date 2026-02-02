'use client'

import { DeferredInput } from '@/components/DeferredInput'

/**
 * Format a module input value for display.
 * - For constants (C1.X): shows "1.4 (C1.25)"
 * - For flags (F1, F2): shows "Construction (F1)"
 * - For calculations (R123): shows "CFADS (R115)"
 * - For indices (I2): shows "CPI (I2)"
 * - For module outputs (M1.1): shows the ref as-is
 * - For plain numbers: shows the number
 */
export function formatInputDisplay(value, { allRefs, inputGlass, keyPeriods, calculations, indices }) {
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

/**
 * Renders the grid of module input fields (edit mode only).
 * Each input can be a period dropdown, select, boolean, date, text, or formula reference.
 */
export default function ModuleInputDisplay({ module, template, keyPeriods, allRefs, inputGlass, calculations, indices, onUpdateInput }) {
    if (!template) return null

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
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
                                onChange={(e) => onUpdateInput(module.id, inputDef.key, e.target.value)}
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
                                onChange={(e) => onUpdateInput(module.id, inputDef.key, e.target.value)}
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
                                onChange={(e) => onUpdateInput(module.id, inputDef.key, e.target.checked)}
                                className="w-4 h-4"
                            />
                        ) : inputDef.type === 'date' ? (
                            <input
                                type="date"
                                value={module.inputs[inputDef.key] ?? inputDef.default ?? ''}
                                onChange={(e) => onUpdateInput(module.id, inputDef.key, e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        ) : inputDef.type === 'text' ? (
                            /* Plain text input for names/labels */
                            <input
                                type="text"
                                value={module.inputs[inputDef.key] ?? inputDef.default ?? ''}
                                onChange={(e) => onUpdateInput(module.id, inputDef.key, e.target.value)}
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
                                        onChange={(val) => onUpdateInput(module.id, inputDef.key, val)}
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
    )
}
