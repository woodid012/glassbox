import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import {
    formatPeriodLabel,
    getValuesArray,
    calculatePeriodTotals,
    groupInputsBySubgroup
} from '../utils/inputHelpers'

export default function SeriesMode({
    group,
    groupInputs,
    periods,
    isCollapsed,
    onAddInput,
    onUpdateInput,
    onRemoveInput
}) {
    const subgroupedInputs = groupInputsBySubgroup(groupInputs, group)
    const groupPeriodTotals = calculatePeriodTotals(groupInputs, periods, group.frequency, group)
    const groupGrandTotal = groupPeriodTotals.reduce((sum, v) => sum + v, 0)

    // Collapsed View
    if (isCollapsed) {
        return (
            <div className="overflow-x-auto">
                <table className="text-sm table-fixed">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-slate-50"></th>
                            <th className="w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-slate-50"></th>
                            <th className="text-right py-1 px-3 text-xs font-semibold text-slate-500 uppercase w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-slate-50 border-r border-slate-300">
                                Total
                            </th>
                            {periods.map((p, i) => (
                                <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[45px] w-[45px]">
                                    {formatPeriodLabel(p.year, p.month, group.frequency)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Group total only */}
                        <tr className="bg-slate-100">
                            <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-slate-100"></td>
                            <td className="py-1.5 px-3 text-xs font-semibold text-slate-700 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-slate-100">
                                {group.name} Total
                            </td>
                            <td className="py-1.5 px-3 text-right text-xs font-bold text-slate-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-slate-100 border-r border-slate-300">
                                {groupGrandTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            </td>
                            {groupPeriodTotals.map((val, i) => (
                                <td key={i} className="py-1 px-0.5 text-right text-[11px] font-semibold text-slate-700 min-w-[45px] w-[45px] border-r border-slate-100">
                                    {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        )
    }

    // Expanded View
    return (
        <>
            <div className="overflow-x-auto">
                <table className="text-sm table-fixed">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="w-8 min-w-[32px] bg-slate-50"></th>
                            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-48 min-w-[192px] bg-slate-50">
                                Label
                            </th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-24 min-w-[96px] bg-slate-50">
                                Total
                            </th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-24 min-w-[96px] bg-slate-50 border-r border-slate-300">
                                Count
                            </th>
                            <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-24 min-w-[96px] bg-slate-50">
                                Annual Value
                            </th>
                            <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-24 min-w-[96px] bg-slate-50">
                                Frequency
                            </th>
                            <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-28 min-w-[112px] bg-slate-50">
                                Payment Month
                            </th>
                            <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-24 min-w-[96px] bg-slate-50">
                                Period Value
                            </th>
                            <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-28 min-w-[112px] bg-slate-50">
                                Start Date
                            </th>
                            <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-28 min-w-[112px] bg-slate-50">
                                End Date
                            </th>
                            <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-20 min-w-[80px] bg-slate-50">
                                Range Periods
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupInputs.map((input, rowIndex) => {
                            // Handler to update series config field
                            const updateSeriesField = (field, value) => {
                                onUpdateInput(input.id, field, value)
                            }

                            // Calculate range periods between start and end date
                            const calcRangePeriods = () => {
                                const startDate = input.seriesStartDate || 'range'
                                const endDate = input.seriesEndDate || 'range'

                                let startIdx = 0
                                let endIdx = periods.length - 1

                                if (startDate !== 'range') {
                                    const [y, m] = startDate.split('-').map(Number)
                                    startIdx = periods.findIndex(p => p.year === y && p.month === m)
                                    if (startIdx === -1) startIdx = 0
                                }
                                if (endDate !== 'range') {
                                    const [y, m] = endDate.split('-').map(Number)
                                    endIdx = periods.findIndex(p => p.year === y && p.month === m)
                                    if (endIdx === -1) endIdx = periods.length - 1
                                }
                                return Math.max(0, endIdx - startIdx + 1)
                            }
                            const rangePeriods = calcRangePeriods()

                            // Calculate values based on series config
                            const defaultAnnualValue = input.value ?? input.total ?? 0
                            const annualValue = input.seriesAnnualValue ?? defaultAnnualValue
                            const seriesFreq = input.seriesFrequency || 'M'
                            const seriesPeriodsPerYear = seriesFreq === 'Y' ? 1 : seriesFreq === 'Q' ? 4 : seriesFreq === 'FY' ? 1 : 12
                            const periodValue = annualValue / seriesPeriodsPerYear

                            // Count = number of times value is used (based on series frequency)
                            const groupFreq = group.frequency || 'M'
                            const groupPeriodsPerYear = groupFreq === 'Y' ? 1 : groupFreq === 'Q' ? 4 : groupFreq === 'FY' ? 1 : 12
                            const count = Math.round(rangePeriods * seriesPeriodsPerYear / groupPeriodsPerYear)

                            // Total = count × period value
                            const total = count * periodValue

                            return (
                                <tr key={input.id} className="border-b border-slate-100 hover:bg-blue-50/30">
                                    <td className="py-0 px-1 w-8 min-w-[32px] bg-white">
                                        <button
                                            onClick={() => onRemoveInput(input.id)}
                                            className="p-1 text-slate-300 hover:text-red-500"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                    <td className="py-0 px-0 w-48 min-w-[192px] bg-white">
                                        <EditableCell
                                            value={input.name}
                                            onChange={(val) => onUpdateInput(input.id, 'name', val)}
                                            className="font-medium text-slate-700"
                                        />
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-semibold text-slate-900 w-24 min-w-[96px] bg-slate-50">
                                        {total.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-semibold text-slate-900 w-24 min-w-[96px] bg-slate-50 border-r border-slate-300">
                                        {count}
                                    </td>
                                    <td className="py-0 px-1 w-24 min-w-[96px]">
                                        <EditableCell
                                            value={annualValue}
                                            type="number"
                                            onChange={(val) => updateSeriesField('seriesAnnualValue', val)}
                                            className="text-center text-[11px]"
                                        />
                                    </td>
                                    <td className="py-1 px-1 w-24 min-w-[96px]">
                                        <select
                                            value={input.seriesFrequency || 'M'}
                                            onChange={(e) => updateSeriesField('seriesFrequency', e.target.value)}
                                            className="w-full text-xs bg-white border border-slate-200 rounded px-1 py-1 text-slate-700"
                                        >
                                            <option value="M">Monthly</option>
                                            <option value="Q">Quarterly</option>
                                            <option value="Y">Annual</option>
                                            <option value="FY">Fiscal Year</option>
                                        </select>
                                    </td>
                                    <td className="py-1 px-1 w-28 min-w-[112px]">
                                        <select
                                            value={input.seriesPaymentMonth || '1'}
                                            onChange={(e) => updateSeriesField('seriesPaymentMonth', e.target.value)}
                                            className="w-full text-xs bg-white border border-slate-200 rounded px-1 py-1 text-slate-700"
                                            disabled={seriesFreq === 'M'}
                                        >
                                            {seriesFreq === 'M' && <option value="1">Every Month</option>}
                                            {seriesFreq === 'Q' && (
                                                <>
                                                    <option value="1">1st Month</option>
                                                    <option value="2">2nd Month</option>
                                                    <option value="3">3rd Month</option>
                                                </>
                                            )}
                                            {(seriesFreq === 'Y' || seriesFreq === 'FY') && (
                                                <>
                                                    <option value="1">January</option>
                                                    <option value="2">February</option>
                                                    <option value="3">March</option>
                                                    <option value="4">April</option>
                                                    <option value="5">May</option>
                                                    <option value="6">June</option>
                                                    <option value="7">July</option>
                                                    <option value="8">August</option>
                                                    <option value="9">September</option>
                                                    <option value="10">October</option>
                                                    <option value="11">November</option>
                                                    <option value="12">December</option>
                                                </>
                                            )}
                                        </select>
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-xs text-slate-600 w-24 min-w-[96px]">
                                        {periodValue.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                                    </td>
                                    <td className="py-1 px-1 w-28 min-w-[112px]">
                                        <select
                                            value={input.seriesStartDate || 'range'}
                                            onChange={(e) => updateSeriesField('seriesStartDate', e.target.value)}
                                            className="w-full text-xs bg-white border border-slate-200 rounded px-1 py-1 text-slate-700"
                                        >
                                            <option value="range">Range Start</option>
                                            {periods.map((p, i) => {
                                                const gFreq = group.frequency || 'M'
                                                const label = gFreq === 'Y' || gFreq === 'FY'
                                                    ? `${p.year} (+${i} yr)`
                                                    : gFreq === 'Q'
                                                    ? `${formatPeriodLabel(p.year, p.month, 'Q')} (+${i} qtr)`
                                                    : `${formatPeriodLabel(p.year, p.month, 'M')} (+${i} mo)`
                                                return (
                                                    <option key={i} value={`${p.year}-${p.month}`}>
                                                        {label}
                                                    </option>
                                                )
                                            })}
                                        </select>
                                    </td>
                                    <td className="py-1 px-1 w-28 min-w-[112px]">
                                        <select
                                            value={input.seriesEndDate || 'range'}
                                            onChange={(e) => updateSeriesField('seriesEndDate', e.target.value)}
                                            className="w-full text-xs bg-white border border-slate-200 rounded px-1 py-1 text-slate-700"
                                        >
                                            <option value="range">Range End</option>
                                            {periods.map((p, i) => {
                                                const gFreq = group.frequency || 'M'
                                                const label = gFreq === 'Y' || gFreq === 'FY'
                                                    ? `${p.year} (+${i} yr)`
                                                    : gFreq === 'Q'
                                                    ? `${formatPeriodLabel(p.year, p.month, 'Q')} (+${i} qtr)`
                                                    : `${formatPeriodLabel(p.year, p.month, 'M')} (+${i} mo)`
                                                return (
                                                    <option key={i} value={`${p.year}-${p.month}`}>
                                                        {label}
                                                    </option>
                                                )
                                            })}
                                        </select>
                                    </td>
                                    <td className="py-1.5 px-3 text-center text-xs font-medium text-slate-700 w-20 min-w-[80px]">
                                        {rangePeriods}
                                    </td>
                                </tr>
                            )
                        })}

                        {/* Add row button */}
                        <tr className="bg-slate-50/30">
                            <td colSpan={11} className="py-1 pl-10">
                                <button
                                    onClick={() => onAddInput(group.id)}
                                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add row
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Series Array Preview */}
            <div className="mt-4 border-t border-slate-200 pt-3">
                <div className="text-xs font-semibold text-slate-500 uppercase mb-2 px-3">
                    Generated Time Series Preview
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
                                {periods.map((p, i) => (
                                    <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[45px] w-[45px]">
                                        {formatPeriodLabel(p.year, p.month, group.frequency)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {/* Individual input rows with generated series values */}
                            {subgroupedInputs.map(sg => (
                                <React.Fragment key={sg.id ?? 'root'}>
                                    {/* Subgroup header if has id */}
                                    {sg.id && (
                                        <tr className="bg-blue-50 border-b border-blue-100">
                                            <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-blue-50"></td>
                                            <td colSpan={2} className="py-1 px-3 text-xs font-semibold text-blue-700 sticky left-[32px] z-20 bg-blue-50">
                                                {sg.name}
                                            </td>
                                            {periods.map((_, i) => (
                                                <td key={i} className="bg-blue-50 border-r border-blue-100"></td>
                                            ))}
                                        </tr>
                                    )}
                                    {/* Input rows */}
                                    {sg.inputs.map(input => {
                                        const values = getValuesArray(input, periods, group.frequency, group)
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
                                        const sgPeriodTotals = calculatePeriodTotals(sg.inputs, periods, group.frequency, group)
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
                                    {groupGrandTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                </td>
                                {groupPeriodTotals.map((val, i) => (
                                    <td key={i} className="py-1 px-0.5 text-right text-[11px] font-semibold text-slate-700 min-w-[45px] w-[45px] border-r border-slate-100">
                                        {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    )
}
