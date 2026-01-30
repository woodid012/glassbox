'use client'

import { Code, CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { MODULE_TEMPLATES } from '@/utils/modules'
import { formatValue } from '@/utils/valueAggregation'
import { formatInputDisplay } from './ModuleInputDisplay'

/**
 * Highlight known module input references within a formula string.
 * Returns an array of React elements with matched refs styled.
 */
function highlightInputRefs(formula, moduleInputs, template) {
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
function buildDiffRows(module, actualTemplate, calculations) {
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

/**
 * Renders the formula panel showing converted output formulas.
 */
function FormulaPanel({ module, actualTemplate, calculations }) {
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
}

/**
 * Renders the diff view comparing template-expected vs actual formulas.
 */
function DiffPanel({ module, actualTemplate, calculations }) {
    if (!actualTemplate?.convertedOutputs) return null
    const diffRows = buildDiffRows(module, actualTemplate, calculations)
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
}

/**
 * Renders the solver info panel showing solver details and log.
 */
function SolverInfoPanel({ module, moduleIndex, moduleOutputs }) {
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
}

/**
 * Time series data table used by both fully converted and solver/partial modules.
 */
function TimeSeriesTable({ module, moduleIndex, displayPeriods, allRefs, moduleOutputs, calculationResults, calculations, aggregateValues, isFullyConverted }) {
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

    if (isFullyConverted) {
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
    } else {
        // Solver / partial module: module output rows + converted calc rows
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
    }

    return (
        <div className="overflow-x-auto">
            <table className="text-sm table-fixed w-full">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[240px] min-w-[240px] sticky left-0 z-10 bg-slate-50">
                            {isFullyConverted ? 'Ref' : 'Output'}
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
                    {rows}
                </tbody>
            </table>
        </div>
    )
}

/**
 * Toolbar with toggle buttons for formulas, diff check, and solver info.
 */
function OutputToolbar({ module, template, inputsEditMode, showFormulas, showDiff, showSolverInfo, onToggleFormulas, onToggleDiff, onToggleSolverInfo }) {
    return (
        <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-slate-400">
                {template?.fullyConverted
                    ? `${template.convertedOutputs?.length || 0} transparent calculations`
                    : 'Module outputs: '
                }
            </span>
            {!template?.fullyConverted && template?.partiallyConverted && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700">
                    Solver
                </span>
            )}
            {!template?.fullyConverted && template?.partiallyConverted && (
                <button
                    onClick={() => onToggleSolverInfo(module.id)}
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                        showSolverInfo
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    <Info className="w-3 h-3" />
                    {showSolverInfo ? 'Hide Details' : 'How It Works'}
                </button>
            )}
            {template?.convertedOutputs?.length > 0 && (
                <button
                    onClick={() => onToggleFormulas(module.id)}
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                        showFormulas
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    <Code className="w-3 h-3" />
                    {showFormulas ? 'Hide Formulas' : 'Show Formulas'}
                </button>
            )}
            {inputsEditMode && template?.convertedOutputs?.length > 0 && (
                <button
                    onClick={() => onToggleDiff(module.id)}
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                        showDiff
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    <CheckCircle className="w-3 h-3" />
                    {showDiff ? 'Hide Check' : 'Check Formulas'}
                </button>
            )}
        </div>
    )
}

/**
 * Module outputs section for non-fully-converted modules.
 * Shows output summary tags, formula/diff panels, and time series preview.
 */
function PartialModuleOutputs({
    module, moduleIndex, template,
    displayPeriods, viewMode,
    allRefs, moduleOutputs, calculationResults, calculations,
    inputsEditMode, inputGlass, keyPeriods, indices,
    showFormulas, showDiff, showSolverInfo,
    onToggleFormulas, onToggleDiff, onToggleSolverInfo,
    aggregateValues
}) {
    if (!template || template.fullyConverted) return null

    const actualTemplate = MODULE_TEMPLATES[module.templateId]

    return (
        <div className="pt-3 border-t border-slate-100">
            <OutputToolbar
                module={module}
                template={template}
                inputsEditMode={inputsEditMode}
                showFormulas={showFormulas}
                showDiff={showDiff}
                showSolverInfo={showSolverInfo}
                onToggleFormulas={onToggleFormulas}
                onToggleDiff={onToggleDiff}
                onToggleSolverInfo={onToggleSolverInfo}
            />

            {/* Solver Info Panel */}
            {showSolverInfo && (
                <SolverInfoPanel module={module} moduleIndex={moduleIndex} moduleOutputs={moduleOutputs} />
            )}

            {/* Formula Panel */}
            {showFormulas && actualTemplate && (
                <FormulaPanel module={module} actualTemplate={actualTemplate} calculations={calculations} />
            )}

            {/* Diff View */}
            {showDiff && actualTemplate && (
                <DiffPanel module={module} actualTemplate={actualTemplate} calculations={calculations} />
            )}

            {/* Output tags */}
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

            {/* Time Series Preview for partial/solver modules */}
            {displayPeriods.length > 0 && (module.templateId !== 'iterative_debt_sizing' || module.solvedAt) && (
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
                    <TimeSeriesTable
                        module={module}
                        moduleIndex={moduleIndex}
                        displayPeriods={displayPeriods}
                        allRefs={allRefs}
                        moduleOutputs={moduleOutputs}
                        calculationResults={calculationResults}
                        calculations={calculations}
                        aggregateValues={aggregateValues}
                        isFullyConverted={false}
                    />
                </div>
            )}
        </div>
    )
}

/**
 * Module outputs section for fully converted modules.
 * Shows formula/diff panels and time series data table.
 */
function FullyConvertedOutputs({
    module, moduleIndex, template,
    displayPeriods,
    allRefs, moduleOutputs, calculationResults, calculations,
    inputsEditMode,
    showFormulas, showDiff,
    onToggleFormulas, onToggleDiff,
    aggregateValues
}) {
    if (!template?.fullyConverted || displayPeriods.length === 0) return null

    const actualTemplate = MODULE_TEMPLATES[module.templateId]

    return (
        <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700">
                    Fully Converted
                </span>
                <OutputToolbar
                    module={module}
                    template={{ ...template, fullyConverted: true }}
                    inputsEditMode={inputsEditMode}
                    showFormulas={showFormulas}
                    showDiff={showDiff}
                    showSolverInfo={false}
                    onToggleFormulas={onToggleFormulas}
                    onToggleDiff={onToggleDiff}
                    onToggleSolverInfo={() => {}}
                />
            </div>

            {/* Formula Panel */}
            {showFormulas && actualTemplate && (
                <FormulaPanel module={module} actualTemplate={actualTemplate} calculations={calculations} />
            )}

            {/* Diff View */}
            {showDiff && actualTemplate && (
                <DiffPanel module={module} actualTemplate={actualTemplate} calculations={calculations} />
            )}

            <TimeSeriesTable
                module={module}
                moduleIndex={moduleIndex}
                displayPeriods={displayPeriods}
                allRefs={allRefs}
                moduleOutputs={moduleOutputs}
                calculationResults={calculationResults}
                calculations={calculations}
                aggregateValues={aggregateValues}
                isFullyConverted={true}
            />
        </div>
    )
}

export { PartialModuleOutputs, FullyConvertedOutputs }
