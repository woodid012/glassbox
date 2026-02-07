import React from 'react'
import { Trash2 } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import SubgroupTable from '../shared/SubgroupTable'
import {
    formatPeriodLabel,
    getValuesArray,
    spreadValueToMonthly
} from '../utils/inputHelpers'
import { getGroupRef } from '@/utils/groupRefResolver'

export default function ValuesMode({
    group,
    groupInputs,
    periods,
    config,
    isCellSelected,
    handleCellSelect,
    handleCellShiftSelect,
    handleMultiCellPaste,
    onAddInput,
    onUpdateInput,
    onRemoveInput,
    onAddSubgroup,
    onUpdateSubgroup,
    onRemoveSubgroup
}) {
    const groupRef = getGroupRef(group, groupInputs)
    const getInputRef = (input) => {
        const inputNum = group.id === 100 ? input.id - 99 : input.id
        return groupRef ? `${groupRef}.${inputNum}` : null
    }
    let globalRowIndex = 0

    return (
        <div className="overflow-x-auto">
            <SubgroupTable
                    group={group}
                    groupInputs={groupInputs}
                    periods={periods}
                    config={config}
                    colSpan={periods.length + 4}
                    onAddInput={onAddInput}
                    onRemoveInput={onRemoveInput}
                    onAddSubgroup={onAddSubgroup}
                    onUpdateSubgroup={onUpdateSubgroup}
                    onRemoveSubgroup={onRemoveSubgroup}
                    renderHeaders={() => (
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
                    )}
                    renderSubgroupHeaderCells={(sg, sgTotal, sgExtraData, sgPeriodTotals) => {
                        // sgPeriodTotals is pre-computed by SubgroupSection via useMemo
                        return (
                            <>
                                <td className="bg-blue-50"></td>
                                {sgPeriodTotals ? sgPeriodTotals.map((val, i) => (
                                    <td key={i} className="py-1 px-0.5 text-right text-[11px] text-blue-700 font-medium border-r border-blue-100 min-w-[45px] w-[45px]">
                                        {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                    </td>
                                )) : null}
                            </>
                        )
                    }}
                    renderInputRow={(input, sg, rowIndex) => {
                        const currentRowIndex = globalRowIndex++
                        const values = getValuesArray(input, periods, group.frequency, group, config)
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
                                <td className="py-0 px-1 w-[52px] min-w-[52px] max-w-[52px] sticky left-[32px] z-25 bg-white" title={getInputRef(input)}>
                                    <span className="text-[10px] px-1 py-0.5 rounded font-mono text-indigo-600 bg-indigo-50 select-all truncate block">
                                        {input.refName || getInputRef(input)}
                                    </span>
                                </td>
                                <td
                                    className={`py-0 px-0 w-[192px] min-w-[192px] max-w-[192px] sticky left-[84px] z-20 ${sg.id ? 'pl-4' : ''} ${isCellSelected(group.id, currentRowIndex, -1) ? 'bg-blue-100' : 'bg-white'}`}
                                    onClick={(e) => {
                                        if (e.shiftKey) {
                                            handleCellShiftSelect(group.id, currentRowIndex, -1)
                                        } else {
                                            handleCellSelect(group.id, currentRowIndex, -1)
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
                                        className={`py-0 px-0 border-r border-slate-100 min-w-[45px] w-[45px] ${isCellSelected(group.id, currentRowIndex, i) ? 'bg-blue-100' : ''}`}
                                        onClick={(e) => {
                                            if (e.shiftKey) {
                                                handleCellShiftSelect(group.id, currentRowIndex, i)
                                            } else {
                                                handleCellSelect(group.id, currentRowIndex, i)
                                            }
                                        }}
                                    >
                                        <EditableCell
                                            value={values[i]}
                                            type="number"
                                            onChange={(val) => {
                                                const newValues = spreadValueToMonthly(
                                                    input.values || {},
                                                    i,
                                                    val,
                                                    group.frequency,
                                                    periods
                                                )
                                                onUpdateInput(input.id, 'values', newValues)
                                            }}
                                            onPasteMultiCell={(text) => handleMultiCellPaste(text, group.id, currentRowIndex, i)}
                                            className="text-[11px]"
                                        />
                                    </td>
                                ))}
                            </tr>
                        )
                    }}
                    renderGroupTotalCells={(groupGrandTotal, groupExtraData, groupPeriodTotals) => {
                        // groupPeriodTotals is pre-computed by SubgroupTable via useMemo
                        return (
                            <>
                                <td className="bg-slate-200"></td>
                                {groupPeriodTotals ? groupPeriodTotals.map((val, i) => (
                                    <td key={i} className="py-1 px-0.5 text-right text-[11px] font-semibold text-slate-800 border-r border-slate-300 min-w-[45px] w-[45px]">
                                        {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                                    </td>
                                )) : null}
                            </>
                        )
                    }}
                />
        </div>
    )
}
