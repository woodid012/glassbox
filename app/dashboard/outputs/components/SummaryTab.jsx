'use client'

import { useMemo } from 'react'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    ComposedChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    Cell
} from 'recharts'
import MetricCard from './MetricCard'
import { calculatePeriodValues, calculateTotal } from '@/utils/valueAggregation'

// Calculation R-ref mappings
const CALC_REFS = {
    tollingRevenue: 'R4',
    merchantRevenue: 'R7',
    totalRevenue: 'R8',
    opex: 'R9',
    ebitda: 'R13',
    depreciation: 'R14',
    netIncome: 'R19',
    closingCash: 'R42',
    debtClosing: 'R74',
    dscr: 'R118',
    // Equity IRR components
    contingentEquity: 'R131',
    equityInjections: 'R132',
    dividends: 'R133',
    shareCapitalRepayment: 'R134',
    investorTax: 'R135',
    terminalValue: 'R136',
    netCFToEquity: 'R137',
}

// DSCR Target constants (from model)
const DSCR_TARGETS = {
    contracted: 1.35,  // C1.25 - Contracted DSCR target
    merchant: 1.50,    // C1.26 - Merchant DSCR target
    minimum: 1.20,     // Typical lender minimum covenant
}

// Calculate IRR using Newton-Raphson method
function calculateIRR(cashFlows, periodsPerYear = 12, maxIterations = 100, tolerance = 1e-7) {
    // Filter out leading zeros
    let firstNonZeroIdx = cashFlows.findIndex(cf => Math.abs(cf) > 0.01)
    if (firstNonZeroIdx === -1) return 0
    const flows = cashFlows.slice(firstNonZeroIdx)

    if (flows.length < 2) return 0

    // Check if there's at least one sign change (required for IRR)
    const hasNegative = flows.some(cf => cf < 0)
    const hasPositive = flows.some(cf => cf > 0)
    if (!hasNegative || !hasPositive) return 0

    // NPV function
    const npv = (rate) => {
        return flows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0)
    }

    // NPV derivative
    const npvDerivative = (rate) => {
        return flows.reduce((sum, cf, t) => {
            if (t === 0) return sum
            return sum - (t * cf) / Math.pow(1 + rate, t + 1)
        }, 0)
    }

    // Initial guess
    let rate = 0.1 / periodsPerYear // Start with 10% annual rate converted to period rate

    for (let i = 0; i < maxIterations; i++) {
        const npvValue = npv(rate)
        const derivative = npvDerivative(rate)

        if (Math.abs(derivative) < 1e-10) break

        const newRate = rate - npvValue / derivative

        // Bound the rate to reasonable values
        if (newRate < -0.99) rate = -0.5
        else if (newRate > 10) rate = 5
        else rate = newRate

        if (Math.abs(npvValue) < tolerance) break
    }

    // Convert period rate to annual rate
    const annualRate = Math.pow(1 + rate, periodsPerYear) - 1
    return annualRate
}

// Calculate payback period (in years)
function calculatePaybackPeriod(cashFlows, periodsPerYear = 12) {
    let cumulative = 0
    for (let i = 0; i < cashFlows.length; i++) {
        cumulative += cashFlows[i]
        if (cumulative >= 0) {
            return i / periodsPerYear
        }
    }
    return null // Never pays back
}

export default function SummaryTab({ viewHeaders, calculationResults, calculationTypes, viewMode }) {
    // Memoize chart data to prevent recalculation on every render
    const chartData = useMemo(() => {
        return viewHeaders.map((header, idx) => {
            const getValue = (ref, type = 'flow') => {
                const arr = calculationResults[ref] || []
                const calcType = calculationTypes?.[ref] || type
                const periodValues = calculatePeriodValues(arr, [header], viewMode, calcType)
                return periodValues[0] || 0
            }

            return {
                period: header.label,
                tollingRevenue: getValue(CALC_REFS.tollingRevenue),
                merchantRevenue: getValue(CALC_REFS.merchantRevenue),
                totalRevenue: getValue(CALC_REFS.totalRevenue),
                ebitda: getValue(CALC_REFS.ebitda),
                netIncome: getValue(CALC_REFS.netIncome),
                debtBalance: getValue(CALC_REFS.debtClosing, 'stock'),
            }
        })
    }, [viewHeaders, calculationResults, calculationTypes, viewMode])

    // Equity IRR chart data (annual view for clarity)
    const equityChartData = useMemo(() => {
        return viewHeaders.map((header, idx) => {
            const getValue = (ref, type = 'flow') => {
                const arr = calculationResults[ref] || []
                const calcType = calculationTypes?.[ref] || type
                const periodValues = calculatePeriodValues(arr, [header], viewMode, calcType)
                return periodValues[0] || 0
            }

            const equityInjections = getValue(CALC_REFS.equityInjections)
            const dividends = getValue(CALC_REFS.dividends)
            const shareCapitalRepayment = getValue(CALC_REFS.shareCapitalRepayment)
            const investorTax = getValue(CALC_REFS.investorTax)
            const terminalValue = getValue(CALC_REFS.terminalValue)
            const netCF = getValue(CALC_REFS.netCFToEquity)

            return {
                period: header.label,
                equityInjections,
                dividends,
                shareCapitalRepayment,
                investorTax,
                terminalValue,
                netCF,
                // For waterfall: outflows negative, inflows positive
                outflows: equityInjections + investorTax, // These are already negative
                inflows: dividends + shareCapitalRepayment + terminalValue,
            }
        })
    }, [viewHeaders, calculationResults, calculationTypes, viewMode])

    // Calculate equity IRR metrics using monthly cash flows
    const equityMetrics = useMemo(() => {
        // Get raw monthly cash flows for accurate IRR
        const monthlyCashFlows = calculationResults[CALC_REFS.netCFToEquity] || []

        // Calculate IRR
        const irr = calculateIRR(monthlyCashFlows, 12)

        // Calculate payback period
        const paybackYears = calculatePaybackPeriod(monthlyCashFlows, 12)

        // Calculate totals for MOIC
        const getTotal = (ref, type = 'flow') => {
            const arr = calculationResults[ref] || []
            const calcType = calculationTypes?.[ref] || type
            const periodValues = calculatePeriodValues(arr, viewHeaders, viewMode, calcType)
            return calculateTotal(periodValues, calcType)
        }

        const totalEquityInjections = getTotal(CALC_REFS.equityInjections)
        const totalDividends = getTotal(CALC_REFS.dividends)
        const totalShareCapitalRepayment = getTotal(CALC_REFS.shareCapitalRepayment)
        const totalTerminalValue = getTotal(CALC_REFS.terminalValue)
        const totalInvestorTax = getTotal(CALC_REFS.investorTax)
        const totalNetCFToEquity = getTotal(CALC_REFS.netCFToEquity)

        // MOIC = Total distributions / Total invested
        const totalInvested = Math.abs(totalEquityInjections)
        const totalDistributions = totalDividends + totalShareCapitalRepayment + totalTerminalValue + totalInvestorTax
        const moic = totalInvested !== 0 ? totalDistributions / totalInvested : 0

        // Cumulative cash flow for chart
        let cumulative = 0
        const cumulativeCashFlows = monthlyCashFlows.map(cf => {
            cumulative += cf
            return cumulative
        })

        return {
            irr,
            moic,
            paybackYears,
            totalInvested,
            totalDistributions,
            totalDividends,
            totalShareCapitalRepayment,
            totalTerminalValue,
            totalInvestorTax,
            totalNetCFToEquity,
            cumulativeCashFlows,
        }
    }, [calculationResults, calculationTypes, viewHeaders, viewMode])

    // Calculate summary metrics
    const metrics = useMemo(() => {
        const getTotal = (ref, type = 'flow') => {
            const arr = calculationResults[ref] || []
            const calcType = calculationTypes?.[ref] || type
            const periodValues = calculatePeriodValues(arr, viewHeaders, viewMode, calcType)
            return calculateTotal(periodValues, calcType)
        }

        const totalRevenue = getTotal(CALC_REFS.totalRevenue)
        const totalEbitda = getTotal(CALC_REFS.ebitda)
        const ebitdaMargin = totalRevenue !== 0 ? totalEbitda / totalRevenue : 0

        return {
            totalRevenue,
            ebitdaMargin,
            totalEbitda,
        }
    }, [viewHeaders, calculationResults, calculationTypes, viewMode])

    // DSCR covenant monitoring data
    const dscrChartData = useMemo(() => {
        return viewHeaders.map((header) => {
            const arr = calculationResults[CALC_REFS.dscr] || []
            const calcType = calculationTypes?.[CALC_REFS.dscr] || 'stock'
            const periodValues = calculatePeriodValues(arr, [header], viewMode, calcType)
            const dscr = periodValues[0] || 0

            return {
                period: header.label,
                dscr,
                targetContracted: DSCR_TARGETS.contracted,
                targetMerchant: DSCR_TARGETS.merchant,
                minimum: DSCR_TARGETS.minimum,
            }
        })
    }, [viewHeaders, calculationResults, calculationTypes, viewMode])

    // DSCR metrics
    const dscrMetrics = useMemo(() => {
        const dscrValues = dscrChartData
            .map(d => d.dscr)
            .filter(v => v > 0) // Only count periods with debt service

        if (dscrValues.length === 0) {
            return {
                minDscr: 0,
                avgDscr: 0,
                periodsBelowContracted: 0,
                periodsBelowMinimum: 0,
                totalPeriods: 0,
                covenantStatus: 'N/A',
            }
        }

        const minDscr = Math.min(...dscrValues)
        const avgDscr = dscrValues.reduce((a, b) => a + b, 0) / dscrValues.length
        const periodsBelowContracted = dscrValues.filter(v => v < DSCR_TARGETS.contracted).length
        const periodsBelowMinimum = dscrValues.filter(v => v < DSCR_TARGETS.minimum).length

        let covenantStatus = 'Pass'
        if (periodsBelowMinimum > 0) covenantStatus = 'Breach'
        else if (periodsBelowContracted > 0) covenantStatus = 'Warning'

        return {
            minDscr,
            avgDscr,
            periodsBelowContracted,
            periodsBelowMinimum,
            totalPeriods: dscrValues.length,
            covenantStatus,
        }
    }, [dscrChartData])

    // Cumulative equity cash flow chart data (aggregated by view period)
    const cumulativeEquityChartData = useMemo(() => {
        // Use the raw monthly cumulative cash flows
        const monthlyCumulative = equityMetrics.cumulativeCashFlows || []
        if (monthlyCumulative.length === 0) return []

        // Map to view headers (aggregate to last period in each group)
        return viewHeaders.map((header) => {
            // Get the last index in this period group
            const lastIdx = header.indices[header.indices.length - 1]
            const cumulative = monthlyCumulative[lastIdx] || 0

            return {
                period: header.label,
                cumulative,
            }
        })
    }, [viewHeaders, equityMetrics.cumulativeCashFlows])

    // Format helpers
    const formatPercent = (value) => `${(value * 100).toFixed(1)}%`
    const formatCurrency = (value) => `$${Math.abs(value).toFixed(1)}M`
    const formatYears = (value) => value !== null ? `${value.toFixed(1)} yrs` : 'N/A'

    return (
        <div className="space-y-6">
            {/* ==================== EQUITY IRR ANALYSIS ==================== */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-6">
                <h2 className="text-lg font-bold text-purple-900 mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white text-sm">📊</span>
                    Equity IRR Analysis
                </h2>

                {/* Equity Metrics Row */}
                <div className="grid grid-cols-5 gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Equity IRR</div>
                        <div className="text-2xl font-bold text-purple-600">{formatPercent(equityMetrics.irr)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">MOIC</div>
                        <div className="text-2xl font-bold text-indigo-600">{equityMetrics.moic.toFixed(2)}x</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Payback Period</div>
                        <div className="text-2xl font-bold text-emerald-600">{formatYears(equityMetrics.paybackYears)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Total Invested</div>
                        <div className="text-2xl font-bold text-red-600">{formatCurrency(equityMetrics.totalInvested)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-purple-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Total Distributions</div>
                        <div className="text-2xl font-bold text-green-600">{formatCurrency(equityMetrics.totalDistributions)}</div>
                    </div>
                </div>

                {/* Equity Cash Flow Charts */}
                <div className="grid grid-cols-2 gap-6">
                    {/* Equity Cash Flow Waterfall */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Equity Cash Flows ($M)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <ComposedChart data={equityChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    formatter={(value, name) => [`$${value.toFixed(2)}M`, name]}
                                    contentStyle={{ fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <ReferenceLine y={0} stroke="#94a3b8" />
                                <Bar dataKey="equityInjections" fill="#ef4444" name="Equity Injections" stackId="stack" />
                                <Bar dataKey="investorTax" fill="#f97316" name="Investor Tax" stackId="stack" />
                                <Bar dataKey="dividends" fill="#22c55e" name="Dividends" stackId="stack" />
                                <Bar dataKey="shareCapitalRepayment" fill="#10b981" name="Capital Repayment" stackId="stack" />
                                <Bar dataKey="terminalValue" fill="#06b6d4" name="Terminal Value" stackId="stack" />
                                <Line type="monotone" dataKey="netCF" stroke="#7c3aed" strokeWidth={2} dot={false} name="Net CF" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Equity Cash Flow Breakdown Table */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Equity Returns Summary</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">Equity Invested</span>
                                <span className="text-sm font-semibold text-red-600">
                                    ({formatCurrency(equityMetrics.totalInvested)})
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">+ Dividends</span>
                                <span className="text-sm font-semibold text-green-600">
                                    {formatCurrency(equityMetrics.totalDividends)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">+ Capital Repayment</span>
                                <span className="text-sm font-semibold text-green-600">
                                    {formatCurrency(equityMetrics.totalShareCapitalRepayment)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">+ Terminal Value</span>
                                <span className="text-sm font-semibold text-cyan-600">
                                    {formatCurrency(equityMetrics.totalTerminalValue)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">- Investor Tax</span>
                                <span className="text-sm font-semibold text-orange-600">
                                    ({formatCurrency(Math.abs(equityMetrics.totalInvestorTax))})
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-3 bg-purple-50 rounded-lg px-3 mt-4">
                                <span className="text-sm font-semibold text-purple-900">Net Cash Flow to Equity</span>
                                <span className={`text-lg font-bold ${equityMetrics.totalNetCFToEquity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {equityMetrics.totalNetCFToEquity >= 0 ? '' : '('}{formatCurrency(Math.abs(equityMetrics.totalNetCFToEquity))}{equityMetrics.totalNetCFToEquity >= 0 ? '' : ')'}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-200">
                                <div className="text-center">
                                    <div className="text-xs text-slate-500">IRR</div>
                                    <div className="text-lg font-bold text-purple-600">{formatPercent(equityMetrics.irr)}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs text-slate-500">MOIC</div>
                                    <div className="text-lg font-bold text-indigo-600">{equityMetrics.moic.toFixed(2)}x</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs text-slate-500">Payback</div>
                                    <div className="text-lg font-bold text-emerald-600">{formatYears(equityMetrics.paybackYears)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cumulative Equity Cash Flow Chart */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 mt-6">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Cumulative Equity Cash Flow ($M)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={cumulativeEquityChartData}>
                            <defs>
                                <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.05}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} />
                            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                            <Tooltip
                                formatter={(value) => [`$${value.toFixed(1)}M`, 'Cumulative']}
                                contentStyle={{ fontSize: 12 }}
                            />
                            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Payback', fontSize: 10, fill: '#ef4444' }} />
                            <Area
                                type="monotone"
                                dataKey="cumulative"
                                stroke="#7c3aed"
                                strokeWidth={2}
                                fill="url(#cumulativeGradient)"
                                name="Cumulative CF"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-slate-500 mt-2 text-center">
                        Payback occurs when cumulative cash flow crosses zero
                    </p>
                </div>
            </div>

            {/* ==================== DSCR COVENANT MONITORING ==================== */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-6">
                <h2 className="text-lg font-bold text-amber-900 mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center text-white text-sm">📋</span>
                    DSCR Covenant Monitoring
                </h2>

                {/* DSCR Metrics Row */}
                <div className="grid grid-cols-5 gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-amber-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Min DSCR</div>
                        <div className={`text-2xl font-bold ${dscrMetrics.minDscr < DSCR_TARGETS.minimum ? 'text-red-600' : dscrMetrics.minDscr < DSCR_TARGETS.contracted ? 'text-amber-600' : 'text-green-600'}`}>
                            {dscrMetrics.minDscr.toFixed(2)}x
                        </div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-amber-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Avg DSCR</div>
                        <div className="text-2xl font-bold text-indigo-600">{dscrMetrics.avgDscr.toFixed(2)}x</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-amber-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Target (Contracted)</div>
                        <div className="text-2xl font-bold text-slate-600">{DSCR_TARGETS.contracted.toFixed(2)}x</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-amber-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Periods Below Target</div>
                        <div className={`text-2xl font-bold ${dscrMetrics.periodsBelowContracted > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                            {dscrMetrics.periodsBelowContracted} / {dscrMetrics.totalPeriods}
                        </div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-amber-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Covenant Status</div>
                        <div className={`text-2xl font-bold ${
                            dscrMetrics.covenantStatus === 'Pass' ? 'text-green-600' :
                            dscrMetrics.covenantStatus === 'Warning' ? 'text-amber-600' :
                            dscrMetrics.covenantStatus === 'Breach' ? 'text-red-600' : 'text-slate-400'
                        }`}>
                            {dscrMetrics.covenantStatus}
                        </div>
                    </div>
                </div>

                {/* DSCR Chart */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">DSCR Trend Over Time</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <ComposedChart data={dscrChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} />
                            <YAxis
                                tick={{ fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                domain={[0, 'auto']}
                            />
                            <Tooltip
                                formatter={(value, name) => [value.toFixed(2) + 'x', name]}
                                contentStyle={{ fontSize: 12 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            {/* Target reference lines */}
                            <ReferenceLine
                                y={DSCR_TARGETS.contracted}
                                stroke="#f59e0b"
                                strokeDasharray="5 5"
                                label={{ value: `Target ${DSCR_TARGETS.contracted}x`, fontSize: 9, fill: '#f59e0b', position: 'right' }}
                            />
                            <ReferenceLine
                                y={DSCR_TARGETS.minimum}
                                stroke="#ef4444"
                                strokeDasharray="5 5"
                                label={{ value: `Min ${DSCR_TARGETS.minimum}x`, fontSize: 9, fill: '#ef4444', position: 'right' }}
                            />
                            {/* Actual DSCR as bars with conditional coloring */}
                            <Bar dataKey="dscr" name="DSCR" radius={[2, 2, 0, 0]}>
                                {dscrChartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={
                                            entry.dscr === 0 ? '#e2e8f0' :
                                            entry.dscr < DSCR_TARGETS.minimum ? '#ef4444' :
                                            entry.dscr < DSCR_TARGETS.contracted ? '#f59e0b' : '#22c55e'
                                        }
                                    />
                                ))}
                            </Bar>
                        </ComposedChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-6 mt-3 text-xs">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-green-500"></div>
                            <span className="text-slate-600">Above Target</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-amber-500"></div>
                            <span className="text-slate-600">Below Target</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-red-500"></div>
                            <span className="text-slate-600">Covenant Breach</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ==================== PROJECT METRICS ==================== */}
            <div className="grid grid-cols-3 gap-4">
                <MetricCard
                    title="Total Revenue"
                    value={metrics.totalRevenue}
                    format="currency"
                    color="indigo"
                />
                <MetricCard
                    title="EBITDA Margin"
                    value={metrics.ebitdaMargin}
                    format="percent"
                    color="emerald"
                />
                <MetricCard
                    title="Total EBITDA"
                    value={metrics.totalEbitda}
                    format="currency"
                    color="cyan"
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-2 gap-6">
                {/* Revenue Breakdown - Stacked Bar */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Revenue Breakdown ($M)</h3>
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
                            <Bar
                                dataKey="tollingRevenue"
                                stackId="a"
                                fill="#6366f1"
                                name="Tolling Revenue"
                            />
                            <Bar
                                dataKey="merchantRevenue"
                                stackId="a"
                                fill="#a5b4fc"
                                name="Merchant Revenue"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* EBITDA & Net Income - Line Chart */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">EBITDA & Net Income ($M)</h3>
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
                            <Line
                                type="monotone"
                                dataKey="ebitda"
                                stroke="#10b981"
                                strokeWidth={2}
                                dot={false}
                                name="EBITDA"
                            />
                            <Line
                                type="monotone"
                                dataKey="netIncome"
                                stroke="#f59e0b"
                                strokeWidth={2}
                                dot={false}
                                name="Net Income"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 gap-6">
                {/* Debt Balance - Area Chart */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Debt Balance Over Time ($M)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={chartData}>
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
                            <Area
                                type="monotone"
                                dataKey="debtBalance"
                                fill="#fca5a5"
                                stroke="#ef4444"
                                name="Debt Balance"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    )
}
