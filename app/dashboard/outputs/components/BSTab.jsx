'use client'

import { useMemo } from 'react'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine
} from 'recharts'
import { calculatePeriodValues, formatValue } from '@/utils/valueAggregation'

const BS_SECTIONS = [
    { groupId: 39, label: 'Assets', color: 'blue' },
    { groupId: 40, label: 'Liabilities', color: 'red' },
    { groupId: 41, label: 'Equity', color: 'green' },
    { groupId: 42, label: 'Check', color: 'slate' },
]

const SECTION_HEADER_COLORS = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-300',
}

const BOLD_KEYWORDS = ['total', 'check']

export default function BSTab({ viewHeaders, calculationResults, calculationTypes, viewMode, calculations }) {
    // Build sections with line items from groups 39-42
    const sections = useMemo(() => {
        return BS_SECTIONS.map(section => {
            const items = (calculations || [])
                .filter(c => c.groupId === section.groupId)
                .map(c => {
                    const nameLower = c.name.toLowerCase()
                    return {
                        id: c.id,
                        name: c.name,
                        ref: `R${c.id}`,
                        type: 'stock',
                        bold: BOLD_KEYWORDS.some(k => nameLower.includes(k)),
                    }
                })
            return { ...section, items }
        })
    }, [calculations])

    // Calculate all BS values
    const tableData = useMemo(() => {
        return sections.map(section => ({
            ...section,
            items: section.items.map(item => {
                const arr = calculationResults[item.ref] || []
                const periodValues = calculatePeriodValues(arr, viewHeaders, viewMode, 'stock')
                return { ...item, periodValues }
            })
        }))
    }, [sections, viewHeaders, calculationResults, viewMode])

    // Chart data: Total Assets vs Total L+E
    const chartData = useMemo(() => {
        const assetsArr = calculationResults['R187'] || []
        const leArr = calculationResults['R194'] || []

        return viewHeaders.map((header) => {
            const assets = calculatePeriodValues(assetsArr, [header], viewMode, 'stock')[0] || 0
            const le = calculatePeriodValues(leArr, [header], viewMode, 'stock')[0] || 0

            return {
                period: header.label,
                assets,
                le,
            }
        })
    }, [viewHeaders, calculationResults, viewMode])

    return (
        <div className="space-y-6">
            {/* BS Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-700">Balance Sheet</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase w-[200px] min-w-[200px] sticky left-0 bg-slate-50 border-r border-slate-300">
                                    Line Item
                                </th>
                                {viewHeaders.map((header, i) => (
                                    <th key={i} className="text-center py-2 px-2 text-[10px] font-medium text-slate-500 min-w-[70px]">
                                        {header.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tableData.map((section) => (
                                <SectionRows key={section.groupId} section={section} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Chart: Total Assets vs Total L+E */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Total Assets vs Total L+E ($M)</h3>
                <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                            dataKey="period"
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            formatter={(value) => [`$${value.toFixed(1)}M`, '']}
                            contentStyle={{ fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="#94a3b8" />
                        <Line
                            type="monotone"
                            dataKey="assets"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            name="Total Assets"
                        />
                        <Line
                            type="monotone"
                            dataKey="le"
                            stroke="#ef4444"
                            strokeWidth={2}
                            dot={false}
                            strokeDasharray="5 5"
                            name="Total L+E"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

function SectionRows({ section }) {
    return (
        <>
            {/* Section Header */}
            <tr className={`border-b ${SECTION_HEADER_COLORS[section.color]}`}>
                <td className={`py-1.5 px-4 text-xs font-bold uppercase tracking-wide sticky left-0 ${SECTION_HEADER_COLORS[section.color]}`}>
                    {section.label}
                </td>
                <td colSpan={999}></td>
            </tr>
            {/* Section Items */}
            {section.items.map((row) => (
                <tr
                    key={row.id}
                    className={`border-b border-slate-100 ${row.bold ? 'bg-slate-50/50' : 'hover:bg-slate-50'}`}
                >
                    <td className={`py-2 px-4 text-slate-700 w-[200px] min-w-[200px] sticky left-0 bg-white border-r border-slate-200 ${row.bold ? 'bg-slate-50/50' : ''}`}>
                        <span className={row.bold ? 'font-semibold' : ''}>
                            {row.name}
                        </span>
                    </td>
                    {row.periodValues.map((val, i) => (
                        <td key={i} className={`py-2 px-2 text-right text-xs ${val < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                            {formatValue(val, { accounting: true })}
                        </td>
                    ))}
                </tr>
            ))}
        </>
    )
}
