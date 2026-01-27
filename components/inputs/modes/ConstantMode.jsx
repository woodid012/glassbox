import React from 'react'
import { Trash2 } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import SubgroupTable from '../shared/SubgroupTable'

export default function ConstantMode({
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
                colSpan={3}
                hideTotal
                onAddInput={onAddInput}
                onRemoveInput={onRemoveInput}
                onAddSubgroup={onAddSubgroup}
                onUpdateSubgroup={onUpdateSubgroup}
                onRemoveSubgroup={onRemoveSubgroup}
                renderHeaders={() => (
                    <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="w-6 min-w-[24px] bg-slate-50"></th>
                        <th className="text-left py-1.5 px-3 text-xs font-semibold text-slate-500 uppercase w-80 min-w-[320px] bg-slate-50">
                            Label
                        </th>
                        <th className="text-center py-1.5 px-3 text-xs font-semibold text-slate-500 uppercase w-28 min-w-[112px] bg-slate-50">
                            Value
                        </th>
                    </tr>
                )}
                renderSubgroupHeaderCells={() => null}
                renderInputRow={(input, sg, rowIndex) => {
                    const constantValue = input.value ?? 0

                    return (
                        <tr key={input.id} className="border-b border-slate-100 hover:bg-blue-50/30 h-7">
                            <td className="py-0 px-0.5 w-6 min-w-[24px] bg-white">
                                <button
                                    onClick={() => onRemoveInput(input.id)}
                                    className="p-0.5 text-slate-300 hover:text-red-500"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </td>
                            <td className={`py-0 px-0 w-80 min-w-[320px] bg-white ${sg.id ? 'pl-4' : ''}`}>
                                <EditableCell
                                    value={input.name}
                                    onChange={(val) => onUpdateInput(input.id, 'name', val)}
                                    className={`font-medium text-slate-700 text-xs ${sg.id ? 'pl-2' : ''}`}
                                />
                            </td>
                            <td className="py-0 px-1 w-28 min-w-[112px]">
                                <EditableCell
                                    value={constantValue}
                                    type="number"
                                    onChange={(val) => onUpdateInput(input.id, 'value', val)}
                                    className="text-center text-[11px]"
                                />
                            </td>
                        </tr>
                    )
                }}
                renderGroupTotalCells={() => null}
            />
        </div>
    )
}
