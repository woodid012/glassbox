import React, { useState, useEffect, memo } from 'react'
import { Trash2 } from 'lucide-react'
import { DeferredInput } from '@/components/DeferredInput'
import { getCalcTypeColorClasses } from '@/utils/styleHelpers'
import CalculationPreview from './CalculationPreview'

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
                        {calc._moduleId && (
                            <span className="text-[10px] px-1 py-0.5 rounded font-medium text-orange-700 bg-orange-100">
                                {calc._moduleId}
                            </span>
                        )}
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
                            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${getCalcTypeColorClasses(calcType)}`}
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
}, (prevProps, nextProps) => {
    // Custom comparison - only re-render when data props change
    // Ignore function props (onSelect, onUpdate*, onRemove) as they always change
    return (
        prevProps.calc.id === nextProps.calc.id &&
        prevProps.calc.name === nextProps.calc.name &&
        prevProps.calc.formula === nextProps.calc.formula &&
        prevProps.calc.type === nextProps.calc.type &&
        prevProps.calc._moduleId === nextProps.calc._moduleId &&
        prevProps.calcIndex === nextProps.calcIndex &&
        prevProps.calcRef === nextProps.calcRef &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.viewMode === nextProps.viewMode &&
        prevProps.calculationErrors?.[prevProps.calcRef] === nextProps.calculationErrors?.[nextProps.calcRef]
    )
})

export default CalcRow
