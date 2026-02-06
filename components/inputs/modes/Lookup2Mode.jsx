import React from 'react'
import { Plus, Trash2, FolderPlus } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import {
    formatPeriodLabel,
    getLookup2ValuesArray,
    spreadLookup2ValueToMonthly,
    groupInputsBySubgroup
} from '../utils/inputHelpers'
import { getGroupRef } from '@/utils/groupRefResolver'

export default function Lookup2Mode({
    group,
    groupInputs,
    periods,        // From generatePeriods() - model timeline
    config,
    isCellSelected,
    handleCellSelect,
    handleCellShiftSelect,
    handleMultiCellPaste,
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
    const groupRef = getGroupRef(group, groupInputs)

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

    // Expanded View
    let globalRowIndex = 0
    const hasSubgroups = subgroupedInputs.some(sg => sg.id != null)

    return (
        <div className="overflow-x-auto">
            <table className="text-sm table-fixed">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-slate-50"></th>
                        <th className="text-left py-2 px-1 text-xs font-semibold text-slate-500 uppercase w-[52px] min-w-[52px] max-w-[52px] sticky left-[32px] z-25 bg-slate-50">
                            Ref
                        </th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[192px] min-w-[192px] max-w-[192px] sticky left-[84px] z-20 bg-slate-50">
                            Label
                        </th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[96px] min-w-[96px] max-w-[96px] sticky left-[276px] z-10 bg-slate-50 border-r border-slate-300">
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
                    {subgroupedInputs.map((sg, sgIndex) => {
                        const selectedInput = getSelectedForSubgroup(sg.id, sg.inputs)
                        const selectedIndex = getSelectedIndexForSubgroup(sg.id)
                        const rawSelectedValues = selectedInput ? getLookup2ValuesArray(selectedInput, periods, group.frequency) : []
                        let selectedValues = rawSelectedValues
                        if (prefillEnabled && rawSelectedValues.length > 0) {
                            let lastNonZero = 0
                            selectedValues = rawSelectedValues.map(val => {
                                if (val !== 0) { lastNonZero = val; return val }
                                return lastNonZero
                            })
                        }
                        const selectedTotal = selectedValues.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

                        // Formula ref for this subgroup's selected value
                        const selectionRef = hasSubgroups
                            ? `${groupRef}.${sgIndex + 1}`
                            : groupRef

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
                                        <td colSpan={periods.length + 4} className="py-1.5 px-3 sticky left-[32px] z-20 bg-blue-50">
                                            <div className="flex items-center gap-2">
                                                <EditableCell
                                                    value={sg.name}
                                                    onChange={(val) => onUpdateSubgroup?.(group.id, sg.id, 'name', val)}
                                                    className="text-xs font-semibold text-blue-800"
                                                />
                                            </div>
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

                                    // Option ref: sequential within the group (L1.1, L1.2, L1.3, ...)
                                    const optionRef = `${groupRef}.${rowIndex + 1}`

                                    return (
                                        <tr key={input.id} className={`border-b border-slate-100 hover:bg-blue-50/30 ${showSelectedHighlight ? 'bg-amber-50/30' : ''}`}>
                                            <td className={`py-0 px-1 w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 ${showSelectedHighlight ? 'bg-amber-50/30' : 'bg-white'}`}>
                                                <button
                                                    onClick={() => onRemoveInput(input.id)}
                                                    className="p-1 text-slate-300 hover:text-red-500"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                            <td className={`py-0 px-1 w-[52px] min-w-[52px] max-w-[52px] sticky left-[32px] z-25 ${showSelectedHighlight ? 'bg-amber-50/30' : 'bg-white'}`}>
                                                {groupRef && (
                                                    <span className="text-[10px] px-1 py-0.5 rounded font-mono text-slate-400 bg-slate-50 select-all">
                                                        {optionRef}
                                                    </span>
                                                )}
                                            </td>
                                            <td
                                                className={`py-0 px-0 w-[192px] min-w-[192px] max-w-[192px] sticky left-[84px] z-20 ${sg.id ? 'pl-4' : ''} ${isCellSelected(group.id, rowIndex, -1) ? 'bg-blue-100' : showSelectedHighlight ? 'bg-amber-50/30' : 'bg-white'}`}
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
                                            <td className="py-1.5 px-3 text-right font-semibold text-slate-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[276px] z-10 bg-slate-50 border-r border-slate-300">
                                                {total.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                            </td>
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
                                                        onPasteMultiCell={(text) => handleMultiCellPaste(text, group.id, rowIndex, i)}
                                                        className="text-[11px]"
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    )
                                })}

                                {/* Add option button for this subgroup */}
                                <tr className="bg-slate-50/30">
                                    <td colSpan={periods.length + 4} className={`py-1 ${sg.id ? 'pl-12' : 'pl-10'}`}>
                                        <button
                                            onClick={() => onAddInput(group.id, sg.id)}
                                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Add option
                                        </button>
                                    </td>
                                </tr>

                                {/* Selection row - shows the formula ref (L1, L1.1, etc.) */}
                                {group.showSelected !== false && (
                                    <tr className="bg-amber-50 border-t-2 border-amber-300 border-b-2 border-amber-300">
                                        <td className="py-0 px-1 w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-amber-50"></td>
                                        <td className="py-0 px-1 w-[52px] min-w-[52px] max-w-[52px] sticky left-[32px] z-25 bg-amber-50">
                                            <span className="text-[10px] px-1 py-0.5 rounded font-mono text-amber-700 bg-amber-100 font-bold select-all">
                                                {selectionRef}
                                            </span>
                                        </td>
                                        <td className="py-1 px-2 w-[192px] min-w-[192px] max-w-[192px] sticky left-[84px] z-20 bg-amber-50">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-amber-700">Selected:</span>
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
                                        <td className="py-1.5 px-3 text-right font-semibold text-amber-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[276px] z-10 bg-amber-50 border-r border-amber-300">
                                            {selectedTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                        </td>
                                        {selectedValues.map((val, i) => (
                                            <td key={i} className="py-1 px-0.5 text-right text-[11px] font-medium text-amber-800 border-r border-amber-100 min-w-[45px] w-[45px] bg-amber-50">
                                                {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                            </td>
                                        ))}
                                    </tr>
                                )}
                            </React.Fragment>
                        )
                    })}

                    {/* Add subgroup button */}
                    <tr className="bg-slate-50/50">
                        <td colSpan={periods.length + 4} className="py-1 px-10">
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
    )
}
