import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import {
    formatPeriodLabel,
    getValuesArray,
    calculatePeriodTotals
} from '../utils/inputHelpers'

export default function ConstantMode({
    group,
    groupInputs,
    periods,
    isCollapsed,
    onAddInput,
    onUpdateInput,
    onRemoveInput
}) {
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
                            <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-24 min-w-[96px] bg-slate-50 border-r border-slate-300">
                                Total
                            </th>
                            <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-28 min-w-[112px] bg-slate-50">
                                Value
                            </th>
                            <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-28 min-w-[112px] bg-slate-50">
                                Spread
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupInputs.map((input, rowIndex) => {
                            const constantValue = input.value ?? 0
                            const spreadMethod = input.spreadMethod || 'lookup'
                            // Total = value * number of periods (for lookup) or just value (for spread, it's divided)
                            const total = spreadMethod === 'lookup'
                                ? constantValue * periods.length
                                : constantValue

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
                                    <td className="py-1.5 px-3 text-right font-semibold text-slate-900 w-24 min-w-[96px] bg-slate-50 border-r border-slate-300">
                                        {total.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-0 px-1 w-28 min-w-[112px]">
                                        <EditableCell
                                            value={constantValue}
                                            type="number"
                                            onChange={(val) => onUpdateInput(input.id, 'value', val)}
                                            className="text-center text-[11px]"
                                        />
                                    </td>
                                    <td className="py-1 px-1 w-28 min-w-[112px]">
                                        <select
                                            value={spreadMethod}
                                            onChange={(e) => onUpdateInput(input.id, 'spreadMethod', e.target.value)}
                                            className="w-full text-xs bg-white border border-slate-200 rounded px-1 py-1 text-slate-700"
                                        >
                                            <option value="lookup">Lookup (Repeat)</option>
                                            <option value="spread">Spread (Divide)</option>
                                        </select>
                                    </td>
                                </tr>
                            )
                        })}
                        <tr className="bg-slate-50/30">
                            <td colSpan={5} className="py-1 pl-10">
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

            {/* Constant Array Preview */}
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
                            {groupInputs.map(input => {
                                const values = getValuesArray(input, periods, group.frequency, group)
                                const total = values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                                return (
                                    <tr key={input.id} className="border-b border-slate-100 hover:bg-blue-50/30">
                                        <td className="w-[32px] min-w-[32px] max-w-[32px] sticky left-0 z-30 bg-white"></td>
                                        <td className="py-1 px-3 text-xs text-slate-700 w-[192px] min-w-[192px] max-w-[192px] sticky left-[32px] z-20 bg-white">
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
