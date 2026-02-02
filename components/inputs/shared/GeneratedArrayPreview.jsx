import React, { memo, useMemo } from 'react'
import {
    formatPeriodLabel,
    getValuesArray,
    calculatePeriodTotals,
    groupInputsBySubgroup,
    generatePeriods
} from '../utils/inputHelpers'

/**
 * Shared Generated Array Preview component for ValuesMode, SeriesMode, and ConstantMode
 * Displays input values at the selected viewMode frequency
 * Memoized to prevent re-renders when parent state changes but preview inputs are the same.
 */
const GeneratedArrayPreview = memo(function GeneratedArrayPreview({
    group,
    groupInputs,
    config,
    viewMode = 'M',
    keyPeriods = []
}) {
    const isLookupMode = group.entryMode === 'lookup' || group.entryMode === 'lookup2'
    const prefillEnabled = config?.prefillLookups !== false
    // Generate preview periods at viewMode frequency using shared function
    const previewPeriods = useMemo(
        () => generatePeriods(group, config, keyPeriods, viewMode),
        [group, config, keyPeriods, viewMode]
    )

    const subgroupedInputs = useMemo(
        () => groupInputsBySubgroup(groupInputs, group),
        [groupInputs, group]
    )

    const previewGroupTotals = useMemo(() => {
        const raw = calculatePeriodTotals(groupInputs, previewPeriods, viewMode, group, config)
        if (isLookupMode && prefillEnabled) {
            let lastNonZero = 0
            return raw.map(val => {
                if (val !== 0) { lastNonZero = val; return val }
                return lastNonZero
            })
        }
        return raw
    }, [groupInputs, previewPeriods, viewMode, group, config, isLookupMode, prefillEnabled])

    const previewGrandTotal = useMemo(
        () => previewGroupTotals.reduce((sum, v) => sum + v, 0),
        [previewGroupTotals]
    )

    const isConstant = group.entryMode === 'constant'

    const viewModeLabel = viewMode === 'M' ? 'Monthly' :
                          viewMode === 'Q' ? 'Quarterly' :
                          viewMode === 'Y' ? 'Yearly' : 'Financial Year'

    // Constants mode: show only label + constant value, no time periods
    if (isConstant) {
        return (
            <div className="mt-4 border-t border-slate-200 pt-3">
                <div className="overflow-x-auto">
                    <table className="text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="w-6 min-w-[24px] bg-slate-50"></th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-80 min-w-[320px] bg-slate-50">
                                    Label
                                </th>
                                <th className="text-center py-1.5 px-3 text-xs font-semibold text-slate-500 uppercase w-28 min-w-[112px] bg-slate-50">
                                    Constant
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {subgroupedInputs.map(sg => (
                                <React.Fragment key={sg.id ?? 'root'}>
                                    {sg.id && (
                                        <tr className="bg-blue-50 border-b border-blue-100">
                                            <td className="w-6 min-w-[24px] bg-blue-50"></td>
                                            <td colSpan={2} className="py-1 px-3 text-xs font-semibold text-blue-700 bg-blue-50">
                                                {sg.name}
                                            </td>
                                        </tr>
                                    )}
                                    {sg.inputs.map(input => (
                                        <tr key={input.id} className="border-b border-slate-100 hover:bg-blue-50/30 h-7">
                                            <td className="w-6 min-w-[24px] bg-white"></td>
                                            <td className={`py-0 px-3 text-xs text-slate-700 w-80 min-w-[320px] bg-white ${sg.id ? 'pl-6' : ''}`}>
                                                {input.name}
                                            </td>
                                            <td className="py-0 px-3 text-center text-xs font-medium text-slate-900 w-28 min-w-[112px]">
                                                {(input.value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }

    return (
        <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-2 px-3">
                Generated Time Series Preview ({viewModeLabel})
            </div>
            <div className="overflow-x-auto">
                <table className="text-sm table-fixed">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-slate-50"></th>
                            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-slate-50">
                                Label
                            </th>
                            <th className="text-right py-1 px-3 text-xs font-semibold text-slate-500 uppercase w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-slate-50 border-r border-slate-300">
                                Total
                            </th>
                            {previewPeriods.map((p, i) => (
                                <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[45px] w-[45px]">
                                    {formatPeriodLabel(p.year, p.month, viewMode, config)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Individual input rows with generated values */}
                        {subgroupedInputs.map(sg => (
                            <React.Fragment key={sg.id ?? 'root'}>
                                {/* Subgroup header if has id */}
                                {sg.id && (
                                    <tr className="bg-blue-50 border-b border-blue-100">
                                        <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-blue-50"></td>
                                        <td colSpan={2} className="py-1 px-3 text-xs font-semibold text-blue-700 sticky left-[32px] z-20 bg-blue-50">
                                            {sg.name}
                                        </td>
                                        {previewPeriods.map((_, i) => (
                                            <td key={i} className="bg-blue-50 border-r border-blue-100"></td>
                                        ))}
                                    </tr>
                                )}
                                {/* Input rows */}
                                {sg.inputs.map(input => {
                                    const rawValues = getValuesArray(input, previewPeriods, viewMode, group, config)
                                    // Apply forward-fill for lookup groups when prefill is enabled
                                    let values = rawValues
                                    if (isLookupMode && prefillEnabled) {
                                        let lastNonZero = 0
                                        values = rawValues.map(val => {
                                            if (val !== 0) { lastNonZero = val; return val }
                                            return lastNonZero
                                        })
                                    }
                                    const total = values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                                    return (
                                        <tr key={input.id} className="border-b border-slate-100 hover:bg-blue-50/30">
                                            <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-white"></td>
                                            <td className={`py-1 px-3 text-xs text-slate-700 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-white ${sg.id ? 'pl-6' : ''}`}>
                                                {input.name}
                                            </td>
                                            <td className="py-1 px-3 text-right text-xs font-medium text-slate-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-white border-r border-slate-200">
                                                {total.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                            </td>
                                            {values.map((val, i) => (
                                                <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[45px] w-[45px] border-r border-slate-100 ${isLookupMode && prefillEnabled && rawValues[i] === 0 && val !== 0 ? 'text-slate-400' : 'text-slate-600'}`}>
                                                    {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''}
                                                </td>
                                            ))}
                                        </tr>
                                    )
                                })}
                                {/* Subgroup subtotal */}
                                {sg.id && (() => {
                                    let sgPeriodTotals = calculatePeriodTotals(sg.inputs, previewPeriods, viewMode, group, config)
                                    if (isLookupMode && prefillEnabled) {
                                        let lastNonZero = 0
                                        sgPeriodTotals = sgPeriodTotals.map(val => {
                                            if (val !== 0) { lastNonZero = val; return val }
                                            return lastNonZero
                                        })
                                    }
                                    const sgTotal = sgPeriodTotals.reduce((sum, v) => sum + v, 0)
                                    return (
                                        <tr className="bg-blue-50/50 border-b border-blue-200">
                                            <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-blue-50/50"></td>
                                            <td className="py-1 px-3 text-xs font-medium text-blue-700 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-blue-50/50 pl-4">
                                                {sg.name} Subtotal
                                            </td>
                                            <td className="py-1 px-3 text-right text-xs font-semibold text-blue-800 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-blue-50/50 border-r border-blue-200">
                                                {sgTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                            </td>
                                            {sgPeriodTotals.map((val, i) => (
                                                <td key={i} className="py-1 px-0.5 text-right text-[11px] font-medium text-blue-700 min-w-[45px] w-[45px] border-r border-blue-100">
                                                    {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                                </td>
                                            ))}
                                        </tr>
                                    )
                                })()}
                            </React.Fragment>
                        ))}
                        {/* Group total */}
                        <tr className="bg-slate-100">
                            <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-slate-100"></td>
                            <td className="py-1.5 px-3 text-xs font-semibold text-slate-700 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-slate-100">
                                {group.name} Total
                            </td>
                            <td className="py-1.5 px-3 text-right text-xs font-bold text-slate-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-slate-100 border-r border-slate-300">
                                {previewGrandTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            </td>
                            {previewGroupTotals.map((val, i) => (
                                <td key={i} className="py-1 px-0.5 text-right text-[11px] font-semibold text-slate-700 min-w-[45px] w-[45px] border-r border-slate-100">
                                    {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
})

export default GeneratedArrayPreview
