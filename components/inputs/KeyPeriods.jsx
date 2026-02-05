import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Trash2, Link2, GripVertical, ChevronRight, ChevronDown, FolderPlus, FolderMinus, LogIn, LogOut, Unlink } from 'lucide-react'
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

// Badge showing periods derived from a constant reference
function PeriodsFromRefCell({ period, resolvePeriodsFromRef, editMode, onClearRef }) {
    const resolved = resolvePeriodsFromRef(period.periodsFromRef)
    const periods = resolved ? resolved.periods : period.periods || 0
    const tooltipText = resolved
        ? `${resolved.name} = ${resolved.value} years = ${resolved.periods} months`
        : `Constant ${period.periodsFromRef} not found`

    return (
        <div className="flex items-center justify-center gap-1">
            <span className="text-[11px] text-slate-700 font-medium">{periods}</span>
            <span
                className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded cursor-default font-semibold",
                    resolved ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-600"
                )}
                title={tooltipText}
            >
                {period.periodsFromRef}
            </span>
            {editMode && (
                <button
                    onClick={onClearRef}
                    className="p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                    title="Unlink from constant"
                >
                    <Unlink className="w-3 h-3" />
                </button>
            )}
        </div>
    )
}

// Dropdown button to link periods to a constant
function PeriodsRefLinkButton({ periodId, availableConstants, isOpen, onToggle, onSelect }) {
    const dropdownRef = useRef(null)

    useEffect(() => {
        if (!isOpen) return
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                onToggle()
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen, onToggle])

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={onToggle}
                className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded flex-shrink-0"
                title="Link periods to constant"
            >
                <Link2 className="w-3.5 h-3.5" />
            </button>
            {isOpen && (
                <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded shadow-lg py-1 min-w-[180px]">
                    <div className="px-2 py-1 text-[9px] text-slate-400 uppercase font-semibold border-b border-slate-100">
                        Link to constant (years)
                    </div>
                    {availableConstants.map(c => (
                        <button
                            key={c.id}
                            onClick={() => onSelect(c.ref)}
                            className="w-full text-left px-2 py-1 text-[11px] text-slate-700 hover:bg-blue-50 flex items-center justify-between"
                        >
                            <span>{c.ref} - {c.name}</span>
                            <span className="text-[10px] text-slate-400">{c.value}y = {c.periods}m</span>
                        </button>
                    ))}
                    {availableConstants.length === 0 && (
                        <div className="px-2 py-1 text-[10px] text-slate-400">No constants available</div>
                    )}
                </div>
            )}
        </div>
    )
}

export default function KeyPeriods({
    config,
    keyPeriods,
    inputGlass,
    editMode = true,
    collapsedKeyPeriodGroups = new Set(),
    onAddPeriod,
    onUpdatePeriod,
    onRemovePeriod,
    onReorderPeriods,
    onUpdateConfig,
    onConvertToGroup,
    onUngroupPeriod,
    onAddToGroup,
    onRemoveFromGroup,
    onToggleKeyPeriodGroup,
    calculateLinkedStartPeriod,
    calculateLinkedAllPeriods,
    hasCircularDependency
}) {
    const [draggedIndex, setDraggedIndex] = useState(null)
    const [dragOverIndex, setDragOverIndex] = useState(null)
    const [expandedStartLinks, setExpandedStartLinks] = useState(new Set())
    const [periodsRefDropdown, setPeriodsRefDropdown] = useState(null) // period id with open dropdown

    // Resolve a periodsFromRef like "C1.27" to { value, periods, name }
    const resolvePeriodsFromRef = (ref) => {
        if (!ref || !inputGlass) return null
        const match = ref.match(/^C1\.(\d+)$/)
        if (!match) return null
        const inputId = parseInt(match[1]) + 99
        const constant = inputGlass.find(inp => inp.id === inputId && inp.groupId === 100)
        if (!constant || typeof constant.value !== 'number') return null
        return { value: constant.value, periods: Math.round(constant.value * 12), name: constant.name }
    }

    // Get available constants for linking (numeric, year-like values from group 100)
    const availableConstants = useMemo(() => {
        if (!inputGlass) return []
        return inputGlass
            .filter(inp => inp.groupId === 100 && typeof inp.value === 'number' && inp.value > 0 && inp.value <= 100)
            .map(inp => ({
                id: inp.id,
                ref: `C1.${inp.id - 99}`,
                name: inp.name,
                value: inp.value,
                periods: Math.round(inp.value * 12)
            }))
    }, [inputGlass])

    // Organize periods for display: respect original order, inject children after their parent group
    const { displayPeriods, groupsMap } = useMemo(() => {
        const groups = keyPeriods.filter(p => p.isGroup)
        const childPeriods = keyPeriods.filter(p => p.parentGroupId)
        const childIds = new Set(childPeriods.map(p => p.id))

        // Build a map of group ID to its children (in order from childIds)
        const gMap = new Map()
        groups.forEach(g => {
            const gChildIds = g.childIds || []
            const orderedChildren = gChildIds
                .map(id => childPeriods.find(c => c.id === id))
                .filter(Boolean)
            gMap.set(g.id, orderedChildren)
        })

        // Build display order: iterate through keyPeriods in original order
        // - If it's a group, add it then add its children (if expanded)
        // - If it's a child, skip (already added after parent)
        // - If it's standalone, add it
        const display = []
        keyPeriods.forEach(p => {
            if (childIds.has(p.id)) {
                // Skip children - they're added after their parent group
                return
            }

            if (p.isGroup) {
                display.push({ ...p, displayType: 'group' })
                if (!collapsedKeyPeriodGroups.has(p.id)) {
                    const gChildren = gMap.get(p.id) || []
                    gChildren.forEach((child, idx) => {
                        display.push({
                            ...child,
                            displayType: 'child',
                            isLastChild: idx === gChildren.length - 1
                        })
                    })
                }
            } else {
                display.push({ ...p, displayType: 'standalone' })
            }
        })

        return { displayPeriods: display, groupsMap: gMap }
    }, [keyPeriods, collapsedKeyPeriodGroups])

    // Get available groups for "Add to Group" dropdown
    const availableGroups = useMemo(() => {
        return keyPeriods.filter(p => p.isGroup)
    }, [keyPeriods])

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
            {editMode && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="text-sm w-full" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: '3%' }} />
                        <col style={{ width: '19%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '3%' }} />
                    </colgroup>
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-1 py-1.5"></th>
                            <th className="px-1.5 py-1.5 text-left text-[11px] font-medium text-slate-600 uppercase">
                                Name
                            </th>
                            <th className="px-1.5 py-1.5 text-center text-[11px] font-medium text-slate-600 uppercase">
                                Periods
                            </th>
                            <th className="px-1.5 py-1.5 text-center text-[11px] font-medium text-slate-600 uppercase">
                                Years
                            </th>
                            <th className="px-1.5 py-1.5 text-left text-[11px] font-medium text-slate-600 uppercase">
                                Start
                            </th>
                            <th className="px-1.5 py-1.5 text-left text-[11px] font-medium text-slate-600 uppercase" colSpan="2">
                                Start Link
                            </th>
                            <th className="px-1.5 py-1.5 text-left text-[11px] font-medium text-slate-600 uppercase">
                                End
                            </th>
                            <th className="px-1 py-1.5 text-center text-[11px] font-medium text-slate-600 uppercase">
                                Group
                            </th>
                            <th className="px-1 py-1.5"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Default Model row */}
                        <tr className="bg-slate-100 border-b border-slate-200">
                            <td className="px-1 py-1"></td>
                            <td className="px-1.5 py-1">
                                <span className="text-[11px] font-semibold text-slate-700">Model</span>
                            </td>
                            <td className="px-1.5 py-1 text-center">
                                <span className="text-[11px] text-slate-600">{defaultPeriods}</span>
                            </td>
                            <td className="px-1.5 py-1 text-center">
                                <span className="text-[11px] text-slate-600">{defaultYears.toFixed(1)}</span>
                            </td>
                            <td className="px-1.5 py-1">
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
                                <td className="px-1.5 py-1">
                                    <span className="text-[10px] text-slate-400">—</span>
                                </td>
                                <td className="px-1.5 py-1 text-center">
                                    <span className="text-[10px] text-slate-400">—</span>
                                </td>
                            <td className="px-1.5 py-1">
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
                            <td className="px-1 py-1"></td>
                            <td className="px-1 py-1"></td>
                        </tr>

                        {/* Custom periods - organized by groups */}
                        {displayPeriods.map((period, displayIndex) => {
                            const periodsYears = calculateYears(period.periods || 1, config.minFrequency)
                            const hasStartLink = !!period.startLinkedToPeriodId
                            const hasEndLink = !!period.endLinkedToPeriodId
                            const isGroup = period.displayType === 'group'
                            const isChild = period.displayType === 'child'
                            const isCollapsed = collapsedKeyPeriodGroups.has(period.id)
                            const childCount = isGroup ? (groupsMap.get(period.id) || []).length : 0

                            // Find the original index for drag/drop
                            const originalIndex = keyPeriods.findIndex(p => p.id === period.id)

                            return (
                                <React.Fragment key={period.id}>
                                    {/* Main row */}
                                    <tr
                                        draggable={!isChild}
                                        onDragStart={(e) => !isChild && handleDragStart(e, originalIndex)}
                                        onDragOver={(e) => handleDragOver(e, originalIndex)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, originalIndex)}
                                        onDragEnd={handleDragEnd}
                                        className={cn(
                                            "border-b border-slate-100 hover:bg-slate-50",
                                            !isChild && "cursor-move",
                                            isGroup && "bg-amber-50/50",
                                            isChild && "bg-slate-50/50",
                                            (hasStartLink || hasEndLink) && !isGroup && !isChild && "bg-blue-50/30",
                                            draggedIndex === originalIndex && "opacity-50",
                                            dragOverIndex === originalIndex && "bg-indigo-50 border-t-2 border-indigo-400"
                                        )}
                                    >
                                        <td className="px-1 py-1">
                                            <div className="flex items-center justify-center">
                                                {isGroup ? (
                                                    <button
                                                        onClick={() => onToggleKeyPeriodGroup && onToggleKeyPeriodGroup(period.id)}
                                                        className="text-slate-500 hover:text-slate-700"
                                                        title={isCollapsed ? 'Expand' : 'Collapse'}
                                                    >
                                                        {isCollapsed ? (
                                                            <ChevronRight className="w-3 h-3" />
                                                        ) : (
                                                            <ChevronDown className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                ) : isChild ? (
                                                    <span className="text-slate-300 text-[10px] pl-1">
                                                        {period.isLastChild ? '└' : '├'}
                                                    </span>
                                                ) : (
                                                    <div className="text-slate-300 hover:text-slate-500">
                                                        <GripVertical className="w-3 h-3" />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-1.5 py-1">
                                            <div className={cn("flex items-center gap-1", isChild && "pl-2")}>
                                                <input
                                                    type="text"
                                                    value={period.name}
                                                    onChange={(e) => onUpdatePeriod(period.id, { name: e.target.value })}
                                                    className={cn(
                                                        "bg-transparent border-0 text-[11px] w-full focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-0.5",
                                                        isGroup ? "font-semibold text-amber-800" : "text-slate-900"
                                                    )}
                                                    placeholder="Name"
                                                />
                                                {isGroup && childCount > 0 && (
                                                    <span className="text-[9px] text-amber-600 bg-amber-100 px-1 rounded">
                                                        {childCount}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-1.5 py-1 text-center">
                                            {isGroup ? (
                                                <span className="text-[11px] text-slate-600">{period.periods || 0}</span>
                                            ) : period.periodsFromRef ? (
                                                <PeriodsFromRefCell
                                                    period={period}
                                                    resolvePeriodsFromRef={resolvePeriodsFromRef}
                                                    editMode={editMode}
                                                    onClearRef={() => onUpdatePeriod(period.id, { periodsFromRef: undefined })}
                                                />
                                            ) : (
                                                <div className="flex items-center gap-0.5">
                                                    <input
                                                        type="number"
                                                        value={period.periods || 1}
                                                        onChange={(e) => handlePeriodsChange(period.id, e.target.value)}
                                                        min="1"
                                                        disabled={hasEndLink}
                                                        className={cn(
                                                            "bg-white border border-slate-200 rounded px-1 py-0 text-[11px] text-slate-900 w-full text-center",
                                                            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                                            hasEndLink && "bg-slate-100 text-slate-500"
                                                        )}
                                                    />
                                                    {editMode && !hasEndLink && (
                                                        <PeriodsRefLinkButton
                                                            periodId={period.id}
                                                            availableConstants={availableConstants}
                                                            isOpen={periodsRefDropdown === period.id}
                                                            onToggle={() => setPeriodsRefDropdown(prev => prev === period.id ? null : period.id)}
                                                            onSelect={(ref) => {
                                                                onUpdatePeriod(period.id, {
                                                                    periodsFromRef: ref,
                                                                    endLinkedToPeriodId: null,
                                                                    endLinkOffset: null
                                                                })
                                                                setPeriodsRefDropdown(null)
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-1.5 py-1 text-center">
                                            <span className="text-[11px] text-slate-600">{periodsYears.toFixed(1)}</span>
                                        </td>
                                        <td className="px-1.5 py-1">
                                            {isGroup ? (
                                                <div className="flex gap-0.5">
                                                    <div className="bg-white border border-slate-200 rounded px-1 py-0 text-[11px] text-slate-900 w-10">
                                                        {String(period.startMonth).padStart(2, '0')}
                                                    </div>
                                                    <div className="bg-white border border-slate-200 rounded px-1 py-0 text-[11px] text-slate-900 w-12">
                                                        {period.startYear}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1">
                                                    <YearMonthInput
                                                        year={period.startYear}
                                                        month={period.startMonth}
                                                        onChange={({ year, month }) => handleStartDateChange(period.id, year, month)}
                                                        disabled={hasStartLink}
                                                        compact
                                                    />
                                                </div>
                                            )}
                                        </td>
                                            <td className="px-1.5 py-1">
                                                {isGroup ? (
                                                    <span className="text-[10px] text-slate-400">—</span>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <select
                                                            value={period.startLinkedToPeriodId
                                                                ? `${period.startLinkedToPeriodId}:${period.startLinkToEnd ? 'end' : 'start'}`
                                                                : ''}
                                                            onChange={(e) => handleStartLinkChange(period.id, e.target.value)}
                                                            className="bg-white border border-slate-200 rounded px-1 py-0 text-[11px] text-slate-900"
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
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-1.5 py-1 text-center">
                                                {isGroup ? (
                                                    <span className="text-[10px] text-slate-400">—</span>
                                                ) : hasStartLink ? (
                                                    <OffsetInput
                                                        value={period.startLinkOffset?.value || 0}
                                                        onCommit={(val) => handleStartOffsetChange(period.id, 'value', val)}
                                                    />
                                                ) : (
                                                    <span className="text-[10px] text-slate-400">—</span>
                                                )}
                                            </td>
                                        <td className="px-1.5 py-1">
                                            {isGroup ? (
                                                <div className="flex gap-0.5">
                                                    <div className="bg-white border border-slate-200 rounded px-1 py-0 text-[11px] text-slate-900 w-10">
                                                        {String(period.endMonth).padStart(2, '0')}
                                                    </div>
                                                    <div className="bg-white border border-slate-200 rounded px-1 py-0 text-[11px] text-slate-900 w-12">
                                                        {period.endYear}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1">
                                                    <YearMonthInput
                                                        year={period.endYear}
                                                        month={period.endMonth}
                                                        onChange={({ year, month }) => handleEndDateChange(period.id, year, month)}
                                                        disabled={hasEndLink || !!period.periodsFromRef}
                                                        compact
                                                    />
                                                </div>
                                            )}
                                        </td>
                                        {/* Group actions column */}
                                        <td className="px-1 py-1">
                                            <div className="flex items-center justify-center gap-0.5">
                                                {isGroup ? (
                                                    // Ungroup button
                                                    <button
                                                        onClick={() => onUngroupPeriod && onUngroupPeriod(period.id)}
                                                        className="p-0 text-amber-500 hover:text-amber-700"
                                                        title="Ungroup"
                                                    >
                                                        <FolderMinus className="w-3 h-3" />
                                                    </button>
                                                ) : isChild ? (
                                                    // Remove from group button
                                                    <button
                                                        onClick={() => onRemoveFromGroup && onRemoveFromGroup(period.id)}
                                                        className="p-0 text-slate-400 hover:text-slate-600"
                                                        title="Remove from group"
                                                    >
                                                        <LogOut className="w-3 h-3" />
                                                    </button>
                                                ) : (
                                                    // Standalone: Make Group or Add to Group
                                                    <>
                                                        <button
                                                            onClick={() => onConvertToGroup && onConvertToGroup(period.id)}
                                                            className="p-0 text-slate-400 hover:text-amber-600"
                                                            title="Make this a group"
                                                        >
                                                            <FolderPlus className="w-3 h-3" />
                                                        </button>
                                                        {availableGroups.length > 0 && (
                                                            <select
                                                                value=""
                                                                onChange={(e) => {
                                                                    if (e.target.value && onAddToGroup) {
                                                                        onAddToGroup(period.id, parseInt(e.target.value))
                                                                    }
                                                                }}
                                                                className="bg-transparent border-0 text-[10px] text-slate-400 w-4 cursor-pointer"
                                                                title="Add to group"
                                                            >
                                                                <option value="">+</option>
                                                                {availableGroups.map(g => (
                                                                    <option key={g.id} value={g.id}>→ {g.name}</option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-1 py-1">
                                            <button
                                                onClick={() => onRemovePeriod(period.id)}
                                                className="p-0 text-slate-300 hover:text-red-500"
                                                title="Remove"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </td>
                                    </tr>

                                </React.Fragment>
                            )
                        })}
                    </tbody>
                </table>

                {/* Add Period row */}
                <div className="px-3 py-1.5 border-t border-slate-100">
                    <button
                        onClick={onAddPeriod}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600"
                    >
                        <Plus className="w-3 h-3" />
                        Add period
                    </button>
                </div>
            </div>
            )}

            {/* Timeline Chart */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h3 className="text-xs font-semibold text-slate-600 mb-2">Timeline</h3>
                <div className="relative" style={{ minHeight: `${(keyPeriods.length + 1) * 28 + 36}px` }}>
                    {/* Timeline axis with year markers */}
                    <div className="relative mb-6" style={{ height: '24px', marginLeft: 'calc(96px + 52px + 52px + 32px)' }}>
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

                    {/* Column headers */}
                    <div className="flex items-center mb-1" style={{ height: '18px' }}>
                        <div className="w-24 flex-shrink-0"></div>
                        <div className="w-[52px] flex-shrink-0 text-[9px] font-semibold text-slate-400 uppercase text-center">Start</div>
                        <div className="w-[52px] flex-shrink-0 text-[9px] font-semibold text-slate-400 uppercase text-center">End</div>
                        <div className="w-[32px] flex-shrink-0 text-[9px] font-semibold text-slate-400 uppercase text-center">Mths</div>
                        <div className="flex-1"></div>
                    </div>

                    {/* Period bars */}
                    {[
                        { id: 'default', name: 'Model', startYear: config.startYear, startMonth: config.startMonth, endYear: config.endYear, endMonth: config.endMonth, periods: defaultPeriods },
                        ...keyPeriods
                    ].map((period, index) => {
                        const modelStartTotal = config.startYear * 12 + config.startMonth
                        const modelEndTotal = config.endYear * 12 + config.endMonth
                        const totalMonths = modelEndTotal - modelStartTotal + 1

                        const periodStartTotal = period.startYear * 12 + period.startMonth
                        const periodEndTotal = period.endYear * 12 + period.endMonth
                        const periodMonths = periodEndTotal - periodStartTotal + 1
                        const startPos = ((periodStartTotal - modelStartTotal) / totalMonths) * 100
                        const endPos = ((periodEndTotal - modelStartTotal + 1) / totalMonths) * 100
                        const width = Math.max(0.5, endPos - startPos)
                        const color = period.id === 'default' ? '#94A3B8' : getPeriodColor(index - 1)
                        const startLabel = `${String(period.startMonth).padStart(2, '0')}/${period.startYear}`
                        const endLabel = `${String(period.endMonth).padStart(2, '0')}/${period.endYear}`

                        return (
                            <div key={period.id} className="flex items-center mb-1" style={{ height: '24px' }}>
                                <div className="w-24 flex-shrink-0 text-[10px] font-medium text-slate-600 pr-1 text-right truncate" style={{ lineHeight: '20px' }}>
                                    {period.name}
                                </div>
                                <div className="w-[52px] flex-shrink-0 text-[9px] text-slate-400 text-center whitespace-nowrap" style={{ lineHeight: '20px' }}>
                                    {startLabel}
                                </div>
                                <div className="w-[52px] flex-shrink-0 text-[9px] text-slate-400 text-center whitespace-nowrap" style={{ lineHeight: '20px' }}>
                                    {endLabel}
                                </div>
                                <div className="w-[32px] flex-shrink-0 text-[9px] text-slate-400 text-center whitespace-nowrap" style={{ lineHeight: '20px' }}>
                                    {periodMonths}
                                </div>
                                <div className="relative flex-1" style={{ height: '24px' }}>
                                    <div
                                        className="absolute top-0 rounded h-5 flex items-center justify-center text-[9px] font-medium text-white"
                                        style={{
                                            left: `${Math.max(0, startPos)}%`,
                                            width: `${Math.min(100 - startPos, width)}%`,
                                            backgroundColor: color,
                                            minWidth: '16px',
                                        }}
                                        title={`${period.name}: ${startLabel} – ${endLabel} (${periodMonths} months)`}
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
