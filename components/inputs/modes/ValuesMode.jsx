import React from 'react'
import { Plus, Trash2, FolderPlus } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import {
    formatPeriodLabel,
    getValuesArray,
    spreadValueToMonthly,
    calculatePeriodTotals,
    groupInputsBySubgroup
} from '../utils/inputHelpers'

export default function ValuesMode({
    group,
    groupInputs,
    periods,
    isCollapsed,
    isCellSelected,
    handleCellSelect,
    handleCellShiftSelect,
    onAddInput,
    onUpdateInput,
    onRemoveInput,
    onAddSubgroup,
    onUpdateSubgroup,
    onRemoveSubgroup
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
                        {/* Subgroup subtotals */}
                        {subgroupedInputs.filter(sg => sg.id).map(sg => {
                            const sgPeriodTotals = calculatePeriodTotals(sg.inputs, periods, group.frequency, group)
                            const sgTotal = sgPeriodTotals.reduce((sum, v) => sum + v, 0)
                            return (
                                <tr key={sg.id} className="bg-blue-50 border-b border-blue-100">
                                    <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-blue-50"></td>
                                    <td className="py-1 px-3 text-xs font-medium text-blue-700 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-blue-50">
                                        {sg.name}
                                    </td>
                                    <td className="py-1 px-3 text-right text-xs font-semibold text-blue-800 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-blue-50 border-r border-blue-200">
                                        {sgTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                    </td>
                                    {sgPeriodTotals.map((val, i) => (
                                        <td key={i} className="py-1 px-0.5 text-right text-[11px] font-medium text-blue-700 min-w-[45px] w-[45px] border-r border-blue-100">
                                            {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                        </td>
                                    ))}
                                </tr>
                            )
                        })}
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
        )
    }

    // Expanded View
    let globalRowIndex = 0

    return (
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
                        {periods.map((p, i) => (
                            <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[45px] w-[45px]">
                                {formatPeriodLabel(p.year, p.month, group.frequency)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {subgroupedInputs.map((sg, sgIndex) => {
                        const sgPeriodTotals = calculatePeriodTotals(sg.inputs, periods, group.frequency, group)
                        const sgTotal = sgPeriodTotals.reduce((sum, v) => sum + v, 0)

                        return (
                            <React.Fragment key={sg.id || 'root'}>
                                {/* Subgroup header row */}
                                {sg.id && (
                                    <tr className="bg-blue-50 border-b border-blue-100">
                                        <td className="py-0 px-1 w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-blue-50">
                                            <button
                                                onClick={() => onRemoveSubgroup?.(group.id, sg.id)}
                                                className="p-1 text-slate-300 hover:text-red-500"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                        <td className="py-1.5 px-3 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-blue-50">
                                            <EditableCell
                                                value={sg.name}
                                                onChange={(val) => onUpdateSubgroup?.(group.id, sg.id, 'name', val)}
                                                className="font-semibold text-blue-800"
                                            />
                                        </td>
                                        <td className="py-1.5 px-3 text-right font-semibold text-blue-800 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-blue-50 border-r border-blue-200">
                                            {sgTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                        </td>
                                        {sgPeriodTotals.map((val, i) => (
                                            <td key={i} className="py-1 px-0.5 text-right text-[11px] text-blue-700 font-medium border-r border-blue-100 min-w-[45px] w-[45px]">
                                                {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                            </td>
                                        ))}
                                    </tr>
                                )}

                                {/* Input rows */}
                                {sg.inputs.map(input => {
                                    const rowIndex = globalRowIndex++
                                    const values = getValuesArray(input, periods, group.frequency, group)
                                    const total = values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

                                    return (
                                        <tr key={input.id} className="border-b border-slate-100 hover:bg-blue-50/30">
                                            <td className="py-0 px-1 w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-white">
                                                <button
                                                    onClick={() => onRemoveInput(input.id)}
                                                    className="p-1 text-slate-300 hover:text-red-500"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                            <td
                                                className={`py-0 px-0 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 ${sg.id ? 'pl-4' : ''} ${isCellSelected(group.id, rowIndex, -1) ? 'bg-blue-100' : 'bg-white'}`}
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
                                                            // Spread value to monthly when editing at higher frequency
                                                            const newValues = spreadValueToMonthly(
                                                                input.values || {},
                                                                i,
                                                                val,
                                                                group.frequency,
                                                                periods
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

                                {/* Add row for this subgroup */}
                                <tr className="bg-slate-50/30">
                                    <td colSpan={periods.length + 3} className={`py-1 ${sg.id ? 'pl-12' : 'pl-10'}`}>
                                        <button
                                            onClick={() => onAddInput(group.id, sg.id)}
                                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Add row
                                        </button>
                                    </td>
                                </tr>
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
                                Add subgroup
                            </button>
                        </td>
                    </tr>

                    {/* Group Subtotal row */}
                    <tr className="bg-slate-200 border-t-2 border-slate-300">
                        <td className="py-2 px-1 w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-slate-200"></td>
                        <td className="py-2 px-3 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-slate-200 font-bold text-slate-800">
                            {group.name} Total
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900 w-[96px] min-w-[96px] max-w-[96px] sticky left-[224px] z-10 bg-slate-200 border-r border-slate-300">
                            {groupGrandTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </td>
                        {groupPeriodTotals.map((val, i) => (
                            <td key={i} className="py-1 px-0.5 text-right text-[11px] font-semibold text-slate-800 border-r border-slate-300 min-w-[45px] w-[45px]">
                                {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    )
}
