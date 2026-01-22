import React from 'react'
import { Trash2 } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import GeneratedArrayPreview from '../shared/GeneratedArrayPreview'
import SubgroupTable, { CollapsedSubgroupView } from '../shared/SubgroupTable'
import { formatPeriodLabel } from '../utils/inputHelpers'

export default function ConstantMode({
    group,
    groupInputs,
    periods,
    config,
    viewMode = 'M',
    keyPeriods = [],
    isCollapsed,
    onAddInput,
    onUpdateInput,
    onRemoveInput,
    onAddSubgroup,
    onUpdateSubgroup,
    onRemoveSubgroup
}) {
    // Collapsed View
    if (isCollapsed) {
        return (
            <CollapsedSubgroupView
                group={group}
                groupInputs={groupInputs}
                periods={periods}
                config={config}
                renderPeriodHeaders={() =>
                    periods.map((p, i) => (
                        <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[45px] w-[45px]">
                            {formatPeriodLabel(p.year, p.month, group.frequency)}
                        </th>
                    ))
                }
                renderPeriodCells={(periodTotals, type) =>
                    periodTotals.map((val, i) => (
                        <td
                            key={i}
                            className={`py-1 px-0.5 text-right text-[11px] min-w-[45px] w-[45px] ${
                                type === 'subgroup'
                                    ? 'font-medium text-blue-700 border-r border-blue-100'
                                    : 'font-semibold text-slate-700 border-r border-slate-100'
                            }`}
                        >
                            {val !== 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 1 }) : ''}
                        </td>
                    ))
                }
            />
        )
    }

    // Expanded View
    return (
        <>
            <div className="overflow-x-auto">
                <SubgroupTable
                    group={group}
                    groupInputs={groupInputs}
                    periods={periods}
                    config={config}
                    colSpan={5}
                    onAddInput={onAddInput}
                    onRemoveInput={onRemoveInput}
                    onAddSubgroup={onAddSubgroup}
                    onUpdateSubgroup={onUpdateSubgroup}
                    onRemoveSubgroup={onRemoveSubgroup}
                    renderHeaders={() => (
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
                    )}
                    renderSubgroupHeaderCells={() => (
                        <>
                            <td className="bg-blue-50"></td>
                            <td className="bg-blue-50"></td>
                        </>
                    )}
                    renderInputRow={(input, sg, rowIndex) => {
                        const constantValue = input.value ?? 0
                        const spreadMethod = input.spreadMethod || 'lookup'
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
                    }}
                    renderGroupTotalCells={() => (
                        <>
                            <td className="bg-slate-200"></td>
                            <td className="bg-slate-200"></td>
                        </>
                    )}
                />
            </div>

            <GeneratedArrayPreview
                group={group}
                groupInputs={groupInputs}
                config={config}
                viewMode={viewMode}
                keyPeriods={keyPeriods}
            />
        </>
    )
}
