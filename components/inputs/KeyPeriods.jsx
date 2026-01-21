import React, { useState } from 'react'
import { Plus, Trash2, Link2, GripVertical } from 'lucide-react'
import { theme, cn } from './theme'
import { YearMonthInput } from './InputField'

// Offset dropdown with options from -12 to +12
function OffsetInput({ value, onCommit }) {
    return (
        <select
            value={value}
            onChange={(e) => onCommit(parseInt(e.target.value))}
            className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] text-slate-900 w-14"
        >
            {[-12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                <option key={n} value={n}>{n > 0 ? `+${n}` : n}</option>
            ))}
        </select>
    )
}

export default function KeyPeriods({
    config,
    keyPeriods,
    onAddPeriod,
    onUpdatePeriod,
    onRemovePeriod,
    onReorderPeriods,
    onUpdateConfig,
    calculateLinkedStartPeriod,
    calculateLinkedEndPeriod,
    calculateLinkedAllPeriods,
    hasCircularDependency
}) {
    const [draggedIndex, setDraggedIndex] = useState(null)
    const [dragOverIndex, setDragOverIndex] = useState(null)
    const [expandedStartLinks, setExpandedStartLinks] = useState(new Set())
    const [expandedEndLinks, setExpandedEndLinks] = useState(new Set())

    // Helper function to normalize period IDs
    const normalizePeriodId = (periodId) => {
        if (periodId === 'default' || periodId === 'default-all' || periodId === null || periodId === undefined) {
            return periodId
        }
        const numId = typeof periodId === 'string' ? parseInt(periodId, 10) : periodId
        return isNaN(numId) ? periodId : numId
    }

    // Add months to a year/month pair
    const addMonths = (year, month, monthsToAdd) => {
        const totalMonths = year * 12 + (month - 1) + monthsToAdd
        return {
            year: Math.floor(totalMonths / 12),
            month: (totalMonths % 12) + 1
        }
    }

    // Calculate periods from start to end based on frequency
    const calculatePeriods = (startYear, startMonth, endYear, endMonth, frequency = 'monthly') => {
        const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
        const monthsPerPeriod = frequency === 'annual' ? 12 : frequency === 'quarterly' ? 3 : 1
        return Math.ceil(totalMonths / monthsPerPeriod)
    }

    // Calculate years from periods based on frequency
    const calculateYears = (periods, frequency = 'monthly') => {
        if (frequency === 'annual') return periods
        if (frequency === 'quarterly') return periods / 4
        if (frequency === 'monthly') return periods / 12
        return periods / 12
    }

    // Calculate end year/month from start and periods
    const calculateEndFromPeriods = (startYear, startMonth, periods, frequency = 'monthly') => {
        const monthsPerPeriod = frequency === 'annual' ? 12 : frequency === 'quarterly' ? 3 : 1
        const totalMonthsToAdd = (periods - 1) * monthsPerPeriod + (monthsPerPeriod - 1)
        return addMonths(startYear, startMonth, totalMonthsToAdd)
    }

    // Calculate default periods from config
    const defaultPeriods = calculatePeriods(config.startYear, config.startMonth, config.endYear, config.endMonth, config.minFrequency)
    const defaultYears = calculateYears(defaultPeriods, config.minFrequency)

    // Handle start date link change (combined value format: "periodId:anchor")
    const handleStartLinkChange = (periodId, combinedValue) => {
        if (combinedValue === '') {
            // Unlink start
            onUpdatePeriod(periodId, {
                startLinkedToPeriodId: null,
                startLinkToEnd: false,
                startLinkOffset: null
            })
        } else {
            const [linkedId, anchor] = combinedValue.split(':')
            const normalizedLinkedId = normalizePeriodId(linkedId)
            const linkToEnd = anchor === 'end'

            // Check for circular dependency
            if (hasCircularDependency && hasCircularDependency(periodId, normalizedLinkedId, keyPeriods)) {
                alert('Circular dependency detected!')
                return
            }

            const period = keyPeriods.find(p => p.id === periodId)
            // Default offset: linking to start = 0, linking to end = +1
            const defaultOffset = linkToEnd ? 1 : 0
            onUpdatePeriod(periodId, {
                startLinkedToPeriodId: normalizedLinkedId,
                startLinkToEnd: linkToEnd,
                startLinkOffset: period?.startLinkOffset || { value: defaultOffset, unit: 'months' }
            })

            // Auto-expand the offset details
            setExpandedStartLinks(prev => new Set(prev).add(periodId))

            // Recalculate start date
            recalculateStartDate(periodId, normalizedLinkedId, linkToEnd, period?.startLinkOffset || { value: defaultOffset, unit: 'months' })
        }
    }

    // Handle end date link change (combined value format: "periodId:anchor")
    const handleEndLinkChange = (periodId, combinedValue) => {
        if (combinedValue === '') {
            // Unlink end
            onUpdatePeriod(periodId, {
                endLinkedToPeriodId: null,
                endLinkToEnd: true,
                endLinkOffset: null
            })
        } else {
            const [linkedId, anchor] = combinedValue.split(':')
            const normalizedLinkedId = normalizePeriodId(linkedId)
            const linkToEnd = anchor === 'end'

            // Check for circular dependency
            if (hasCircularDependency && hasCircularDependency(periodId, normalizedLinkedId, keyPeriods)) {
                alert('Circular dependency detected!')
                return
            }

            const period = keyPeriods.find(p => p.id === periodId)
            // Default offset: linking to start = 0, linking to end = +1
            const defaultOffset = linkToEnd ? 1 : 0
            onUpdatePeriod(periodId, {
                endLinkedToPeriodId: normalizedLinkedId,
                endLinkToEnd: linkToEnd,
                endLinkOffset: period?.endLinkOffset || { value: defaultOffset, unit: 'months' }
            })

            // Auto-expand the offset details
            setExpandedEndLinks(prev => new Set(prev).add(periodId))

            // Recalculate end date
            recalculateEndDate(periodId, normalizedLinkedId, linkToEnd, period?.endLinkOffset || { value: defaultOffset, unit: 'months' })
        }
    }

    // Recalculate start date based on link
    const recalculateStartDate = (periodId, linkedToPeriodId, linkToEnd, offset) => {
        const period = keyPeriods.find(p => p.id === periodId)
        if (!period) return

        let refYear, refMonth
        if (linkedToPeriodId === 'default') {
            refYear = linkToEnd ? config.endYear : config.startYear
            refMonth = linkToEnd ? config.endMonth : config.startMonth
        } else {
            const linkedPeriod = keyPeriods.find(p => p.id === normalizePeriodId(linkedToPeriodId))
            if (!linkedPeriod) return
            refYear = linkToEnd ? linkedPeriod.endYear : linkedPeriod.startYear
            refMonth = linkToEnd ? linkedPeriod.endMonth : linkedPeriod.startMonth
        }

        // Apply offset
        let offsetMonths = offset?.value || 0
        if (offset?.unit === 'years') offsetMonths *= 12

        const newStart = addMonths(refYear, refMonth, offsetMonths)

        // Recalculate end if not linked
        if (!period.endLinkedToPeriodId) {
            const newEnd = calculateEndFromPeriods(newStart.year, newStart.month, period.periods || 1, config.minFrequency)
            onUpdatePeriod(periodId, {
                startYear: newStart.year,
                startMonth: newStart.month,
                endYear: newEnd.year,
                endMonth: newEnd.month
            })
        } else {
            onUpdatePeriod(periodId, {
                startYear: newStart.year,
                startMonth: newStart.month
            })
            // Recalculate periods
            setTimeout(() => recalculatePeriods(periodId), 0)
        }
    }

    // Recalculate end date based on link
    const recalculateEndDate = (periodId, linkedToPeriodId, linkToEnd, offset) => {
        const period = keyPeriods.find(p => p.id === periodId)
        if (!period) return

        let refYear, refMonth
        if (linkedToPeriodId === 'default') {
            refYear = linkToEnd ? config.endYear : config.startYear
            refMonth = linkToEnd ? config.endMonth : config.startMonth
        } else {
            const linkedPeriod = keyPeriods.find(p => p.id === normalizePeriodId(linkedToPeriodId))
            if (!linkedPeriod) return
            refYear = linkToEnd ? linkedPeriod.endYear : linkedPeriod.startYear
            refMonth = linkToEnd ? linkedPeriod.endMonth : linkedPeriod.startMonth
        }

        // Apply offset
        let offsetMonths = offset?.value || 0
        if (offset?.unit === 'years') offsetMonths *= 12

        const newEnd = addMonths(refYear, refMonth, offsetMonths)

        onUpdatePeriod(periodId, {
            endYear: newEnd.year,
            endMonth: newEnd.month
        })

        // Recalculate periods
        setTimeout(() => recalculatePeriods(periodId), 0)
    }

    // Recalculate periods count based on start and end
    const recalculatePeriods = (periodId) => {
        const period = keyPeriods.find(p => p.id === periodId)
        if (!period) return

        const newPeriods = calculatePeriods(period.startYear, period.startMonth, period.endYear, period.endMonth, config.minFrequency)
        onUpdatePeriod(periodId, { periods: newPeriods })
    }

    // Handle start date manual change
    const handleStartDateChange = (periodId, year, month) => {
        const period = keyPeriods.find(p => p.id === periodId)
        if (!period || period.startLinkedToPeriodId) return

        if (!period.endLinkedToPeriodId) {
            // End is not linked - keep periods count, adjust end
            const newEnd = calculateEndFromPeriods(year, month, period.periods || 1, config.minFrequency)
            onUpdatePeriod(periodId, {
                startYear: year,
                startMonth: month,
                endYear: newEnd.year,
                endMonth: newEnd.month
            })
        } else {
            // End is linked - adjust periods count
            onUpdatePeriod(periodId, {
                startYear: year,
                startMonth: month
            })
            setTimeout(() => recalculatePeriods(periodId), 0)
        }
    }

    // Handle end date manual change
    const handleEndDateChange = (periodId, year, month) => {
        const period = keyPeriods.find(p => p.id === periodId)
        if (!period || period.endLinkedToPeriodId) return

        onUpdatePeriod(periodId, {
            endYear: year,
            endMonth: month
        })
        setTimeout(() => recalculatePeriods(periodId), 0)
    }

    // Handle periods count change
    const handlePeriodsChange = (periodId, periods) => {
        const period = keyPeriods.find(p => p.id === periodId)
        if (!period) return

        const parsedPeriods = parseInt(periods) || 1

        if (!period.endLinkedToPeriodId) {
            // End is not linked - adjust end date
            const newEnd = calculateEndFromPeriods(period.startYear, period.startMonth, parsedPeriods, config.minFrequency)
            onUpdatePeriod(periodId, {
                periods: parsedPeriods,
                endYear: newEnd.year,
                endMonth: newEnd.month
            })
        } else {
            // End is linked - just update periods (user information)
            onUpdatePeriod(periodId, { periods: parsedPeriods })
        }
    }

    // Handle start link offset changes
    const handleStartOffsetChange = (periodId, field, value) => {
        const period = keyPeriods.find(p => p.id === periodId)
        if (!period || !period.startLinkedToPeriodId) return

        const newOffset = { ...period.startLinkOffset, [field]: field === 'value' ? parseInt(value) || 0 : value }
        onUpdatePeriod(periodId, { startLinkOffset: newOffset })
        recalculateStartDate(periodId, period.startLinkedToPeriodId, period.startLinkToEnd, newOffset)
    }

    // Handle start link to start/end toggle
    const handleStartLinkToEndChange = (periodId, linkToEnd) => {
        const period = keyPeriods.find(p => p.id === periodId)
        if (!period || !period.startLinkedToPeriodId) return

        onUpdatePeriod(periodId, { startLinkToEnd: linkToEnd })
        recalculateStartDate(periodId, period.startLinkedToPeriodId, linkToEnd, period.startLinkOffset)
    }

    // Handle end link offset changes
    const handleEndOffsetChange = (periodId, field, value) => {
        const period = keyPeriods.find(p => p.id === periodId)
        if (!period || !period.endLinkedToPeriodId) return

        const newOffset = { ...period.endLinkOffset, [field]: field === 'value' ? parseInt(value) || 0 : value }
        onUpdatePeriod(periodId, { endLinkOffset: newOffset })
        recalculateEndDate(periodId, period.endLinkedToPeriodId, period.endLinkToEnd, newOffset)
    }

    // Handle end link to start/end toggle
    const handleEndLinkToEndChange = (periodId, linkToEnd) => {
        const period = keyPeriods.find(p => p.id === periodId)
        if (!period || !period.endLinkedToPeriodId) return

        onUpdatePeriod(periodId, { endLinkToEnd: linkToEnd })
        recalculateEndDate(periodId, period.endLinkedToPeriodId, linkToEnd, period.endLinkOffset)
    }

    const getLinkedPeriodName = (linkedToPeriodId) => {
        if (linkedToPeriodId === 'default') return 'Model'
        const normalizedId = normalizePeriodId(linkedToPeriodId)
        const period = keyPeriods.find(p => p.id === normalizedId)
        return period ? period.name : 'Unknown'
    }

    // Drag and drop handlers
    const handleDragStart = (e, index) => {
        setDraggedIndex(index)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', index.toString())
        e.target.style.opacity = '0.5'
    }

    const handleDragOver = (e, index) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDragOverIndex(index)
    }

    const handleDragLeave = () => {
        setDragOverIndex(null)
    }

    const handleDrop = (e, dropIndex) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOverIndex(null)

        if (draggedIndex === null || draggedIndex === dropIndex) {
            setDraggedIndex(null)
            return
        }

        if (onReorderPeriods) {
            onReorderPeriods(draggedIndex, dropIndex)
        }

        setDraggedIndex(null)
    }

    const handleDragEnd = (e) => {
        e.target.style.opacity = '1'
        setDraggedIndex(null)
        setDragOverIndex(null)
    }

    // Generate colors for periods
    const periodColors = [
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
    ]
    const getPeriodColor = (index) => periodColors[index % periodColors.length]

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="w-8 px-1 py-2"></th>
                            <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">
                                Name
                            </th>
                            <th className="w-16 px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">
                                Periods
                            </th>
                            <th className="w-16 px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">
                                Years
                            </th>
                            <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">
                                Start Date
                            </th>
                            <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">
                                Link To
                            </th>
                            <th className="w-14 px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">
                                Offset
                            </th>
                            <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">
                                End Date
                            </th>
                            <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">
                                Link To
                            </th>
                            <th className="w-14 px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">
                                Offset
                            </th>
                            <th className="w-8 px-1 py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Default Model row */}
                        <tr className="bg-slate-100 border-b border-slate-200">
                            <td className="px-1 py-2"></td>
                            <td className="px-2 py-2">
                                <span className="text-xs font-semibold text-slate-700">Model</span>
                            </td>
                            <td className="px-2 py-2 text-center">
                                <span className="text-[11px] text-slate-600">{defaultPeriods}</span>
                            </td>
                            <td className="px-2 py-2 text-center">
                                <span className="text-[11px] text-slate-600">{defaultYears.toFixed(1)}</span>
                            </td>
                            <td className="px-2 py-2">
                                <YearMonthInput
                                    year={config.startYear}
                                    month={config.startMonth}
                                    onChange={({ year, month }) => {
                                        if (onUpdateConfig) {
                                            onUpdateConfig({ startYear: year, startMonth: month })
                                        }
                                    }}
                                    compact
                                />
                            </td>
                            <td className="px-2 py-2">
                                <span className="text-[10px] text-slate-400">—</span>
                            </td>
                            <td className="px-2 py-2 text-center">
                                <span className="text-[10px] text-slate-400">—</span>
                            </td>
                            <td className="px-2 py-2">
                                <YearMonthInput
                                    year={config.endYear}
                                    month={config.endMonth}
                                    onChange={({ year, month }) => {
                                        if (onUpdateConfig) {
                                            onUpdateConfig({ endYear: year, endMonth: month })
                                        }
                                    }}
                                    compact
                                />
                            </td>
                            <td className="px-2 py-2">
                                <span className="text-[10px] text-slate-400">—</span>
                            </td>
                            <td className="px-2 py-2 text-center">
                                <span className="text-[10px] text-slate-400">—</span>
                            </td>
                            <td className="px-1 py-2"></td>
                        </tr>

                        {/* Custom periods */}
                        {keyPeriods.map((period, index) => {
                            const periodsYears = calculateYears(period.periods || 1, config.minFrequency)
                            const hasStartLink = !!period.startLinkedToPeriodId
                            const hasEndLink = !!period.endLinkedToPeriodId

                            return (
                                <React.Fragment key={period.id}>
                                    {/* Main row */}
                                    <tr
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, index)}
                                        onDragOver={(e) => handleDragOver(e, index)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, index)}
                                        onDragEnd={handleDragEnd}
                                        className={cn(
                                            "border-b border-slate-100 hover:bg-slate-50 cursor-move",
                                            (hasStartLink || hasEndLink) && "bg-blue-50/30",
                                            draggedIndex === index && "opacity-50",
                                            dragOverIndex === index && "bg-indigo-50 border-t-2 border-indigo-400"
                                        )}
                                    >
                                        <td className="px-1 py-2">
                                            <div className="flex items-center justify-center text-slate-300 hover:text-slate-500">
                                                <GripVertical className="w-3 h-3" />
                                            </div>
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="text"
                                                value={period.name}
                                                onChange={(e) => onUpdatePeriod(period.id, { name: e.target.value })}
                                                className="bg-transparent border-0 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
                                                placeholder="Name"
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input
                                                type="number"
                                                value={period.periods || 1}
                                                onChange={(e) => handlePeriodsChange(period.id, e.target.value)}
                                                min="1"
                                                disabled={hasEndLink}
                                                className={cn(
                                                    "bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] text-slate-900 w-full text-center",
                                                    "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                                    hasEndLink && "bg-slate-100 text-slate-500"
                                                )}
                                            />
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                            <span className="text-[11px] text-slate-600">{periodsYears.toFixed(1)}</span>
                                        </td>
                                        <td className="px-2 py-2">
                                            <YearMonthInput
                                                year={period.startYear}
                                                month={period.startMonth}
                                                onChange={({ year, month }) => handleStartDateChange(period.id, year, month)}
                                                disabled={hasStartLink}
                                                compact
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex items-center gap-1">
                                                <select
                                                    value={period.startLinkedToPeriodId
                                                        ? `${period.startLinkedToPeriodId}:${period.startLinkToEnd ? 'end' : 'start'}`
                                                        : ''}
                                                    onChange={(e) => handleStartLinkChange(period.id, e.target.value)}
                                                    className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] text-slate-900"
                                                >
                                                    <option value="">—</option>
                                                    <option value="default:start">Model - Start</option>
                                                    <option value="default:end">Model - End</option>
                                                    {keyPeriods.filter(p => p.id !== period.id).map(p => (
                                                        <React.Fragment key={p.id}>
                                                            <option value={`${p.id}:start`}>{p.name} - Start</option>
                                                            <option value={`${p.id}:end`}>{p.name} - End</option>
                                                        </React.Fragment>
                                                    ))}
                                                </select>
                                                {hasStartLink && (
                                                    <Link2 className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                            {hasStartLink ? (
                                                <OffsetInput
                                                    value={period.startLinkOffset?.value || 0}
                                                    onCommit={(val) => handleStartOffsetChange(period.id, 'value', val)}
                                                />
                                            ) : (
                                                <span className="text-[10px] text-slate-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2">
                                            <YearMonthInput
                                                year={period.endYear}
                                                month={period.endMonth}
                                                onChange={({ year, month }) => handleEndDateChange(period.id, year, month)}
                                                disabled={hasEndLink}
                                                compact
                                            />
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex items-center gap-1">
                                                <select
                                                    value={period.endLinkedToPeriodId
                                                        ? `${period.endLinkedToPeriodId}:${period.endLinkToEnd ? 'end' : 'start'}`
                                                        : ''}
                                                    onChange={(e) => handleEndLinkChange(period.id, e.target.value)}
                                                    className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] text-slate-900"
                                                >
                                                    <option value="">—</option>
                                                    <option value="default:start">Model - Start</option>
                                                    <option value="default:end">Model - End</option>
                                                    {keyPeriods.filter(p => p.id !== period.id).map(p => (
                                                        <React.Fragment key={p.id}>
                                                            <option value={`${p.id}:start`}>{p.name} - Start</option>
                                                            <option value={`${p.id}:end`}>{p.name} - End</option>
                                                        </React.Fragment>
                                                    ))}
                                                </select>
                                                {hasEndLink && (
                                                    <Link2 className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                            {hasEndLink ? (
                                                <OffsetInput
                                                    value={period.endLinkOffset?.value || 0}
                                                    onCommit={(val) => handleEndOffsetChange(period.id, 'value', val)}
                                                />
                                            ) : (
                                                <span className="text-[10px] text-slate-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-1 py-2">
                                            <button
                                                onClick={() => onRemovePeriod(period.id)}
                                                className="p-0.5 text-slate-300 hover:text-red-500"
                                                title="Remove"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>

                                </React.Fragment>
                            )
                        })}
                    </tbody>
                </table>

                {/* Add Period row */}
                <div className="px-3 py-2 border-t border-slate-100">
                    <button
                        onClick={onAddPeriod}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add period
                    </button>
                </div>
            </div>

            {/* Timeline Chart */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h3 className="text-xs font-semibold text-slate-600 mb-2">Timeline</h3>
                <div className="relative" style={{ minHeight: `${(keyPeriods.length + 1) * 28 + 36}px` }}>
                    {/* Timeline axis with year markers */}
                    <div className="relative ml-24 mb-6" style={{ height: '24px' }}>
                        <div className="absolute left-0 top-0 w-full h-px bg-slate-300"></div>
                        {(() => {
                            const modelStartTotal = config.startYear * 12 + config.startMonth
                            const modelEndTotal = config.endYear * 12 + config.endMonth
                            const totalMonths = modelEndTotal - modelStartTotal + 1
                            const years = []
                            for (let year = config.startYear; year <= config.endYear; year++) {
                                const yearStartTotal = year * 12 + 1
                                if (yearStartTotal >= modelStartTotal && yearStartTotal <= modelEndTotal) {
                                    const pos = ((yearStartTotal - modelStartTotal) / totalMonths) * 100
                                    years.push({ year, pos })
                                }
                            }
                            return years.map(({ year, pos }) => (
                                <div
                                    key={year}
                                    className="absolute top-0 transform -translate-x-1/2"
                                    style={{ left: `${pos}%` }}
                                >
                                    <div className="w-px h-2 bg-slate-400"></div>
                                    <div className="text-[9px] text-slate-500 mt-1 whitespace-nowrap text-center" style={{ width: '28px', marginLeft: '-14px' }}>
                                        {year}
                                    </div>
                                </div>
                            ))
                        })()}
                    </div>

                    {/* Period bars */}
                    {[
                        { id: 'default', name: 'Model', startYear: config.startYear, startMonth: config.startMonth, endYear: config.endYear, endMonth: config.endMonth },
                        ...keyPeriods
                    ].map((period, index) => {
                        const modelStartTotal = config.startYear * 12 + config.startMonth
                        const modelEndTotal = config.endYear * 12 + config.endMonth
                        const totalMonths = modelEndTotal - modelStartTotal + 1

                        const periodStartTotal = period.startYear * 12 + period.startMonth
                        const periodEndTotal = period.endYear * 12 + period.endMonth
                        const startPos = ((periodStartTotal - modelStartTotal) / totalMonths) * 100
                        const endPos = ((periodEndTotal - modelStartTotal + 1) / totalMonths) * 100
                        const width = Math.max(0.5, endPos - startPos)
                        const color = period.id === 'default' ? '#94A3B8' : getPeriodColor(index - 1)

                        return (
                            <div key={period.id} className="relative mb-1" style={{ height: '24px' }}>
                                <div className="absolute left-0 top-0 w-20 text-[10px] font-medium text-slate-600 pr-1 text-right truncate" style={{ lineHeight: '20px' }}>
                                    {period.name}
                                </div>
                                <div className="relative ml-24" style={{ height: '24px' }}>
                                    <div
                                        className="absolute top-0 rounded h-5 flex items-center justify-center text-[9px] font-medium text-white"
                                        style={{
                                            left: `${Math.max(0, startPos)}%`,
                                            width: `${Math.min(100 - startPos, width)}%`,
                                            backgroundColor: color,
                                            minWidth: '16px',
                                        }}
                                        title={period.name}
                                    >
                                        {width > 8 && (
                                            <span className="px-1 truncate">{period.name}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Legend */}
                <div className="mt-3 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap gap-3">
                        {keyPeriods.map((period, index) => (
                            <div key={period.id} className="flex items-center gap-1">
                                <div
                                    className="w-2.5 h-2.5 rounded-sm"
                                    style={{ backgroundColor: getPeriodColor(index) }}
                                ></div>
                                <span className="text-[10px] text-slate-500">{period.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
