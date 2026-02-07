import React, { useMemo } from 'react'
import { Trash2, Plus, FolderPlus } from 'lucide-react'
import EditableCell from '../shared/EditableCell'
import { groupInputsBySubgroup } from '../utils/inputHelpers'
import { getGroupRef } from '@/utils/groupRefResolver'

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
    const subgroupedInputs = useMemo(
        () => groupInputsBySubgroup(groupInputs, group),
        [groupInputs, group]
    )

    const groupRef = getGroupRef(group, groupInputs)
    const getInputRef = (input) => {
        const inputNum = group.id === 100 ? input.id - 99 : input.id
        return groupRef ? `${groupRef}.${inputNum}` : null
    }

    return (
        <div className="space-y-2">
            {subgroupedInputs.map(sg => (
                <div key={sg.id ?? 'root'}>
                    {/* Subgroup header */}
                    {sg.id && (
                        <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 rounded mb-1">
                            <button
                                onClick={() => onRemoveSubgroup?.(group.id, sg.id)}
                                className="p-0.5 text-slate-300 hover:text-red-500"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                            <EditableCell
                                value={sg.name}
                                onChange={(val) => onUpdateSubgroup?.(group.id, sg.id, 'name', val)}
                                className="font-semibold text-blue-800 text-xs"
                            />
                        </div>
                    )}
                    {/* Constants grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0">
                        {sg.inputs.map(input => {
                            const ref = getInputRef(input)
                            return (
                                <div key={input.id} className="flex items-center gap-1 py-0.5 px-1 rounded hover:bg-blue-50/30 min-w-0 group/row">
                                    <button
                                        onClick={() => onRemoveInput(input.id)}
                                        className="p-0.5 text-slate-200 hover:text-red-500 opacity-0 group-hover/row:opacity-100 flex-shrink-0"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                    {ref && (
                                        <span className="text-[10px] px-1 py-0.5 rounded font-mono text-indigo-600 bg-indigo-50 flex-shrink-0 select-all" title={ref}>
                                            {input.refName || ref}
                                        </span>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <EditableCell
                                            value={input.name}
                                            onChange={(val) => onUpdateInput(input.id, 'name', val)}
                                            className="font-medium text-slate-700 text-xs"
                                        />
                                    </div>
                                    <div className="w-20 flex-shrink-0">
                                        <EditableCell
                                            value={input.value ?? 0}
                                            type="number"
                                            onChange={(val) => onUpdateInput(input.id, 'value', val)}
                                            className="text-center text-[11px]"
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    {/* Add row button */}
                    <div className={`py-1 ${sg.id ? 'pl-8' : 'pl-6'}`}>
                        <button
                            onClick={() => onAddInput(group.id, sg.id)}
                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add row
                        </button>
                    </div>
                </div>
            ))}
            {/* Add subgroup button */}
            <div className="py-1 pl-6">
                <button
                    onClick={() => onAddSubgroup?.(group.id)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600"
                >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Add subgroup
                </button>
            </div>
        </div>
    )
}
