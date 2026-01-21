import React, { useState, useRef, useEffect, useCallback } from 'react'

// Import shared components
import GroupControls from './shared/GroupControls'

// Import mode components
import ValuesMode from './modes/ValuesMode'
import SeriesMode from './modes/SeriesMode'
import ConstantMode from './modes/ConstantMode'
import LookupMode from './modes/LookupMode'
import Lookup2Mode from './modes/Lookup2Mode'

// Import utilities
import {
    getValuesArray,
    getLookupValuesArray,
    getLookup2ValuesArray,
    spreadValueToMonthly,
    spreadLookupValueToMonthly,
    spreadLookup2ValueToMonthly,
    generatePeriods,
    generateLookupPeriods,
    groupInputsBySubgroup
} from './utils/inputHelpers'

export default function ExcelInputs({
    groups,
    inputs,
    config,
    keyPeriods = [],
    onUpdateGroup,
    onRemoveGroup,
    onAddInput,
    onUpdateInput,
    onRemoveInput,
    onAddSubgroup,
    onUpdateSubgroup,
    onRemoveSubgroup,
    collapsedGroups,
    setCollapsedGroups
}) {
    // Selection state: { groupId, startRow, startCol, endRow, endCol }
    const [selection, setSelection] = useState(null)
    const [clipboard, setClipboard] = useState(null)
    const containerRef = useRef(null)

    const handleCopy = useCallback(() => {
        if (!selection) return

        const group = groups.find(g => g.id === selection.groupId)
        if (!group) return

        // Get inputs in display order (grouped by subgroups)
        const rawGroupInputs = inputs.filter(inp => inp.groupId === selection.groupId)
        const subgroupedInputs = groupInputsBySubgroup(rawGroupInputs, group)
        const groupInputs = subgroupedInputs.flatMap(sg => sg.inputs)

        const isLookupMode = group.entryMode === 'lookup'
        const isLookup2Mode = group.entryMode === 'lookup2'
        const isConstantMode = group.entryMode === 'constant'
        const periods = isLookupMode ? generateLookupPeriods(group, config) : generatePeriods(group, config)

        // Build clipboard data
        const rows = []
        const minRow = Math.min(selection.startRow, selection.endRow)
        const maxRow = Math.max(selection.startRow, selection.endRow)
        const minCol = Math.min(selection.startCol, selection.endCol)
        const maxCol = Math.max(selection.startCol, selection.endCol)

        for (let r = minRow; r <= maxRow; r++) {
            const input = groupInputs[r]
            if (!input) continue

            const rowData = []

            if (isConstantMode) {
                // Constant mode: columns are Label(-1), Total(0), Value(1), Spread(2)
                const constantValue = input.value ?? 0
                const spreadMethod = input.spreadMethod || 'lookup'
                const total = spreadMethod === 'lookup'
                    ? constantValue * periods.length
                    : constantValue

                for (let c = minCol; c <= maxCol; c++) {
                    if (c === -1) {
                        rowData.push(input.name)
                    } else if (c === 0) {
                        rowData.push(total)
                    } else if (c === 1) {
                        rowData.push(constantValue)
                    } else if (c === 2) {
                        rowData.push(spreadMethod)
                    }
                }
            } else {
                // Values, Series, Lookup, or Lookup2 mode
                let values
                if (isLookupMode) {
                    values = getLookupValuesArray(input, periods, group.frequency, group, config)
                } else if (isLookup2Mode) {
                    values = getLookup2ValuesArray(input, periods, group.frequency)
                } else {
                    values = getValuesArray(input, periods, group.frequency, group)
                }

                for (let c = minCol; c <= maxCol; c++) {
                    if (c === -1) {
                        rowData.push(input.name)
                    } else {
                        rowData.push(values[c] ?? 0)
                    }
                }
            }
            rows.push(rowData)
        }

        setClipboard({ rows, startCol: minCol })

        // Also copy to system clipboard as TSV
        const tsv = rows.map(row => row.join('\t')).join('\n')
        navigator.clipboard?.writeText(tsv)
    }, [selection, groups, inputs, config])

    const handlePaste = useCallback(async () => {
        if (!selection) return

        const group = groups.find(g => g.id === selection.groupId)
        if (!group) return

        // Determine entry mode
        const isLookupMode = group.entryMode === 'lookup'
        const isLookup2Mode = group.entryMode === 'lookup2'
        const isConstantMode = group.entryMode === 'constant'
        const periods = isLookupMode ? generateLookupPeriods(group, config) : generatePeriods(group, config)

        // Get inputs in display order (grouped by subgroups)
        const rawGroupInputs = inputs.filter(inp => inp.groupId === selection.groupId)
        const subgroupedInputs = groupInputsBySubgroup(rawGroupInputs, group)
        // Flatten to get inputs in display order
        const groupInputs = subgroupedInputs.flatMap(sg => sg.inputs)

        const startRow = Math.min(selection.startRow, selection.endRow)
        const startCol = Math.min(selection.startCol, selection.endCol)

        // Try to read from system clipboard first
        let pastedRows = null
        try {
            const pastedText = await navigator.clipboard.readText()
            if (pastedText && pastedText.trim()) {
                // Parse TSV: rows separated by newlines, columns by tabs
                pastedRows = pastedText.split('\n')
                    .map(row => row.split('\t').map(cell => {
                        const trimmed = cell.trim().replace(/,/g, '')
                        // Try to parse as number, otherwise keep as string
                        const parsed = parseFloat(trimmed)
                        return isNaN(parsed) ? trimmed : parsed
                    }))
                    .filter(row => row.length > 0 && row.some(cell => cell !== ''))
            }
        } catch (err) {
            // System clipboard unavailable, fall back to internal clipboard
            console.log('System clipboard unavailable, using internal clipboard')
        }

        // Fall back to internal clipboard if system clipboard didn't provide data
        if (!pastedRows || pastedRows.length === 0) {
            if (!clipboard) return
            pastedRows = clipboard.rows
        }

        if (!pastedRows || pastedRows.length === 0) return

        // Paste the data starting from selection
        pastedRows.forEach((rowData, rowOffset) => {
            const inputIndex = startRow + rowOffset
            if (inputIndex >= groupInputs.length) return

            const input = groupInputs[inputIndex]

            if (isConstantMode) {
                // Constant mode: columns are Label(-1), Total(0, read-only), Value(1)
                rowData.forEach((val, colOffset) => {
                    const colIndex = startCol + colOffset
                    if (colIndex === -1) {
                        // Paste to label column
                        if (typeof val === 'string' && val.trim()) {
                            onUpdateInput(input.id, 'name', val)
                        }
                    } else if (colIndex === 0) {
                        // Total column is read-only, skip
                    } else if (colIndex === 1) {
                        // Value column - update input.value
                        const numVal = typeof val === 'number' ? val : (parseFloat(val) || 0)
                        onUpdateInput(input.id, 'value', numVal)
                    }
                    // Column 2 is Spread dropdown, skip
                })
            } else {
                // Values mode, Series mode, Lookup mode, or Lookup2 mode
                let currentValues = input.values || {}

                rowData.forEach((val, colOffset) => {
                    const colIndex = startCol + colOffset
                    if (colIndex === -1) {
                        // Paste to label column - only paste strings
                        if (typeof val === 'string' && val.trim()) {
                            onUpdateInput(input.id, 'name', val)
                        }
                    } else if (colIndex >= 0 && colIndex < periods.length) {
                        // Paste to value cell
                        const numVal = typeof val === 'number' ? val : (parseFloat(val) || 0)
                        // Use appropriate spread function based on entry mode
                        if (isLookupMode) {
                            currentValues = spreadLookupValueToMonthly(currentValues, colIndex, numVal, group.frequency, group, config)
                        } else if (isLookup2Mode) {
                            currentValues = spreadLookup2ValueToMonthly(currentValues, colIndex, numVal, group.frequency)
                        } else {
                            currentValues = spreadValueToMonthly(currentValues, colIndex, numVal, group.frequency, periods)
                        }
                    }
                })

                if (startCol >= 0) {
                    onUpdateInput(input.id, 'values', currentValues)
                }
            }
        })
    }, [selection, clipboard, groups, inputs, onUpdateInput, config])

    // Handle keyboard shortcuts for copy/paste
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
                e.preventDefault()
                handleCopy()
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selection) {
                e.preventDefault()
                handlePaste()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [selection, handleCopy, handlePaste])

    const toggleGroup = (groupId) => {
        const newCollapsed = new Set(collapsedGroups)
        if (newCollapsed.has(groupId)) {
            newCollapsed.delete(groupId)
        } else {
            newCollapsed.add(groupId)
        }
        setCollapsedGroups(newCollapsed)
    }

    // Check if a cell is selected
    const isCellSelected = (groupId, rowIndex, colIndex) => {
        if (!selection || selection.groupId !== groupId) return false
        const minRow = Math.min(selection.startRow, selection.endRow)
        const maxRow = Math.max(selection.startRow, selection.endRow)
        const minCol = Math.min(selection.startCol, selection.endCol)
        const maxCol = Math.max(selection.startCol, selection.endCol)
        return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol
    }

    // Handle cell selection
    const handleCellSelect = (groupId, rowIndex, colIndex) => {
        setSelection({
            groupId,
            startRow: rowIndex,
            startCol: colIndex,
            endRow: rowIndex,
            endCol: colIndex
        })
    }

    // Handle shift-click to extend selection
    const handleCellShiftSelect = (groupId, rowIndex, colIndex) => {
        if (!selection || selection.groupId !== groupId) {
            handleCellSelect(groupId, rowIndex, colIndex)
            return
        }
        setSelection(prev => ({
            ...prev,
            endRow: rowIndex,
            endCol: colIndex
        }))
    }

    return (
        <div className="space-y-6" ref={containerRef}>
            {groups.map(group => {
                const isCollapsed = collapsedGroups?.has(group.id)
                const groupInputs = inputs.filter(inp => inp.groupId === group.id)
                const periods = generatePeriods(group, config)
                const entryMode = group.entryMode || 'values'

                // Shared props for mode components
                const modeProps = {
                    group,
                    groupInputs,
                    periods,
                    config,
                    isCollapsed,
                    isCellSelected,
                    handleCellSelect,
                    handleCellShiftSelect,
                    onUpdateGroup,
                    onAddInput,
                    onUpdateInput,
                    onRemoveInput,
                    onAddSubgroup,
                    onUpdateSubgroup,
                    onRemoveSubgroup
                }

                return (
                    <div key={group.id} className="border border-slate-200 rounded-lg overflow-hidden">
                        {/* Group Header */}
                        <GroupControls
                            group={group}
                            periods={periods}
                            config={config}
                            keyPeriods={keyPeriods}
                            isCollapsed={isCollapsed}
                            onToggleGroup={toggleGroup}
                            onUpdateGroup={onUpdateGroup}
                            onRemoveGroup={onRemoveGroup}
                        />

                        {/* Render appropriate mode component */}
                        {entryMode === 'values' && (
                            <ValuesMode {...modeProps} />
                        )}

                        {entryMode === 'series' && (
                            <SeriesMode {...modeProps} />
                        )}

                        {entryMode === 'constant' && (
                            <ConstantMode {...modeProps} />
                        )}

                        {entryMode === 'lookup' && (
                            <LookupMode {...modeProps} />
                        )}

                        {entryMode === 'lookup2' && (
                            <Lookup2Mode {...modeProps} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
