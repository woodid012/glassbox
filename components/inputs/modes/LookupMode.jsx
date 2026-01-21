import React from 'react'
import { Plus, Trash2, FolderPlus } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import {
    formatPeriodLabel,
    getLookupValuesArray,
    getLookupValuesForModel,
    spreadLookupValueToMonthly,
    groupInputsBySubgroup,
    generateLookupPeriods,
    generateModelPeriods
} from '../utils/inputHelpers'

export default function LookupMode({
    group,
    groupInputs,
    config,
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
    const lookupPeriods = generateLookupPeriods(group, config)
    const subgroupedInputs = groupInputsBySubgroup(groupInputs, group)
    const selectedIndices = group.selectedIndices || {}

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
                            {lookupPeriods.map((p, i) => (
                                <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[45px] w-[45px]">
                                    {formatPeriodLabel(p.year, p.month, group.frequency)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Show selected row for each subgroup */}
                        {subgroupedInputs.map(sg => {
                            if (sg.inputs.length === 0) return null
                            const selectedInput = getSelectedForSubgroup(sg.id, sg.inputs)
                            if (!selectedInput) return null
                            const selectedValues = getLookupValuesArray(selectedInput, lookupPeriods, group.frequency, group, config)
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
                                            {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
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

    // Generate model timeline periods for preview
    const modelPeriods = generateModelPeriods(config, group.frequency)

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
                        {lookupPeriods.map((p, i) => (
                            <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[45px] w-[45px]">
                                {formatPeriodLabel(p.year, p.month, group.frequency)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {subgroupedInputs.map((sg, sgIndex) => {
                        const selectedInput = getSelectedForSubgroup(sg.id, sg.inputs)
                        const selectedIndex = getSelectedIndexForSubgroup(sg.id)
                        const selectedValues = selectedInput ? getLookupValuesArray(selectedInput, lookupPeriods, group.frequency, group, config) : []
                        const selectedTotal = selectedValues.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

                        return (
                            <React.Fragment key={sg.id ?? 'root'}>
                                {/* Subgroup header (only if has subgroup id) */}
                                {sg.id && (
                                    <tr className="bg-blue-50 border-b border-blue-200 border-t-2 border-t-blue-300">
                                        <td className="py-0 px-1 w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-blue-50">
                                            <button
                                                onClick={() => onRemoveSubgroup?.(group.id, sg.id)}
                                                className="p-1 text-slate-300 hover:text-red-500"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                        <td colSpan={lookupPeriods.length + 2} className="py-1.5 px-3 sticky left-[32px] z-20 bg-blue-50">
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
                                    const values = getLookupValuesArray(input, lookupPeriods, group.frequency, group, config)
                                    const total = values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                                    const isSelected = inputIdx === selectedIndex

                                    return (
                                        <tr key={input.id} className={`border-b border-slate-100 hover:bg-blue-50/30 ${isSelected ? 'bg-amber-50/30' : ''}`}>
                                            <td className={`py-0 px-1 w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 ${isSelected ? 'bg-amber-50/30' : 'bg-white'}`}>
                                                <button
                                                    onClick={() => onRemoveInput(input.id)}
                                                    className="p-1 text-slate-300 hover:text-red-500"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                            <td
                                                className={`py-0 px-0 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 ${sg.id ? 'pl-4' : ''} ${isCellSelected(group.id, rowIndex, -1) ? 'bg-blue-100' : isSelected ? 'bg-amber-50/30' : 'bg-white'}`}
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
                                            <td className="py-1.5 px-3 text-right font-semibold text-slate-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-slate-50 border-r border-slate-300">
                                                {total.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                            </td>
                                            {lookupPeriods.map((p, i) => (
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
                                                            const newValues = spreadLookupValueToMonthly(
                                                                input.values || {},
                                                                i,
                                                                val,
                                                                group.frequency,
                                                                group,
                                                                config
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
                                    <td colSpan={lookupPeriods.length + 3} className={`py-1 ${sg.id ? 'pl-12' : 'pl-10'}`}>
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
                                            {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                        </td>
                                    ))}
                                </tr>
                            </React.Fragment>
                        )
                    })}

                    {/* Add subgroup button */}
                    <tr className="bg-slate-50/50">
                        <td colSpan={lookupPeriods.length + 3} className="py-1 px-10">
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

        {/* Generated Array Preview - Model Timeline */}
        <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-2 px-3">
                Generated Array Preview
            </div>
            <div className="overflow-x-auto">
                <table className="text-sm table-fixed">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-slate-50"></th>
                            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-slate-50">
                                Selected Values
                            </th>
                            <th className="text-right py-1 px-3 text-xs font-semibold text-slate-500 uppercase w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-slate-50 border-r border-slate-300">
                                Total
                            </th>
                            {modelPeriods.map((p, i) => (
                                <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[45px] w-[45px]">
                                    {formatPeriodLabel(p.year, p.month, group.frequency)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Selected values for each subgroup */}
                        {subgroupedInputs.map(sg => {
                            const selectedInput = getSelectedForSubgroup(sg.id, sg.inputs)
                            if (!selectedInput) return null
                            const selectedValues = getLookupValuesForModel(selectedInput, modelPeriods, group.frequency, group, config)
                            const selectedTotal = selectedValues.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

                            return (
                                <React.Fragment key={sg.id ?? 'root'}>
                                    {/* Subgroup header if has id */}
                                    {sg.id && (
                                        <tr className="bg-blue-50 border-b border-blue-100">
                                            <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-blue-50"></td>
                                            <td colSpan={2} className="py-1 px-3 text-xs font-semibold text-blue-700 sticky left-[32px] z-20 bg-blue-50">
                                                {sg.name}
                                            </td>
                                            {modelPeriods.map((_, i) => (
                                                <td key={i} className="bg-blue-50 border-r border-blue-100"></td>
                                            ))}
                                        </tr>
                                    )}
                                    {/* Selected option row */}
                                    <tr className="border-b border-amber-100 bg-amber-50/30">
                                        <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-amber-50/30"></td>
                                        <td className={`py-1 px-3 text-xs font-medium text-amber-800 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-amber-50/30 ${sg.id ? 'pl-6' : ''}`}>
                                            {selectedInput.name}
                                        </td>
                                        <td className="py-1 px-3 text-right text-xs font-semibold text-amber-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-amber-50/30 border-r border-amber-200">
                                            {selectedTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                        </td>
                                        {selectedValues.map((val, i) => (
                                            <td key={i} className="py-1 px-0.5 text-right text-[11px] text-amber-800 min-w-[45px] w-[45px] border-r border-amber-100">
                                                {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''}
                                            </td>
                                        ))}
                                    </tr>
                                </React.Fragment>
                            )
                        })}
                        {/* Group total */}
                        {(() => {
                            // Calculate group totals by summing selected values across all subgroups
                            const groupPeriodTotals = modelPeriods.map((_, periodIdx) => {
                                return subgroupedInputs.reduce((sum, sg) => {
                                    const selectedInput = getSelectedForSubgroup(sg.id, sg.inputs)
                                    if (!selectedInput) return sum
                                    const values = getLookupValuesForModel(selectedInput, modelPeriods, group.frequency, group, config)
                                    return sum + (parseFloat(values[periodIdx]) || 0)
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
                                            {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                        </td>
                                    ))}
                                </tr>
                            )
                        })()}
                    </tbody>
                </table>
            </div>
        </div>
        </>
    )
}
