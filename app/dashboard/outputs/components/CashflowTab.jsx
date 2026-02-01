'use client'

import { useMemo } from 'react'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine
} from 'recharts'
import { calculatePeriodValues, calculateTotal, formatValue } from '@/utils/valueAggregation'

const BOLD_KEYWORDS = ['total', 'ebitda', 'operating cash', 'net cash', 'cash balance', 'cash flow after', 'total funding', 'total debt', 'total construction']
const HIGHLIGHT_KEYWORDS = ['net cash flow', 'cash balance']

export default function CashflowTab({ viewHeaders, calculationResults, calculationTypes, viewMode, calculations }) {
    // Build line items dynamically from group 60
    const lineItems = useMemo(() => {
        return (calculations || [])
            .filter(c => c.groupId === 60)
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

    // Calculate all CF values
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

    // Chart data for CF components and cash balance
    const chartData = useMemo(() => {
        return viewHeaders.map((header) => {
            const getValue = (ref, type = 'flow') => {
                const arr = calculationResults[ref] || []
                const calcType = calculationTypes?.[ref] || type
                const periodValues = calculatePeriodValues(arr, [header], viewMode, calcType)
                return periodValues[0] || 0
            }

            return {
                period: header.label,
                operating: getValue('R22'),
                investing: getValue('R28'),
                financing: getValue('R39'),
                netCF: getValue('R40'),
                cashBalance: getValue('R42', 'stock'),
            }
        })
    }, [viewHeaders, calculationResults, calculationTypes, viewMode])

    return (
        <div className="space-y-6">
            {/* Cash Flow Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-700">Cash Flow Statement</h3>
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
                                    className={`border-b border-slate-100 ${row.highlight ? 'bg-cyan-50/30' : 'hover:bg-slate-50'}`}
                                >
                                    <td className={`py-2 px-4 text-slate-700 w-[200px] min-w-[200px] sticky left-0 bg-white ${row.highlight ? 'bg-cyan-50/30' : ''}`}>
                                        <span className={row.bold ? 'font-semibold' : ''}>
                                            {row.name}
                                        </span>
                                    </td>
                                    <td className={`py-2 px-3 text-right font-medium w-[100px] min-w-[100px] sticky left-[200px] bg-white border-r border-slate-200 ${row.total < 0 ? 'text-red-600' : 'text-slate-900'} ${row.highlight ? 'bg-cyan-50/30' : ''}`}>
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

            {/* Charts Row */}
            <div className="grid grid-cols-2 gap-6">
                {/* CF Components - Grouped Bar */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Cash Flow Components ($M)</h3>
                    <ResponsiveContainer width="100%" height={250}>
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
                            />
                            <Tooltip
                                formatter={(value) => [`$${value.toFixed(1)}M`, '']}
                                contentStyle={{ fontSize: 12 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={0} stroke="#94a3b8" />
                            <Bar dataKey="operating" fill="#10b981" name="Operating" />
                            <Bar dataKey="investing" fill="#f59e0b" name="Investing" />
                            <Bar dataKey="financing" fill="#6366f1" name="Financing" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Cash Balance - Line Chart */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Cash Balance Over Time ($M)</h3>
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
                            <ReferenceLine y={0} stroke="#94a3b8" />
                            <Line
                                type="monotone"
                                dataKey="cashBalance"
                                stroke="#0891b2"
                                strokeWidth={2}
                                dot={false}
                                name="Cash Balance"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    )
}
