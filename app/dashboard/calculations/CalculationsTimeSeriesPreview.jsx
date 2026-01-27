import React, { useState, memo, useMemo } from 'react'
import { getAggregatedValueForArray, calculatePeriodValues, calculateTotal, formatValue } from '@/utils/valueAggregation'
import { getCalcTypeDisplayClasses, getTabItems, getViewModeLabel } from '@/utils/styleHelpers'
import { useHorizontalVirtualization } from '@/hooks/useHorizontalVirtualization'

const COL_WIDTH = 55
const STICKY_LEFT_WIDTH = 240 + 96 // name + total columns

// Helper to render period cells with virtualization spacers
function VirtualizedPeriodCells({ values, visibleRange, leftSpacerWidth, rightSpacerWidth, cellClassName, formatOptions }) {
    return (
        <>
            {leftSpacerWidth > 0 && <td style={{ width: leftSpacerWidth, minWidth: leftSpacerWidth, padding: 0 }} />}
            {values.slice(visibleRange.start, visibleRange.end).map((val, i) => {
                const idx = visibleRange.start + i
                return (
                    <td key={idx} className={typeof cellClassName === 'function' ? cellClassName(val) : cellClassName}>
                        {formatValue(val, formatOptions)}
                    </td>
                )
            })}
            {rightSpacerWidth > 0 && <td style={{ width: rightSpacerWidth, minWidth: rightSpacerWidth, padding: 0 }} />}
        </>
    )
}

// Memoized time series preview table
const CalculationsTimeSeriesPreview = memo(function CalculationsTimeSeriesPreview({ calculations, calculationsGroups, calculationResults, calculationTypes, viewHeaders, viewMode, calcIndexMap, activeTabId, calculationsTabs }) {
    const viewModeLabel = getViewModeLabel(viewMode)

    // Local tab state for preview browsing (independent of editor tabs)
    const [previewTabId, setPreviewTabId] = useState('all')

    // Horizontal virtualization for period columns
    const { visibleRange, containerRef, leftSpacerWidth, rightSpacerWidth, totalWidth } = useHorizontalVirtualization({
        itemCount: viewHeaders.length,
        itemWidth: COL_WIDTH,
        overscan: 10,
        stickyLeftWidth: STICKY_LEFT_WIDTH,
        enabled: viewHeaders.length > 50
    })

    // Determine column header based on preview tab
    const columnHeader = previewTabId === 'all'
        ? 'ALL'
        : (calculationsTabs || []).find(t => t.id === previewTabId)?.name || 'Calculation'

    // Filter calculations and groups based on preview tab
    const firstTabId = (calculationsTabs || [])[0]?.id
    const isFirstTab = previewTabId === firstTabId

    const filteredGroups = previewTabId === 'all'
        ? calculationsGroups
        : getTabItems(calculationsGroups, previewTabId, isFirstTab)

    const filteredCalcs = previewTabId === 'all'
        ? calculations
        : getTabItems(calculations, previewTabId, isFirstTab, calculationsGroups)

    // Memoize grand total calculation to avoid recalculating on every render
    const { grandTotalByPeriod, overallTotal } = useMemo(() => {
        const totals = viewHeaders.map((header) => {
            return filteredCalcs.reduce((sum, calc) => {
                const calcRef = `R${calcIndexMap.get(calc.id)}`
                const resultArray = calculationResults[calcRef] || []
                const calcType = calculationTypes?.[calcRef] || 'flow'

                // Only include flows in the grand total (stocks shouldn't be summed)
                if (calcType === 'stock') return sum

                if (viewMode === 'M') {
                    return sum + (resultArray[header.index] ?? 0)
                } else {
                    return sum + getAggregatedValueForArray(resultArray, header.indices || [header.index], calcType)
                }
            }, 0)
        })
        const total = totals.reduce((sum, v) => sum + v, 0)
        return { grandTotalByPeriod: totals, overallTotal: total }
    }, [filteredCalcs, calculationResults, calculationTypes, viewHeaders, viewMode, calcIndexMap])

    // Total colSpan for group header rows
    const totalColSpan = 2 + (leftSpacerWidth > 0 ? 1 : 0) + (visibleRange.end - visibleRange.start) + (rightSpacerWidth > 0 ? 1 : 0)

    return (
        <div className="border-t border-slate-200 pt-4 pb-4 px-6">
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold text-slate-500 uppercase">
                    Generated Time Series Preview ({viewModeLabel})
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setPreviewTabId('all')}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            previewTabId === 'all'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                    >
                        ALL
                    </button>
                    {(calculationsTabs || []).map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setPreviewTabId(tab.id)}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                previewTabId === tab.id
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                        >
                            {tab.name}
                        </button>
                    ))}
                </div>
            </div>
            <div ref={containerRef} className="overflow-x-auto">
                <table className="text-sm table-fixed" style={viewHeaders.length > 50 ? { width: STICKY_LEFT_WIDTH + totalWidth } : undefined}>
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[240px] min-w-[240px] sticky left-0 z-20 bg-slate-50">
                                {columnHeader}
                            </th>
                            <th className="text-right py-1 px-3 text-xs font-semibold text-slate-500 uppercase w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-slate-50 border-r border-slate-300">
                                Total
                            </th>
                            {leftSpacerWidth > 0 && <th style={{ width: leftSpacerWidth, minWidth: leftSpacerWidth, padding: 0 }} />}
                            {viewHeaders.slice(visibleRange.start, visibleRange.end).map((header, i) => (
                                <th key={visibleRange.start + i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[55px] w-[55px]">
                                    {header.label}
                                </th>
                            ))}
                            {rightSpacerWidth > 0 && <th style={{ width: rightSpacerWidth, minWidth: rightSpacerWidth, padding: 0 }} />}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Grouped calculations - group header without totals */}
                        {(filteredGroups || []).map((group) => {
                            const groupCalcs = filteredCalcs.filter(c => c.groupId === group.id)
                            if (groupCalcs.length === 0) return null

                            return (
                                <React.Fragment key={group.id}>
                                    {/* Group header row */}
                                    <tr className="bg-rose-50 border-b border-rose-200">
                                        <td colSpan={totalColSpan} className="py-1 px-3 text-[10px] text-rose-700 font-semibold uppercase tracking-wide sticky left-0 z-20 bg-rose-50">
                                            {group.name}
                                        </td>
                                    </tr>
                                    {/* Individual calculation rows */}
                                    {groupCalcs.map((calc) => {
                                        const calcRef = `R${calcIndexMap.get(calc.id)}`
                                        const resultArray = calculationResults[calcRef] || []
                                        const calcType = calculationTypes?.[calcRef] || 'flow'
                                        const periodValues = calculatePeriodValues(resultArray, viewHeaders, viewMode, calcType)
                                        const total = calculateTotal(periodValues, calcType)

                                        return (
                                            <tr key={calc.id} className="border-b border-slate-100 hover:bg-rose-50/30">
                                                <td className="py-1 px-3 text-xs text-slate-700 w-[240px] min-w-[240px] sticky left-0 z-20 bg-white">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs px-1.5 py-0.5 rounded font-medium text-rose-600 bg-rose-100">
                                                            {calcRef}
                                                        </span>
                                                        <span className="truncate">{calc.name}</span>
                                                        <span className={`text-[10px] px-1 py-0.5 rounded ${getCalcTypeDisplayClasses(calcType)}`}>
                                                            {calcType}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className={`py-1 px-3 text-right text-xs font-medium w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-white border-r border-slate-200 ${total < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                                    {formatValue(total, { accounting: true })}
                                                </td>
                                                <VirtualizedPeriodCells
                                                    values={periodValues}
                                                    visibleRange={visibleRange}
                                                    leftSpacerWidth={leftSpacerWidth}
                                                    rightSpacerWidth={rightSpacerWidth}
                                                    cellClassName={(val) => `py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${val < 0 ? 'text-red-600' : 'text-slate-600'}`}
                                                    formatOptions={{ accounting: true }}
                                                />
                                            </tr>
                                        )
                                    })}
                                </React.Fragment>
                            )
                        })}

                        {/* Ungrouped calculations */}
                        {(() => {
                            const ungroupedCalcs = filteredCalcs.filter(c =>
                                !c.groupId || !(filteredGroups || []).some(g => g.id === c.groupId)
                            )
                            if (ungroupedCalcs.length === 0) return null

                            return (
                                <React.Fragment>
                                    {/* Ungrouped header row */}
                                    <tr className="bg-rose-50 border-b border-rose-200">
                                        <td colSpan={totalColSpan} className="py-1 px-3 text-[10px] text-rose-700 font-semibold uppercase tracking-wide sticky left-0 z-20 bg-rose-50">
                                            Ungrouped
                                        </td>
                                    </tr>
                                    {ungroupedCalcs.map((calc) => {
                                const calcRef = `R${calcIndexMap.get(calc.id)}`
                                const resultArray = calculationResults[calcRef] || []
                                const calcType = calculationTypes?.[calcRef] || 'flow'
                                const periodValues = calculatePeriodValues(resultArray, viewHeaders, viewMode, calcType)
                                const total = calculateTotal(periodValues, calcType)

                                return (
                                    <tr key={calc.id} className="border-b border-slate-100 hover:bg-rose-50/30">
                                        <td className="py-1 px-3 text-xs text-slate-700 w-[240px] min-w-[240px] sticky left-0 z-20 bg-white">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs px-1.5 py-0.5 rounded font-medium text-rose-600 bg-rose-100">
                                                    {calcRef}
                                                </span>
                                                <span className="truncate">{calc.name}</span>
                                                <span className={`text-[10px] px-1 py-0.5 rounded ${getCalcTypeDisplayClasses(calcType)}`}>
                                                    {calcType}
                                                </span>
                                            </div>
                                        </td>
                                        <td className={`py-1 px-3 text-right text-xs font-medium w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-white border-r border-slate-200 ${total < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                            {formatValue(total, { accounting: true })}
                                        </td>
                                        <VirtualizedPeriodCells
                                            values={periodValues}
                                            visibleRange={visibleRange}
                                            leftSpacerWidth={leftSpacerWidth}
                                            rightSpacerWidth={rightSpacerWidth}
                                            cellClassName={(val) => `py-1 px-0.5 text-right text-[11px] min-w-[55px] w-[55px] border-r border-slate-100 ${val < 0 ? 'text-red-600' : 'text-slate-600'}`}
                                            formatOptions={{ accounting: true }}
                                        />
                                    </tr>
                                )
                            })}
                                </React.Fragment>
                            )
                        })()}

                        {/* Grand Total row */}
                        <tr className="bg-slate-100">
                            <td className="py-1.5 px-3 text-xs font-semibold text-slate-700 w-[240px] min-w-[240px] sticky left-0 z-20 bg-slate-100">
                                Grand Total
                            </td>
                            <td className={`py-1.5 px-3 text-right text-xs font-bold w-[96px] min-w-[96px] sticky left-[240px] z-10 bg-slate-100 border-r border-slate-300 ${overallTotal < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                {formatValue(overallTotal, { accounting: true })}
                            </td>
                            <VirtualizedPeriodCells
                                values={grandTotalByPeriod}
                                visibleRange={visibleRange}
                                leftSpacerWidth={leftSpacerWidth}
                                rightSpacerWidth={rightSpacerWidth}
                                cellClassName={(val) => `py-1 px-0.5 text-right text-[11px] font-semibold min-w-[55px] w-[55px] border-r border-slate-100 ${val < 0 ? 'text-red-600' : 'text-slate-700'}`}
                                formatOptions={{ accounting: true, decimals: 1 }}
                            />
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
})

export default CalculationsTimeSeriesPreview
