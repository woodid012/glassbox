import React from 'react'
import {
    formatPeriodLabel,
    getValuesArray,
    calculatePeriodTotals,
    groupInputsBySubgroup,
    getMonthsPerPeriod
} from '../utils/inputHelpers'

/**
 * Shared Generated Array Preview component for ValuesMode, SeriesMode, and ConstantMode
 * Displays input values at the selected viewMode frequency
 */
export default function GeneratedArrayPreview({
    group,
    groupInputs,
    config,
    viewMode = 'M',
    keyPeriods = []
}) {
    // Generate preview periods based on viewMode (not group.frequency)
    const monthsPerPeriod = getMonthsPerPeriod(viewMode)

    // Resolve linked key period dates if applicable
    let startYear, startMonth, totalMonths
    if (keyPeriods && group.linkedKeyPeriodId) {
        const linkedKeyPeriod = keyPeriods.find(kp =>
            String(kp.id) === String(group.linkedKeyPeriodId)
        )
        if (linkedKeyPeriod) {
            startYear = linkedKeyPeriod.startYear ?? config.startYear ?? 2024
            startMonth = linkedKeyPeriod.startMonth ?? config.startMonth ?? 1
            totalMonths = linkedKeyPeriod.periods || 12
        } else {
            startYear = group.startYear ?? config.startYear ?? 2024
            startMonth = group.startMonth ?? config.startMonth ?? 1
            totalMonths = group.periods || 12
        }
    } else {
        startYear = group.startYear ?? config.startYear ?? 2024
        startMonth = group.startMonth ?? config.startMonth ?? 1
        if (group.startDate && !group.startYear) {
            const [y, m] = group.startDate.split('-').map(Number)
            startYear = y
            startMonth = m
        }
        totalMonths = group.periods || 12
    }

    // For FY view, align periods to fiscal year boundaries
    const previewPeriods = []
    const fyStartMonth = config?.fyStartMonth || 7

    if (viewMode === 'FY') {
        // Find the fiscal year that contains the start date
        // FY starts at fyStartMonth. If startMonth < fyStartMonth, we're in the FY ending this calendar year
        // If startMonth >= fyStartMonth, we're in the FY ending next calendar year
        let fyStartYear = startMonth < fyStartMonth ? startYear - 1 : startYear
        let fyStart = fyStartMonth

        // Calculate how many fiscal years we need
        // End date is startYear + totalMonths
        const endYear = startYear + Math.floor((startMonth - 1 + totalMonths) / 12)
        const endMonth = ((startMonth - 1 + totalMonths) % 12) + 1
        const fyEndYear = endMonth < fyStartMonth ? endYear - 1 : endYear

        const numFYPeriods = fyEndYear - fyStartYear + 1

        for (let i = 0; i < numFYPeriods; i++) {
            // Each FY period starts at fyStartMonth of fyStartYear + i
            previewPeriods.push({
                year: fyStartYear + i,
                month: fyStart,
                index: i,
                // Store FY info for label
                fyEndYear: fyStartYear + i + 1
            })
        }
    } else {
        // Standard period generation for M, Q, Y
        const numPreviewPeriods = Math.ceil(totalMonths / monthsPerPeriod)
        let currentYear = startYear
        let currentMonth = startMonth
        for (let i = 0; i < numPreviewPeriods; i++) {
            previewPeriods.push({ year: currentYear, month: currentMonth, index: i })
            currentMonth += monthsPerPeriod
            while (currentMonth > 12) {
                currentMonth -= 12
                currentYear += 1
            }
        }
    }

    const subgroupedInputs = groupInputsBySubgroup(groupInputs, group)
    const previewGroupTotals = calculatePeriodTotals(groupInputs, previewPeriods, viewMode, group, config)
    const previewGrandTotal = previewGroupTotals.reduce((sum, v) => sum + v, 0)

    const viewModeLabel = viewMode === 'M' ? 'Monthly' :
                          viewMode === 'Q' ? 'Quarterly' :
                          viewMode === 'Y' ? 'Yearly' : 'Financial Year'

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
                                    const values = getValuesArray(input, previewPeriods, viewMode, group, config)
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
                                                <td key={i} className="py-1 px-0.5 text-right text-[11px] text-slate-600 min-w-[45px] w-[45px] border-r border-slate-100">
                                                    {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''}
                                                </td>
                                            ))}
                                        </tr>
                                    )
                                })}
                                {/* Subgroup subtotal */}
                                {sg.id && (() => {
                                    const sgPeriodTotals = calculatePeriodTotals(sg.inputs, previewPeriods, viewMode, group, config)
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
}
