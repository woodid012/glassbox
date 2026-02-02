import React from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import EditableCell from './EditableCell'

export default function GroupControls({
    group,
    periods,
    config,
    keyPeriods,
    isCollapsed,
    onToggleGroup,
    onUpdateGroup,
    onRemoveGroup
}) {
    const entryMode = group.entryMode || 'values'
    const showRange = entryMode !== 'lookup' && entryMode !== 'label'
    const showInterval = entryMode === 'values' || entryMode === 'series' || entryMode === 'lookup' || entryMode === 'lookup2'
    const showSelected = entryMode === 'lookup' || entryMode === 'lookup2'

    // Resolve the range name from linkedKeyPeriodId
    const rangeName = (() => {
        const id = group.linkedKeyPeriodId
        if (!id || id === 'default') return 'Model'
        if (id === 'custom') return 'Custom'
        const kp = keyPeriods.find(k => String(k.id) === String(id))
        return kp ? kp.name : null
    })()

    // Period range summary
    const periodSummary = periods.length > 0 && entryMode !== 'lookup' && entryMode !== 'lookup2'
        ? `${String(periods[0].month).padStart(2, '0')}/${periods[0].year} - ${String(periods[periods.length - 1].month).padStart(2, '0')}/${periods[periods.length - 1].year} (${periods.length} periods)`
        : null

    return (
        <div className="bg-slate-100 px-4 py-2">
            {/* Row 1: Title + period range + delete */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onToggleGroup(group.id)}
                        className="p-0.5 hover:bg-slate-200 rounded"
                    >
                        {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-slate-600" />
                        )}
                    </button>
                    <EditableCell
                        value={group.name}
                        onChange={(val) => onUpdateGroup(group.id, 'name', val)}
                        className="font-semibold text-slate-900"
                    />
                    {rangeName && isCollapsed && (
                        <span className="text-xs text-indigo-600 font-medium whitespace-nowrap">{rangeName}</span>
                    )}
                    {periodSummary && (
                        <span className="text-xs text-slate-500 whitespace-nowrap">{periodSummary}</span>
                    )}
                </div>
                <button
                    onClick={() => onRemoveGroup(group.id)}
                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Row 2: Controls */}
            {!isCollapsed && (
                <div className="flex items-center gap-3 mt-1.5 ml-7">
                    {showRange && (
                        <>
                            <span className="text-xs text-slate-500">Range:</span>
                            <select
                                value={group.linkedKeyPeriodId || 'default'}
                                onChange={(e) => {
                                    const value = e.target.value
                                    onUpdateGroup(group.id, 'linkedKeyPeriodId', value === 'default' ? null : value)
                                    if (value !== 'default' && value !== 'custom') {
                                        const kp = keyPeriods.find(k => String(k.id) === value)
                                        if (kp) {
                                            const startYear = kp.startYear ?? config.startYear
                                            const startMonth = kp.startMonth ?? 1
                                            const endYear = kp.endYear ?? config.endYear
                                            const endMonth = kp.endMonth ?? 12
                                            const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
                                            onUpdateGroup(group.id, 'lookupStartYear', startYear)
                                            onUpdateGroup(group.id, 'lookupStartMonth', startMonth)
                                            onUpdateGroup(group.id, 'lookupEndYear', endYear)
                                            onUpdateGroup(group.id, 'lookupEndMonth', endMonth)
                                            onUpdateGroup(group.id, 'startYear', startYear)
                                            onUpdateGroup(group.id, 'startMonth', startMonth)
                                            onUpdateGroup(group.id, 'periods', totalMonths)
                                        }
                                    } else if (value === 'default') {
                                        onUpdateGroup(group.id, 'lookupStartYear', config.startYear)
                                        onUpdateGroup(group.id, 'lookupStartMonth', config.startMonth ?? 1)
                                        onUpdateGroup(group.id, 'lookupEndYear', config.endYear)
                                        onUpdateGroup(group.id, 'lookupEndMonth', config.endMonth ?? 12)
                                        onUpdateGroup(group.id, 'startYear', config.startYear)
                                        onUpdateGroup(group.id, 'startMonth', config.startMonth ?? 1)
                                        const totalMonths = (config.endYear - config.startYear) * 12 + ((config.endMonth ?? 12) - (config.startMonth ?? 1)) + 1
                                        onUpdateGroup(group.id, 'periods', totalMonths)
                                    }
                                }}
                                className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700"
                            >
                                <option value="default">Model</option>
                                <option value="custom">Custom</option>
                                {keyPeriods.map(kp => (
                                    <option key={kp.id} value={kp.id}>{kp.name}</option>
                                ))}
                            </select>
                        </>
                    )}
                    <span className="text-xs text-slate-500">Mode:</span>
                    <select
                        value={entryMode}
                        onChange={(e) => {
                            const newMode = e.target.value
                            onUpdateGroup(group.id, 'entryMode', newMode)
                            if (newMode === 'lookup') {
                                onUpdateGroup(group.id, 'linkedKeyPeriodId', 'custom')
                            }
                        }}
                        className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700"
                    >
                        <option value="values">Values</option>
                        <option value="constant">Constant</option>
                        <option value="series">Series</option>
                        <option value="formula">Formula</option>
                        <option value="lookup">Lookup</option>
                    </select>
                    {showInterval && (
                        <>
                            <span className="text-xs text-slate-500">Interval:</span>
                            <select
                                value={group.frequency || 'M'}
                                onChange={(e) => onUpdateGroup(group.id, 'frequency', e.target.value)}
                                className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700"
                            >
                                <option value="M">Monthly</option>
                                <option value="Q">Quarterly</option>
                                <option value="Y">Annual</option>
                                <option value="FY">Fiscal Year</option>
                            </select>
                        </>
                    )}
                    {showSelected && (
                        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={group.showSelected !== false}
                                onChange={(e) => onUpdateGroup(group.id, 'showSelected', e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            Selected
                        </label>
                    )}
                </div>
            )}
        </div>
    )
}
