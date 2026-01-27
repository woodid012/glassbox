import React, { memo } from 'react'
import { getAggregatedValueForArray, calculatePeriodValues, calculateTotal, formatValue } from '@/utils/valueAggregation'
import { getCachedRegex } from '@/utils/formulaEvaluator'
import { getViewModeLabel } from '@/utils/styleHelpers'

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

    // Build sample calculation breakdown (memoized within this render)
    const allRefs = { ...referenceMap, ...calculationResults }
    const sortedRefs = Object.keys(allRefs).sort((a, b) => b.length - a.length)
    // Filter to only refs that appear in the formula for performance
    const relevantRefs = sortedRefs.filter(ref => calc.formula?.includes(ref.split('.')[0]))
    let substitutedFormula = calc.formula
    for (const ref of relevantRefs) {
        const value = allRefs[ref]?.[sampleMonthIndex] ?? 0
        const formattedValue = value.toLocaleString('en-AU', { maximumFractionDigits: 2 })
        const regex = getCachedRegex(ref)
        regex.lastIndex = 0 // Reset for global patterns
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

export default CalculationPreview
