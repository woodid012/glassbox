import React from 'react'
import { Plus, Trash2, FolderPlus } from 'lucide-react'
import EditableCell from './EditableCell'
import {
    calculatePeriodTotals,
    groupInputsBySubgroup
} from '../utils/inputHelpers'

/**
 * Shared SubgroupTable component for ValuesMode, ConstantMode, and SeriesMode
 * Handles subgroup iteration, headers, totals, and add buttons
 *
 * Props:
 * - group: The input group object
 * - groupInputs: Array of inputs in this group
 * - periods: Array of period objects
 * - config: App config
 * - colSpan: Total number of columns (for colspan on buttons)
 * - onAddInput: (groupId, subgroupId) => void
 * - onRemoveInput: (inputId) => void
 * - onAddSubgroup: (groupId) => void
 * - onUpdateSubgroup: (groupId, subgroupId, field, value) => void
 * - onRemoveSubgroup: (groupId, subgroupId) => void
 *
 * Render props:
 * - renderHeaders: () => JSX - Renders the <tr> for column headers
 * - renderSubgroupHeaderCells: (sg, sgTotal, extraData) => JSX - Extra cells after name and total in subgroup header
 * - renderInputRow: (input, sg, rowIndex) => JSX - Renders the full <tr> for an input
 * - renderGroupTotalCells: (groupGrandTotal, extraData) => JSX - Extra cells after name and total in group total row
 * - getSubgroupExtraData: (sg) => any - Optional function to compute extra data for subgroup (e.g., count)
 * - getGroupExtraData: () => any - Optional function to compute extra data for group total
 */
export default function SubgroupTable({
    group,
    groupInputs,
    periods,
    config,
    colSpan,
    onAddInput,
    onRemoveInput,
    onAddSubgroup,
    onUpdateSubgroup,
    onRemoveSubgroup,
    renderHeaders,
    renderSubgroupHeaderCells,
    renderInputRow,
    renderGroupTotalCells,
    getSubgroupExtraData,
    getGroupExtraData
}) {
    const subgroupedInputs = groupInputsBySubgroup(groupInputs, group)
    const groupPeriodTotals = calculatePeriodTotals(groupInputs, periods, group.frequency, group, config)
    const groupGrandTotal = groupPeriodTotals.reduce((sum, v) => sum + v, 0)
    const groupExtraData = getGroupExtraData?.()

    return (
        <table className="text-sm table-fixed">
            <thead>
                {renderHeaders()}
            </thead>
            <tbody>
                {subgroupedInputs.map((sg, sgIndex) => {
                    const sgPeriodTotals = calculatePeriodTotals(sg.inputs, periods, group.frequency, group, config)
                    const sgTotal = sgPeriodTotals.reduce((sum, v) => sum + v, 0)
                    const sgExtraData = getSubgroupExtraData?.(sg)

                    return (
                        <React.Fragment key={sg.id || 'root'}>
                            {/* Subgroup header row */}
                            {sg.id && (
                                <tr className="bg-blue-50 border-b border-blue-100">
                                    <td className="py-0 px-1 w-8 min-w-[32px] bg-blue-50">
                                        <button
                                            onClick={() => onRemoveSubgroup?.(group.id, sg.id)}
                                            className="p-1 text-slate-300 hover:text-red-500"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                    <td className="py-1.5 px-3 w-48 min-w-[192px] bg-blue-50">
                                        <EditableCell
                                            value={sg.name}
                                            onChange={(val) => onUpdateSubgroup?.(group.id, sg.id, 'name', val)}
                                            className="font-semibold text-blue-800"
                                        />
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-semibold text-blue-800 w-24 min-w-[96px] bg-blue-50 border-r border-blue-200">
                                        {sgTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                    </td>
                                    {renderSubgroupHeaderCells?.(sg, sgTotal, sgExtraData)}
                                </tr>
                            )}

                            {/* Input rows */}
                            {sg.inputs.map((input, rowIndex) =>
                                renderInputRow(input, sg, rowIndex)
                            )}

                            {/* Add row for this subgroup */}
                            <tr className="bg-slate-50/30">
                                <td colSpan={colSpan} className={`py-1 ${sg.id ? 'pl-12' : 'pl-10'}`}>
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
                    <td colSpan={colSpan} className="py-1 px-10">
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
                    <td className="py-2 px-1 w-8 min-w-[32px] bg-slate-200"></td>
                    <td className="py-2 px-3 w-48 min-w-[192px] bg-slate-200 font-bold text-slate-800">
                        {group.name} Total
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900 w-24 min-w-[96px] bg-slate-200 border-r border-slate-300">
                        {groupGrandTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </td>
                    {renderGroupTotalCells?.(groupGrandTotal, groupExtraData)}
                </tr>
            </tbody>
        </table>
    )
}

/**
 * Collapsed view component - shows only subgroup and group totals
 * Used by all three modes (Values, Constant, Series)
 */
export function CollapsedSubgroupView({
    group,
    groupInputs,
    periods,
    config,
    renderPeriodHeaders,
    renderPeriodCells
}) {
    const subgroupedInputs = groupInputsBySubgroup(groupInputs, group)
    const groupPeriodTotals = calculatePeriodTotals(groupInputs, periods, group.frequency, group, config)
    const groupGrandTotal = groupPeriodTotals.reduce((sum, v) => sum + v, 0)

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
                        {renderPeriodHeaders()}
                    </tr>
                </thead>
                <tbody>
                    {/* Subgroup subtotals */}
                    {subgroupedInputs.filter(sg => sg.id).map(sg => {
                        const sgPeriodTotals = calculatePeriodTotals(sg.inputs, periods, group.frequency, group, config)
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
                                {renderPeriodCells(sgPeriodTotals, 'subgroup')}
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
                        {renderPeriodCells(groupPeriodTotals, 'total')}
                    </tr>
                </tbody>
            </table>
        </div>
    )
}
