import React, { useState, useRef, useEffect, useCallback } from 'react'

// Import shared components
import GroupControls from './shared/GroupControls'
import GeneratedArrayPreview from './shared/GeneratedArrayPreview'

// Import mode components
import ValuesMode from './modes/ValuesMode'
import SeriesMode from './modes/SeriesMode'
import ConstantMode from './modes/ConstantMode'
import Lookup2Mode from './modes/Lookup2Mode'

// Import utilities
import {
    getValuesArray,
    getLookup2ValuesArray,
    spreadValueToMonthly,
    spreadLookup2ValueToMonthly,
    generatePeriods,
    groupInputsBySubgroup
} from './utils/inputHelpers'

export default function ExcelInputs({
    groups,
    inputs,
    config,
    keyPeriods = [],
    viewMode = 'M',
    inputsEditMode = true,
    onUpdateGroup,
    onRemoveGroup,
    onAddInput,
    onUpdateInput,
    onRemoveInput,
    onAddSubgroup,
    onUpdateSubgroup,
    onRemoveSubgroup,
    collapsedGroups,
    setCollapsedGroups,
    scrollToGroupId,
    onScrollComplete
}) {
    // Selection state: { groupId, startRow, startCol, endRow, endCol }
    const [selection, setSelection] = useState(null)
    const [clipboard, setClipboard] = useState(null)
    const containerRef = useRef(null)
    const groupRefs = useRef({})

    // Scroll to newly added group
    useEffect(() => {
        if (scrollToGroupId != null && groupRefs.current[scrollToGroupId]) {
            groupRefs.current[scrollToGroupId].scrollIntoView({ behavior: 'smooth', block: 'center' })
            onScrollComplete?.()
        }
    }, [scrollToGroupId, groups, onScrollComplete])

    const handleCopy = useCallback(() => {
        if (!selection) return

        const group = groups.find(g => g.id === selection.groupId)
        if (!group) return

        // Get inputs in display order (grouped by subgroups)
        const rawGroupInputs = inputs.filter(inp => inp.groupId === selection.groupId)
        const subgroupedInputs = groupInputsBySubgroup(rawGroupInputs, group)
        const groupInputs = subgroupedInputs.flatMap(sg => sg.inputs)

        const isLookupMode = group.entryMode === 'lookup' || group.entryMode === 'lookup2'
        const isConstantMode = group.entryMode === 'constant'
        const periods = generatePeriods(group, config, keyPeriods)

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
                // Values, Series, or Lookup mode
                let values
                if (isLookupMode) {
                    values = getLookup2ValuesArray(input, periods, group.frequency)
                } else {
                    values = getValuesArray(input, periods, group.frequency, group, config)
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

    // Parse clipboard text (TSV from Excel) into rows of values
    const parseClipboardText = useCallback((text) => {
        if (!text || !text.trim()) return null
        const rows = text.split('\n')
            .map(row => row.split('\t').map(cell => {
                const trimmed = cell.trim().replace(/,/g, '')
                const parsed = parseFloat(trimmed)
                return isNaN(parsed) ? trimmed : parsed
            }))
            .filter(row => row.length > 0 && row.some(cell => cell !== ''))
        return rows.length > 0 ? rows : null
    }, [])

    // Handle Ctrl+C for copy
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
                e.preventDefault()
                handleCopy()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [selection, handleCopy])

    // Handle multi-cell paste from EditableCell's onPaste handler
    const handleMultiCellPaste = useCallback((text, groupId, rowIndex, colIndex) => {
        const rows = parseClipboardText(text)
        if (!rows) return
        // Set selection to the pasted cell (for visual highlight and subsequent copy)
        setSelection({
            groupId,
            startRow: rowIndex,
            startCol: colIndex,
            endRow: rowIndex,
            endCol: colIndex
        })

        const group = groups.find(g => g.id === groupId)
        if (!group) return

        const isLookupMode = group.entryMode === 'lookup' || group.entryMode === 'lookup2'
        const isConstantMode = group.entryMode === 'constant'
        const periods = generatePeriods(group, config, keyPeriods)

        const rawGroupInputs = inputs.filter(inp => inp.groupId === groupId)
        const subgroupedInputs = groupInputsBySubgroup(rawGroupInputs, group)
        const allInputs = subgroupedInputs.flatMap(sg => sg.inputs)

        const startRow = rowIndex
        const startCol = colIndex

        // For lookup mode, scope paste to the subgroup containing the clicked cell
        let pasteInputs = allInputs
        let pasteStartIdx = startRow
        if (isLookupMode && subgroupedInputs.length > 1) {
            let rowOffset = 0
            for (const sg of subgroupedInputs) {
                if (startRow < rowOffset + sg.inputs.length) {
                    pasteInputs = sg.inputs
                    pasteStartIdx = startRow - rowOffset
                    break
                }
                rowOffset += sg.inputs.length
            }
        }

        rows.forEach((rowData, rowOff) => {
            const inputIndex = pasteStartIdx + rowOff
            if (inputIndex >= pasteInputs.length) return

            const input = pasteInputs[inputIndex]

            if (isConstantMode) {
                rowData.forEach((val, colOffset) => {
                    const ci = startCol + colOffset
                    if (ci === -1) {
                        if (typeof val === 'string' && val.trim()) {
                            onUpdateInput(input.id, 'name', val)
                        }
                    } else if (ci === 0) {
                        // Total column is read-only, skip
                    } else if (ci === 1) {
                        const numVal = typeof val === 'number' ? val : (parseFloat(val) || 0)
                        onUpdateInput(input.id, 'value', numVal)
                    }
                })
            } else {
                let currentValues = input.values || {}

                rowData.forEach((val, colOffset) => {
                    const ci = startCol + colOffset
                    if (ci === -1) {
                        if (typeof val === 'string' && val.trim()) {
                            onUpdateInput(input.id, 'name', val)
                        }
                    } else if (ci >= 0 && ci < periods.length) {
                        const numVal = typeof val === 'number' ? val : (parseFloat(val) || 0)
                        if (isLookupMode) {
                            currentValues = spreadLookup2ValueToMonthly(currentValues, ci, numVal, group.frequency)
                        } else {
                            currentValues = spreadValueToMonthly(currentValues, ci, numVal, group.frequency, periods)
                        }
                    }
                })

                if (startCol >= 0) {
                    onUpdateInput(input.id, 'values', currentValues)
                }
            }
        })
    }, [groups, inputs, config, keyPeriods, onUpdateInput, parseClipboardText])

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
                const isCollapsed = !inputsEditMode || collapsedGroups?.has(group.id)
                const groupInputs = inputs.filter(inp => inp.groupId === group.id)
                const periods = generatePeriods(group, config, keyPeriods)
                const entryMode = group.entryMode || 'values'

                // Shared props for mode components
                const modeProps = {
                    group,
                    groupInputs,
                    periods,
                    config,
                    viewMode,
                    keyPeriods,
                    isCollapsed,
                    isCellSelected,
                    handleCellSelect,
                    handleCellShiftSelect,
                    handleMultiCellPaste,
                    onUpdateGroup,
                    onAddInput,
                    onUpdateInput,
                    onRemoveInput,
                    onAddSubgroup,
                    onUpdateSubgroup,
                    onRemoveSubgroup
                }

                return (
                    <div key={group.id} ref={el => groupRefs.current[group.id] = el} className="border border-slate-200 rounded-lg overflow-hidden">
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

                        {/* Collapsed: show Generated Array Preview for all modes */}
                        {isCollapsed && (
                            <GeneratedArrayPreview
                                group={group}
                                groupInputs={groupInputs}
                                config={config}
                                viewMode={viewMode}
                                keyPeriods={keyPeriods}
                            />
                        )}

                        {/* Expanded: show mode-specific input editor */}
                        {!isCollapsed && entryMode === 'values' && (
                            <ValuesMode {...modeProps} />
                        )}

                        {!isCollapsed && entryMode === 'series' && (
                            <SeriesMode {...modeProps} />
                        )}

                        {!isCollapsed && entryMode === 'constant' && (
                            <ConstantMode {...modeProps} />
                        )}

                        {!isCollapsed && (entryMode === 'lookup' || entryMode === 'lookup2') && (
                            <Lookup2Mode {...modeProps} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
