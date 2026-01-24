import React from 'react'
import { Plus, FolderPlus } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import DeleteCell from '../shared/DeleteCell'
import TotalCell from '../shared/TotalCell'
import PeriodHeaderCells from '../shared/PeriodHeaderCells'
import {
    formatPeriodLabel,
    formatNumber,
    getLookup2ValuesArray,
    spreadLookup2ValueToMonthly,
    groupInputsBySubgroup,
    getMonthsPerPeriod
} from '../utils/inputHelpers'

export default function LookupMode({
    group,
    groupInputs,
    periods,        // From generatePeriods() - model timeline
    config,
    viewMode = 'M',
    isCollapsed,
    isCellSelected,
    handleCellSelect,
    handleCellShiftSelect,
    onUpdateGroup,
    onAddInput,
    onUpdateInput,
    onRemoveInput,
    onAddSubgroup,
    onUpdateSubgroup,
    onRemoveSubgroup
}) {
    const subgroupedInputs = groupInputsBySubgroup(groupInputs, group)
    const selectedIndices = group.selectedIndices || {}
    const prefillEnabled = config.prefillLookups !== false

    // Helper to get selected input for a subgroup (using index)
    const getSelectedForSubgroup = (subgroupId, inputs) => {
        const key = subgroupId ?? 'root'
        const selectedIndex = selectedIndices[key] ?? 0
        return inputs[selectedIndex] || inputs[0]
    }

    const getSelectedIndexForSubgroup = (subgroupId) => {
        const key = subgroupId ?? 'root'
        return selectedIndices[key] ?? 0
    }

    const setSelectedIndexForSubgroup = (subgroupId, index) => {
        const key = subgroupId ?? 'root'
        const newSelectedIndices = { ...selectedIndices, [key]: index }
        onUpdateGroup(group.id, 'selectedIndices', newSelectedIndices)
    }

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
                            <PeriodHeaderCells periods={periods} frequency={group.frequency} />
                        </tr>
                    </thead>
                    <tbody>
                        {/* Show selected row for each subgroup */}
                        {subgroupedInputs.map(sg => {
                            if (sg.inputs.length === 0) return null
                            const selectedInput = getSelectedForSubgroup(sg.id, sg.inputs)
                            if (!selectedInput) return null
                            const selectedValues = getLookup2ValuesArray(selectedInput, periods, group.frequency)
                            const selectedTotal = selectedValues.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

                            return (
                                <tr key={sg.id ?? 'root'} className="bg-amber-50 border-b border-amber-200">
                                    <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-amber-50"></td>
                                    <td className="py-1 px-3 text-xs font-medium text-amber-800 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-amber-50">
                                        {sg.name ? `${sg.name}: ` : ''}{selectedInput.name}
                                    </td>
                                    <td className="py-1 px-3 text-right text-xs font-semibold text-amber-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-amber-50 border-r border-amber-200">
                                        {selectedTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                    </td>
                                    {selectedValues.map((val, i) => (
                                        <td key={i} className="py-1 px-0.5 text-right text-[11px] font-medium text-amber-800 min-w-[45px] w-[45px] border-r border-amber-100">
                                            {formatNumber(val, 1)}
                                        </td>
                                    ))}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        )
    }

    // Expanded View
    let globalRowIndex = 0

    return (
        <>
        <div className="overflow-x-auto">
            <table className="text-sm table-fixed">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-slate-50"></th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-slate-50">
                            Label
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-slate-50 border-r border-slate-300">
                            Total
                        </th>
                        <PeriodHeaderCells periods={periods} frequency={group.frequency} />
                    </tr>
                </thead>
                <tbody>
                    {subgroupedInputs.map((sg, sgIndex) => {
                        const selectedInput = getSelectedForSubgroup(sg.id, sg.inputs)
                        const selectedIndex = getSelectedIndexForSubgroup(sg.id)
                        const selectedValues = selectedInput ? getLookup2ValuesArray(selectedInput, periods, group.frequency) : []
                        const selectedTotal = selectedValues.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

                        return (
                            <React.Fragment key={sg.id ?? 'root'}>
                                {/* Subgroup header (only if has subgroup id) */}
                                {sg.id && (
                                    <tr className="bg-blue-50 border-b border-blue-200 border-t-2 border-t-blue-300">
                                        <DeleteCell
                                            onDelete={() => onRemoveSubgroup?.(group.id, sg.id)}
                                            bgColor="bg-blue-50"
                                            sticky={true}
                                        />
                                        <td colSpan={periods.length + 2} className="py-1.5 px-3 sticky left-[32px] z-20 bg-blue-50">
                                            <EditableCell
                                                value={sg.name}
                                                onChange={(val) => onUpdateSubgroup?.(group.id, sg.id, 'name', val)}
                                                className="text-xs font-semibold text-blue-800"
                                            />
                                        </td>
                                    </tr>
                                )}

                                {/* Option rows for this subgroup */}
                                {sg.inputs.map((input, inputIdx) => {
                                    const rowIndex = globalRowIndex++
                                    const values = getLookup2ValuesArray(input, periods, group.frequency)
                                    const total = values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                                    const isSelected = inputIdx === selectedIndex
                                    const showSelectedHighlight = group.showSelected !== false && isSelected
                                    const bgColor = showSelectedHighlight ? 'bg-amber-50/30' : 'bg-white'

                                    return (
                                        <tr key={input.id} className={`border-b border-slate-100 hover:bg-blue-50/30 ${showSelectedHighlight ? 'bg-amber-50/30' : ''}`}>
                                            <DeleteCell
                                                onDelete={() => onRemoveInput(input.id)}
                                                bgColor={bgColor}
                                                sticky={true}
                                            />
                                            <td
                                                className={`py-0 px-0 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 ${sg.id ? 'pl-4' : ''} ${isCellSelected(group.id, rowIndex, -1) ? 'bg-blue-100' : bgColor}`}
                                                onClick={(e) => {
                                                    if (e.shiftKey) {
                                                        handleCellShiftSelect(group.id, rowIndex, -1)
                                                    } else {
                                                        handleCellSelect(group.id, rowIndex, -1)
                                                    }
                                                }}
                                            >
                                                <EditableCell
                                                    value={input.name}
                                                    onChange={(val) => onUpdateInput(input.id, 'name', val)}
                                                    className={`font-medium text-slate-700 ${sg.id ? 'pl-2' : ''}`}
                                                />
                                            </td>
                                            <TotalCell value={total} sticky={true} />
                                            {periods.map((p, i) => (
                                                <td
                                                    key={i}
                                                    className={`py-0 px-0 border-r border-slate-100 min-w-[45px] w-[45px] ${isCellSelected(group.id, rowIndex, i) ? 'bg-blue-100' : ''}`}
                                                    onClick={(e) => {
                                                        if (e.shiftKey) {
                                                            handleCellShiftSelect(group.id, rowIndex, i)
                                                        } else {
                                                            handleCellSelect(group.id, rowIndex, i)
                                                        }
                                                    }}
                                                >
                                                    <EditableCell
                                                        value={values[i]}
                                                        type="number"
                                                        onChange={(val) => {
                                                            const newValues = spreadLookup2ValueToMonthly(
                                                                input.values || {},
                                                                i,
                                                                val,
                                                                group.frequency
                                                            )
                                                            onUpdateInput(input.id, 'values', newValues)
                                                        }}
                                                        className="text-[11px]"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    )
                                })}

                                {/* Add option button for this subgroup */}
                                <tr className="bg-slate-50/30">
                                    <td colSpan={periods.length + 3} className={`py-1 ${sg.id ? 'pl-12' : 'pl-10'}`}>
                                        <button
                                            onClick={() => onAddInput(group.id, sg.id)}
                                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Add option
                                        </button>
                                    </td>
                                </tr>

                                {/* Selection row - moved below options */}
                                {group.showSelected !== false && (
                                    <tr className="bg-amber-50 border-t-2 border-amber-300 border-b-2 border-amber-300">
                                        <td className="py-0 px-1 w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-amber-50"></td>
                                        <td className="py-1 px-2 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-amber-50">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-amber-700">Selection:</span>
                                                <select
                                                    value={selectedIndex}
                                                    onChange={(e) => {
                                                        const newIndex = parseInt(e.target.value, 10)
                                                        setSelectedIndexForSubgroup(sg.id, newIndex)
                                                    }}
                                                    className="flex-1 text-xs bg-white border border-amber-300 rounded px-2 py-1 text-amber-900 font-medium"
                                                >
                                                    {sg.inputs.length === 0 && (
                                                        <option value={0}>-</option>
                                                    )}
                                                    {sg.inputs.map((input, idx) => (
                                                        <option key={idx} value={idx}>{input.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </td>
                                        <td className="py-1.5 px-3 text-right font-semibold text-amber-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-amber-50 border-r border-amber-300">
                                            {selectedTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                        </td>
                                        {selectedValues.map((val, i) => (
                                            <td key={i} className="py-1 px-0.5 text-right text-[11px] font-medium text-amber-800 border-r border-amber-100 min-w-[45px] w-[45px] bg-amber-50">
                                                {formatNumber(val, 1)}
                                            </td>
                                        ))}
                                    </tr>
                                )}
                            </React.Fragment>
                        )
                    })}

                    {/* Add subgroup button */}
                    <tr className="bg-slate-50/50">
                        <td colSpan={periods.length + 3} className="py-1 px-10">
                            <button
                                onClick={() => onAddSubgroup?.(group.id)}
                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600"
                            >
                                <FolderPlus className="w-3.5 h-3.5" />
                                Add lookup variable
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        {/* Generated Array Preview - uses viewMode frequency */}
        {(() => {
            // Generate preview periods based on viewMode (not group.frequency)
            const monthsPerPeriod = getMonthsPerPeriod(viewMode)
            let startYear = group.startYear ?? config.startYear ?? 2024
            let startMonth = group.startMonth ?? config.startMonth ?? 1
            if (group.startDate && !group.startYear) {
                const [y, m] = group.startDate.split('-').map(Number)
                startYear = y
                startMonth = m
            }
            const totalMonths = group.periods || 12

            // For FY view, align periods to fiscal year boundaries
            const previewPeriods = []
            const fyStartMonth = config?.fyStartMonth || 7

            if (viewMode === 'FY') {
                // Find the fiscal year that contains the start date
                let fyStartYear = startMonth < fyStartMonth ? startYear - 1 : startYear
                let fyStart = fyStartMonth

                // Calculate how many fiscal years we need
                const endYear = startYear + Math.floor((startMonth - 1 + totalMonths) / 12)
                const endMonth = ((startMonth - 1 + totalMonths) % 12) + 1
                const fyEndYear = endMonth < fyStartMonth ? endYear - 1 : endYear

                const numFYPeriods = fyEndYear - fyStartYear + 1

                for (let i = 0; i < numFYPeriods; i++) {
                    previewPeriods.push({
                        year: fyStartYear + i,
                        month: fyStart,
                        index: i,
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

            return (
        <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-2 px-3">
                Generated Array Preview ({viewMode === 'M' ? 'Monthly' : viewMode === 'Q' ? 'Quarterly' : viewMode === 'Y' ? 'Yearly' : 'Financial Year'})
            </div>
            <div className="overflow-x-auto">
                <table className="text-sm table-fixed">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-slate-50"></th>
                            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-slate-50">
                                {group.showSelected !== false ? 'Selected Values' : 'All Values'}
                            </th>
                            <th className="text-right py-1 px-3 text-xs font-semibold text-slate-500 uppercase w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-slate-50 border-r border-slate-300">
                                Total
                            </th>
                            <PeriodHeaderCells periods={previewPeriods} frequency={viewMode} config={config} />
                        </tr>
                    </thead>
                    <tbody>
                        {group.showSelected !== false ? (
                            // Show only selected values
                            <>
                                {subgroupedInputs.map(sg => {
                                    const selectedInput = getSelectedForSubgroup(sg.id, sg.inputs)
                                    if (!selectedInput) return null
                                    const rawValues = getLookup2ValuesArray(selectedInput, previewPeriods, viewMode)
                                    // Fill forward zeros (if enabled)
                                    const filledValues = []
                                    const isFilledFromPrev = []
                                    let lastNonZero = 0
                                    for (let i = 0; i < rawValues.length; i++) {
                                        if (rawValues[i] !== 0) {
                                            filledValues.push(rawValues[i])
                                            isFilledFromPrev.push(false)
                                            lastNonZero = rawValues[i]
                                        } else if (prefillEnabled) {
                                            filledValues.push(lastNonZero)
                                            isFilledFromPrev.push(lastNonZero !== 0)
                                        } else {
                                            filledValues.push(0)
                                            isFilledFromPrev.push(false)
                                        }
                                    }
                                    const selectedTotal = filledValues.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

                                    return (
                                        <React.Fragment key={sg.id ?? 'root'}>
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
                                            <tr className="border-b border-amber-100 bg-amber-50/30">
                                                <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-amber-50/30"></td>
                                                <td className={`py-1 px-3 text-xs font-medium text-amber-800 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-amber-50/30 ${sg.id ? 'pl-6' : ''}`}>
                                                    {selectedInput.name}
                                                </td>
                                                <td className="py-1 px-3 text-right text-xs font-semibold text-amber-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-amber-50/30 border-r border-amber-200">
                                                    {selectedTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                                </td>
                                                {filledValues.map((val, i) => (
                                                    <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[45px] w-[45px] border-r border-amber-100 ${isFilledFromPrev[i] ? 'bg-slate-200 text-slate-500' : 'text-amber-800'}`}>
                                                        {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''}
                                                    </td>
                                                ))}
                                            </tr>
                                        </React.Fragment>
                                    )
                                })}
                                {(() => {
                                    const groupPeriodTotals = previewPeriods.map((_, periodIdx) => {
                                        return subgroupedInputs.reduce((sum, sg) => {
                                            const selectedInput = getSelectedForSubgroup(sg.id, sg.inputs)
                                            if (!selectedInput) return sum
                                            const rawValues = getLookup2ValuesArray(selectedInput, previewPeriods, viewMode)
                                            // Fill forward for totals too (if enabled)
                                            if (prefillEnabled) {
                                                let lastNonZero = 0
                                                for (let i = 0; i <= periodIdx; i++) {
                                                    if (rawValues[i] !== 0) lastNonZero = rawValues[i]
                                                }
                                                return sum + (rawValues[periodIdx] !== 0 ? rawValues[periodIdx] : lastNonZero)
                                            }
                                            return sum + (parseFloat(rawValues[periodIdx]) || 0)
                                        }, 0)
                                    })
                                    const groupGrandTotal = groupPeriodTotals.reduce((sum, v) => sum + v, 0)

                                    return (
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
                                                    {formatNumber(val, 1)}
                                                </td>
                                            ))}
                                        </tr>
                                    )
                                })()}
                            </>
                        ) : (
                            // Show all values (not just selected)
                            <>
                                {subgroupedInputs.map(sg => (
                                    <React.Fragment key={sg.id ?? 'root'}>
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
                                        {sg.inputs.map(input => {
                                            const rawValues = getLookup2ValuesArray(input, previewPeriods, viewMode)
                                            // Fill forward zeros (if enabled)
                                            const filledValues = []
                                            const isFilledFromPrev = []
                                            let lastNonZero = 0
                                            for (let i = 0; i < rawValues.length; i++) {
                                                if (rawValues[i] !== 0) {
                                                    filledValues.push(rawValues[i])
                                                    isFilledFromPrev.push(false)
                                                    lastNonZero = rawValues[i]
                                                } else if (prefillEnabled) {
                                                    filledValues.push(lastNonZero)
                                                    isFilledFromPrev.push(lastNonZero !== 0)
                                                } else {
                                                    filledValues.push(0)
                                                    isFilledFromPrev.push(false)
                                                }
                                            }
                                            const total = filledValues.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

                                            return (
                                                <tr key={input.id} className="border-b border-slate-100">
                                                    <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-white"></td>
                                                    <td className={`py-1 px-3 text-xs font-medium text-slate-700 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-white ${sg.id ? 'pl-6' : ''}`}>
                                                        {input.name}
                                                    </td>
                                                    <td className="py-1 px-3 text-right text-xs font-semibold text-slate-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-slate-50 border-r border-slate-300">
                                                        {total.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                                    </td>
                                                    {filledValues.map((val, i) => (
                                                        <td key={i} className={`py-1 px-0.5 text-right text-[11px] min-w-[45px] w-[45px] border-r border-slate-100 ${isFilledFromPrev[i] ? 'bg-slate-200 text-slate-500' : 'text-slate-700'}`}>
                                                            {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''}
                                                        </td>
                                                    ))}
                                                </tr>
                                            )
                                        })}
                                    </React.Fragment>
                                ))}
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
            )
        })()}
        </>
    )
}
