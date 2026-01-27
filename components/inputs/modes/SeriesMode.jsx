import React from 'react'
import { Trash2 } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import SubgroupTable from '../shared/SubgroupTable'
import { formatPeriodLabel } from '../utils/inputHelpers'

// Helper to calculate count for an input
function calculateInputCount(input, periods, group) {
    const startDate = input.seriesStartDate || 'range'
    const endDate = input.seriesEndDate || 'range'
    let startIdx = 0
    let endIdx = periods.length
    if (startDate !== 'range') {
        const [y, m] = startDate.split('-').map(Number)
        const idx = periods.findIndex(p => p.year === y && p.month === m)
        if (idx !== -1) startIdx = idx
    }
    if (endDate !== 'range') {
        const [y, m] = endDate.split('-').map(Number)
        const idx = periods.findIndex(p => p.year === y && p.month === m)
        if (idx !== -1) endIdx = idx
    }
    const rangePeriods = Math.max(0, endIdx - startIdx)
    const seriesFreq = input.seriesFrequency || 'M'
    const seriesPeriodsPerYear = seriesFreq === 'Y' ? 1 : seriesFreq === 'Q' ? 4 : seriesFreq === 'FY' ? 1 : 12
    const groupFreq = group.frequency || 'M'
    const groupPeriodsPerYear = groupFreq === 'Y' ? 1 : groupFreq === 'Q' ? 4 : groupFreq === 'FY' ? 1 : 12
    return Math.round(rangePeriods * seriesPeriodsPerYear / groupPeriodsPerYear)
}

export default function SeriesMode({
    group,
    groupInputs,
    periods,
    config,
    onAddInput,
    onUpdateInput,
    onRemoveInput,
    onAddSubgroup,
    onUpdateSubgroup,
    onRemoveSubgroup
}) {
    return (
        <div className="overflow-x-auto">
            <SubgroupTable
                    group={group}
                    groupInputs={groupInputs}
                    periods={periods}
                    config={config}
                    colSpan={11}
                    onAddInput={onAddInput}
                    onRemoveInput={onRemoveInput}
                    onAddSubgroup={onAddSubgroup}
                    onUpdateSubgroup={onUpdateSubgroup}
                    onRemoveSubgroup={onRemoveSubgroup}
                    getSubgroupExtraData={(sg) => ({
                        count: sg.inputs.reduce((sum, input) => sum + calculateInputCount(input, periods, group), 0)
                    })}
                    getGroupExtraData={() => ({
                        count: groupInputs.reduce((sum, input) => sum + calculateInputCount(input, periods, group), 0)
                    })}
                    renderHeaders={() => (
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="w-8 min-w-[32px] bg-slate-50"></th>
                            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-48 min-w-[192px] bg-slate-50">
                                Label
                            </th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-24 min-w-[96px] bg-slate-50 border-r border-slate-300">
                                Total
                            </th>
                            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-24 min-w-[96px] bg-slate-50">
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
                    )}
                    renderSubgroupHeaderCells={(sg, sgTotal, sgExtraData) => (
                        <>
                            <td className="py-1.5 px-3 text-right font-semibold text-blue-800 w-24 min-w-[96px] bg-blue-50">
                                {sgExtraData?.count ?? 0}
                            </td>
                            <td className="bg-blue-50"></td>
                            <td className="bg-blue-50"></td>
                            <td className="bg-blue-50"></td>
                            <td className="bg-blue-50"></td>
                            <td className="bg-blue-50"></td>
                            <td className="bg-blue-50"></td>
                            <td className="bg-blue-50"></td>
                        </>
                    )}
                    renderInputRow={(input, sg, rowIndex) => {
                        const updateSeriesField = (field, value) => {
                            onUpdateInput(input.id, field, value)
                        }

                        // Calculate range periods
                        const startDate = input.seriesStartDate || 'range'
                        const endDate = input.seriesEndDate || 'range'
                        let startIdx = 0
                        let endIdx = periods.length
                        if (startDate !== 'range') {
                            const [y, m] = startDate.split('-').map(Number)
                            const idx = periods.findIndex(p => p.year === y && p.month === m)
                            if (idx !== -1) startIdx = idx
                        }
                        if (endDate !== 'range') {
                            const [y, m] = endDate.split('-').map(Number)
                            const idx = periods.findIndex(p => p.year === y && p.month === m)
                            if (idx !== -1) endIdx = idx
                        }
                        const rangePeriods = Math.max(0, endIdx - startIdx)

                        // Calculate values
                        const defaultAnnualValue = input.value ?? input.total ?? 0
                        const annualValue = input.seriesAnnualValue ?? defaultAnnualValue
                        const seriesFreq = input.seriesFrequency || 'M'
                        const seriesPeriodsPerYear = seriesFreq === 'Y' ? 1 : seriesFreq === 'Q' ? 4 : seriesFreq === 'FY' ? 1 : 12
                        const periodValue = annualValue / seriesPeriodsPerYear
                        const count = calculateInputCount(input, periods, group)
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
                                <td className={`py-0 px-0 w-48 min-w-[192px] bg-white ${sg.id ? 'pl-4' : ''}`}>
                                    <EditableCell
                                        value={input.name}
                                        onChange={(val) => onUpdateInput(input.id, 'name', val)}
                                        className={`font-medium text-slate-700 ${sg.id ? 'pl-2' : ''}`}
                                    />
                                </td>
                                <td className="py-1.5 px-3 text-right font-semibold text-slate-900 w-24 min-w-[96px] bg-slate-50 border-r border-slate-300">
                                    {total.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                </td>
                                <td className="py-1.5 px-3 text-right font-semibold text-slate-900 w-24 min-w-[96px] bg-slate-50">
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
                                        value={seriesFreq}
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
                                        value={startDate}
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
                                        value={endDate}
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
                    }}
                    renderGroupTotalCells={(groupGrandTotal, groupExtraData) => (
                        <>
                            <td className="py-2 px-3 text-right font-bold text-slate-900 w-24 min-w-[96px] bg-slate-200">
                                {groupExtraData?.count ?? 0}
                            </td>
                            <td className="bg-slate-200"></td>
                            <td className="bg-slate-200"></td>
                            <td className="bg-slate-200"></td>
                            <td className="bg-slate-200"></td>
                            <td className="bg-slate-200"></td>
                            <td className="bg-slate-200"></td>
                            <td className="bg-slate-200"></td>
                        </>
                    )}
                />
        </div>
    )
}
