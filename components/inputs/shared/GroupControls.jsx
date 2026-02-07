import React from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import EditableCell from './EditableCell'

// Generate period options for lookup start/end dropdowns based on frequency
// Uses the wider of model range vs group's current range so existing values always appear
function buildLookupDateOptions(config, group) {
    const freq = group.frequency || 'Y'
    // Extend range to cover both model timeline and group's current dates
    const rangeStartYear = Math.min(config.startYear || 2027, group.startYear || Infinity)
    const rangeStartMonth = (rangeStartYear < (config.startYear || 2027))
        ? (group.startMonth || 1)
        : Math.min(config.startMonth || 1, group.startMonth || 13)
    const rangeEndYear = Math.max(config.endYear || 2060, group.endYear || 0)
    const rangeEndMonth = (rangeEndYear > (config.endYear || 2060))
        ? (group.endMonth || 12)
        : Math.max(config.endMonth || 12, group.endMonth || 0)
    const options = []

    if (freq === 'Y' || freq === 'FY') {
        for (let y = rangeStartYear; y <= rangeEndYear; y++) {
            options.push({ value: `${y}-1`, label: `${y}`, year: y, month: 1 })
        }
    } else if (freq === 'Q') {
        for (let y = rangeStartYear; y <= rangeEndYear; y++) {
            const startQ = (y === rangeStartYear) ? Math.ceil(rangeStartMonth / 3) : 1
            const endQ = (y === rangeEndYear) ? Math.ceil(rangeEndMonth / 3) : 4
            for (let q = startQ; q <= endQ; q++) {
                const m = (q - 1) * 3 + 1
                options.push({ value: `${y}-${m}`, label: `Q${q} ${y}`, year: y, month: m })
            }
        }
    } else {
        // Monthly
        for (let y = rangeStartYear; y <= rangeEndYear; y++) {
            const startM = (y === rangeStartYear) ? rangeStartMonth : 1
            const endM = (y === rangeEndYear) ? rangeEndMonth : 12
            for (let m = startM; m <= endM; m++) {
                const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                options.push({ value: `${y}-${m}`, label: `${monthNames[m-1]} ${y}`, year: y, month: m })
            }
        }
    }
    return options
}

function LookupDateControls({ group, config, onUpdateGroup }) {
    const freq = group.frequency || 'Y'
    const options = buildLookupDateOptions(config, group)

    const startYear = group.startYear || config.startYear
    const startMonth = group.startMonth || config.startMonth || 1
    const endYear = group.endYear || config.endYear
    const endMonth = group.endMonth || config.endMonth || 12

    // Build dropdown values matching the option format
    // For CY/FY, options use month=1; actual start/endMonth may differ
    const startValue = (freq === 'Y' || freq === 'FY')
        ? `${startYear}-1`
        : (freq === 'Q')
            ? `${startYear}-${Math.floor((startMonth - 1) / 3) * 3 + 1}`
            : `${startYear}-${startMonth}`
    const endValue = (freq === 'Y' || freq === 'FY')
        ? `${endYear}-1`
        : (freq === 'Q')
            ? `${endYear}-${Math.floor((endMonth - 1) / 3) * 3 + 1}`
            : `${endYear}-${endMonth}`

    const handleStartChange = (value) => {
        const [y, m] = value.split('-').map(Number)
        // For CY, start at Jan; for Q, start at first month of quarter
        const actualStartMonth = (freq === 'Y' || freq === 'FY') ? 1 : m
        onUpdateGroup(group.id, 'startYear', y)
        onUpdateGroup(group.id, 'startMonth', actualStartMonth)
        const ey = group.endYear || config.endYear
        const em = group.endMonth || config.endMonth || 12
        const totalMonths = (ey - y) * 12 + (em - actualStartMonth) + 1
        onUpdateGroup(group.id, 'periods', totalMonths)
    }

    const handleEndChange = (value) => {
        const [y, m] = value.split('-').map(Number)
        // For CY/FY, end at December of that year; for Q, end at last month of quarter
        let actualEndMonth = m
        if (freq === 'Y' || freq === 'FY') actualEndMonth = 12
        else if (freq === 'Q') actualEndMonth = m + 2
        onUpdateGroup(group.id, 'endYear', y)
        onUpdateGroup(group.id, 'endMonth', actualEndMonth)
        const sy = group.startYear || config.startYear
        const sm = group.startMonth || config.startMonth || 1
        const totalMonths = (y - sy) * 12 + (actualEndMonth - sm) + 1
        onUpdateGroup(group.id, 'periods', totalMonths)
    }

    return (
        <>
            <span className="text-xs text-slate-500">Start:</span>
            <select
                value={startValue}
                onChange={(e) => handleStartChange(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700"
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
            <span className="text-xs text-slate-500">End:</span>
            <select
                value={endValue}
                onChange={(e) => handleEndChange(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700"
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </>
    )
}

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
    const showRange = entryMode !== 'lookup' && entryMode !== 'lookup2' && entryMode !== 'label'
    const isLookup = entryMode === 'lookup' || entryMode === 'lookup2'
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

    // Period range summary — format depends on interval frequency
    const periodSummary = (() => {
        if (periods.length === 0 || entryMode === 'label') return null
        const first = periods[0]
        const last = periods[periods.length - 1]
        const count = periods.length
        const freq = group.frequency || 'M'
        if (freq === 'Y') return `${first.year} - ${last.year} (${count} periods)`
        if (freq === 'FY') return `FY${first.year} - FY${last.year} (${count} periods)`
        if (freq === 'Q') {
            return `Q${Math.ceil(first.month / 3)} ${first.year} - Q${Math.ceil(last.month / 3)} ${last.year} (${count} periods)`
        }
        return `${String(first.month).padStart(2, '0')}/${first.year} - ${String(last.month).padStart(2, '0')}/${last.year} (${count} periods)`
    })()

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
                            onUpdateGroup(group.id, 'entryMode', e.target.value)
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
                                onChange={(e) => {
                                    const newFreq = e.target.value
                                    onUpdateGroup(group.id, 'frequency', newFreq)
                                    if (isLookup) {
                                        const sy = group.startYear || config.startYear
                                        let sm = group.startMonth || config.startMonth || 1
                                        const ey = group.endYear || config.endYear
                                        let em = group.endMonth || config.endMonth || 12
                                        // Snap months to align with the new frequency
                                        if (newFreq === 'Y' || newFreq === 'FY') {
                                            sm = 1
                                            em = 12
                                            onUpdateGroup(group.id, 'startMonth', sm)
                                            onUpdateGroup(group.id, 'endMonth', em)
                                        } else if (newFreq === 'Q') {
                                            sm = Math.floor((sm - 1) / 3) * 3 + 1
                                            em = Math.floor((em - 1) / 3) * 3 + 3
                                            onUpdateGroup(group.id, 'startMonth', sm)
                                            onUpdateGroup(group.id, 'endMonth', em)
                                        }
                                        const totalMonths = (ey - sy) * 12 + (em - sm) + 1
                                        onUpdateGroup(group.id, 'periods', totalMonths)
                                    }
                                }}
                                className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-700"
                            >
                                <option value="M">Monthly</option>
                                <option value="Q">Quarterly</option>
                                <option value="Y">{isLookup ? 'CY' : 'Annual'}</option>
                                <option value="FY">Fiscal Year</option>
                            </select>
                        </>
                    )}
                    {isLookup && (
                        <LookupDateControls group={group} config={config} onUpdateGroup={onUpdateGroup} />
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
