import React from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import EditableCell from './EditableCell'
import { formatPeriodLabel, generateExtendedPeriods } from '../utils/inputHelpers'

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
    return (
        <div className="bg-slate-100 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
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
{group.entryMode !== 'lookup' && (
                    <>
                        <span className="text-xs text-slate-500">Range:</span>
                        <select
                            value={group.linkedKeyPeriodId || 'default'}
                            onChange={(e) => {
                                const value = e.target.value
                                onUpdateGroup(group.id, 'linkedKeyPeriodId', value === 'default' ? null : value)
                                // If a key period is selected (not Model or Custom), sync dates
                                if (value !== 'default' && value !== 'custom') {
                                    const kp = keyPeriods.find(k => String(k.id) === value)
                                    if (kp) {
                                        // Calculate values with fallbacks
                                        const startYear = kp.startYear ?? config.startYear
                                        const startMonth = kp.startMonth ?? 1
                                        const endYear = kp.endYear ?? config.endYear
                                        const endMonth = kp.endMonth ?? 12
                                        const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1

                                        // Update lookup properties (for Lookup mode)
                                        onUpdateGroup(group.id, 'lookupStartYear', startYear)
                                        onUpdateGroup(group.id, 'lookupStartMonth', startMonth)
                                        onUpdateGroup(group.id, 'lookupEndYear', endYear)
                                        onUpdateGroup(group.id, 'lookupEndMonth', endMonth)
                                        // Also update non-lookup properties (for Values/Series/Constant modes)
                                        onUpdateGroup(group.id, 'startYear', startYear)
                                        onUpdateGroup(group.id, 'startMonth', startMonth)
                                        onUpdateGroup(group.id, 'periods', totalMonths)
                                    }
                                } else if (value === 'default') {
                                    // Reset to model range - update lookup properties
                                    onUpdateGroup(group.id, 'lookupStartYear', config.startYear)
                                    onUpdateGroup(group.id, 'lookupStartMonth', config.startMonth ?? 1)
                                    onUpdateGroup(group.id, 'lookupEndYear', config.endYear)
                                    onUpdateGroup(group.id, 'lookupEndMonth', config.endMonth ?? 12)
                                    // Also update non-lookup properties
                                    onUpdateGroup(group.id, 'startYear', config.startYear)
                                    onUpdateGroup(group.id, 'startMonth', config.startMonth ?? 1)
                                    const totalMonths = (config.endYear - config.startYear) * 12 + ((config.endMonth ?? 12) - (config.startMonth ?? 1)) + 1
                                    onUpdateGroup(group.id, 'periods', totalMonths)
                                }
                            }}
                            className="text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-700"
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
                    value={group.entryMode || 'values'}
                    onChange={(e) => {
                        const newMode = e.target.value
                        onUpdateGroup(group.id, 'entryMode', newMode)
                        // Lookup mode always uses custom range (has its own Start/End pickers)
                        if (newMode === 'lookup') {
                            onUpdateGroup(group.id, 'linkedKeyPeriodId', 'custom')
                        }
                    }}
                    className="text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-700"
                >
                    <option value="values">Values</option>
                    <option value="constant">Constant</option>
                    <option value="series">Series</option>
                    <option value="formula">Formula</option>
                    <option value="lookup">Lookup</option>
                    <option value="lookup2">Lookup 2</option>
                </select>
                {((group.entryMode || 'values') === 'values' || group.entryMode === 'series' || group.entryMode === 'constant' || group.entryMode === 'lookup' || group.entryMode === 'lookup2') && (
                    <>
                        <span className="text-xs text-slate-500">Interval:</span>
                        <select
                            value={group.frequency || 'M'}
                            onChange={(e) => onUpdateGroup(group.id, 'frequency', e.target.value)}
                            className="text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-700"
                        >
                            <option value="M">Monthly</option>
                            <option value="Q">Quarterly</option>
                            <option value="Y">Annual</option>
                            <option value="FY">Fiscal Year</option>
                        </select>
                    </>
                )}
                {group.entryMode === 'lookup2' && (
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
                {group.entryMode === 'lookup' && (() => {
                    // Calculate these inside the conditional to ensure fresh values
                    const lookupExtendedPeriods = generateExtendedPeriods(config, group.frequency || 'M')
                    const lookupFreq = group.frequency || 'M'

                    // Snap month to period boundary based on frequency
                    // This ensures the value matches one of the dropdown options
                    const snapToPeriodStart = (month, freq) => {
                        if (freq === 'Y' || freq === 'FY') return 1
                        if (freq === 'Q') return Math.floor((month - 1) / 3) * 3 + 1
                        return month // Monthly - use exact month
                    }

                    const startMonth = group.lookupStartMonth ?? config.startMonth ?? 1
                    const endMonth = group.lookupEndMonth ?? config.endMonth ?? 12

                    const startValue = `${group.lookupStartYear ?? config.startYear ?? 2024}-${snapToPeriodStart(startMonth, lookupFreq)}`
                    const endValue = `${group.lookupEndYear ?? config.endYear ?? (config.startYear ?? 2024) + 1}-${snapToPeriodStart(endMonth, lookupFreq)}`

                    return (
                        <>
                            <span className="text-xs text-slate-500">Start:</span>
                            <select
                                value={startValue}
                                onChange={(e) => {
                                    const [year, month] = e.target.value.split('-').map(Number)
                                    onUpdateGroup(group.id, 'lookupStartYear', year)
                                    onUpdateGroup(group.id, 'lookupStartMonth', month)
                                    onUpdateGroup(group.id, 'linkedKeyPeriodId', 'custom')
                                }}
                                className="text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-700"
                            >
                                {lookupExtendedPeriods.map((p, i) => (
                                    <option key={`start-${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                                        {formatPeriodLabel(p.year, p.month, lookupFreq)}
                                    </option>
                                ))}
                            </select>
                            <span className="text-xs text-slate-500">End:</span>
                            <select
                                value={endValue}
                                onChange={(e) => {
                                    const [year, month] = e.target.value.split('-').map(Number)
                                    onUpdateGroup(group.id, 'lookupEndYear', year)
                                    onUpdateGroup(group.id, 'lookupEndMonth', month)
                                    onUpdateGroup(group.id, 'linkedKeyPeriodId', 'custom')
                                }}
                                className="text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-700"
                            >
                                {lookupExtendedPeriods.map((p, i) => (
                                    <option key={`end-${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                                        {formatPeriodLabel(p.year, p.month, lookupFreq)}
                                    </option>
                                ))}
                            </select>
                        </>
                    )
                })()}
                {group.entryMode !== 'lookup' && (
                    <span className="text-xs text-slate-500">
                        {periods.length > 0 && (
                            <>
                                {String(periods[0].month).padStart(2, '0')}/{periods[0].year} - {String(periods[periods.length - 1].month).padStart(2, '0')}/{periods[periods.length - 1].year} ({periods.length} periods)
                            </>
                        )}
                    </span>
                )}
            </div>
            <button
                onClick={() => onRemoveGroup(group.id)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    )
}
