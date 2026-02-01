'use client'

import { useMemo } from 'react'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine
} from 'recharts'
import { calculatePeriodValues, calculateTotal, formatValue } from '@/utils/valueAggregation'

const BOLD_KEYWORDS = ['ebitda', 'ebt', 'npat', 'net income', 'total revenue', 'ebit']
const HIGHLIGHT_KEYWORDS = ['ebitda', 'npat', 'net income']

export default function PLTab({ viewHeaders, calculationResults, calculationTypes, viewMode, calculations }) {
    // Build line items dynamically from group 61
    const lineItems = useMemo(() => {
        return (calculations || [])
            .filter(c => c.groupId === 61)
            .map(c => {
                const nameLower = c.name.toLowerCase()
                return {
                    id: c.id,
                    name: c.name,
                    ref: `R${c.id}`,
                    type: c.type || 'flow',
                    bold: BOLD_KEYWORDS.some(k => nameLower.includes(k)),
                    highlight: HIGHLIGHT_KEYWORDS.some(k => nameLower.includes(k)),
                }
            })
    }, [calculations])

    // Calculate all P&L values
    const tableData = useMemo(() => {
        return lineItems.map(item => {
            const arr = calculationResults[item.ref] || []
            const calcType = calculationTypes?.[item.ref] || item.type
            const periodValues = calculatePeriodValues(arr, viewHeaders, viewMode, calcType)
            const total = calculateTotal(periodValues, calcType)

            return {
                ...item,
                periodValues,
                total,
            }
        })
    }, [lineItems, viewHeaders, calculationResults, calculationTypes, viewMode])

    // Chart data for EBITDA margin
    const chartData = useMemo(() => {
        const revenueArr = calculationResults['R8'] || []
        const ebitdaArr = calculationResults['R13'] || []

        return viewHeaders.map((header, idx) => {
            const revenue = calculatePeriodValues(revenueArr, [header], viewMode, 'flow')[0] || 0
            const ebitda = calculatePeriodValues(ebitdaArr, [header], viewMode, 'flow')[0] || 0
            const margin = revenue !== 0 ? (ebitda / revenue) * 100 : 0

            return {
                period: header.label,
                margin: margin,
            }
        })
    }, [viewHeaders, calculationResults, viewMode])

    return (
        <div className="space-y-6">
            {/* P&L Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-700">Income Statement</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="text-left py-2 px-4 text-xs font-semibold text-slate-500 uppercase w-[200px] min-w-[200px] sticky left-0 bg-slate-50">
                                    Line Item
                                </th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase w-[100px] min-w-[100px] sticky left-[200px] bg-slate-50 border-r border-slate-300">
                                    Total
                                </th>
                                {viewHeaders.map((header, i) => (
                                    <th key={i} className="text-center py-2 px-2 text-[10px] font-medium text-slate-500 min-w-[70px]">
                                        {header.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tableData.map((row) => (
                                <tr
                                    key={row.id}
                                    className={`border-b border-slate-100 ${row.highlight ? 'bg-indigo-50/30' : 'hover:bg-slate-50'}`}
                                >
                                    <td className={`py-2 px-4 text-slate-700 w-[200px] min-w-[200px] sticky left-0 bg-white ${row.highlight ? 'bg-indigo-50/30' : ''}`}>
                                        <span className={row.bold ? 'font-semibold' : ''}>
                                            {row.name}
                                        </span>
                                    </td>
                                    <td className={`py-2 px-3 text-right font-medium w-[100px] min-w-[100px] sticky left-[200px] bg-white border-r border-slate-200 ${row.total < 0 ? 'text-red-600' : 'text-slate-900'} ${row.highlight ? 'bg-indigo-50/30' : ''}`}>
                                        {formatValue(row.total, { accounting: true })}
                                    </td>
                                    {row.periodValues.map((val, i) => (
                                        <td key={i} className={`py-2 px-2 text-right text-xs ${val < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                            {formatValue(val, { accounting: true })}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* EBITDA Margin Chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">EBITDA Margin (%)</h3>
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData}>
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
                            tickFormatter={(val) => `${val}%`}
                        />
                        <Tooltip
                            formatter={(value) => [`${value.toFixed(1)}%`, 'EBITDA Margin']}
                            contentStyle={{ fontSize: 12 }}
                        />
                        <ReferenceLine y={0} stroke="#94a3b8" />
                        <Bar
                            dataKey="margin"
                            fill="#10b981"
                            radius={[4, 4, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
