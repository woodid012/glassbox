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
    ReferenceLine
} from 'recharts'
import MetricCard from './MetricCard'
import { calculatePeriodValues, calculateTotal } from '@/utils/valueAggregation'

// Calculation R-ref mappings
const CALC_REFS = {
    tollingRevenue: 'R4',
    fcasRevenue: 'R5',
    arbRevenue: 'R6',
    merchantRevenue: 'R7',
    totalRevenue: 'R8',
    marketEventRevenue: 'R181',
    opex: 'R9',
    ebitda: 'R13',
    depreciation: 'R14',
    interestExpense: 'R16',
    netIncome: 'R19',
    closingCash: 'R42',
    debtClosing: 'R74',
    principalRepayment: 'R31',
    interestPaid: 'R32',
    agencyFee: 'R174',
    dsrfFees: 'R153',
    totalDebtService: 'R178',
    // Debt detail components
    debtOpening: 'R70',
    dscr: 'R118',
    cumulativePrincipal: 'R9072',
    adscr: 'R217',
    // Equity IRR components
    contingentEquity: 'R131',
    equityInjections: 'R132',
    dividends: 'R133',
    shareCapitalRepayment: 'R134',
    investorTax: 'R135',
    terminalValue: 'R136',
    netCFToEquity: 'R137',
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
                fcasRevenue: getValue(CALC_REFS.fcasRevenue),
                arbRevenue: getValue(CALC_REFS.arbRevenue),
                marketEventRevenue: getValue(CALC_REFS.marketEventRevenue),
                merchantRevenue: getValue(CALC_REFS.merchantRevenue),
                totalRevenue: getValue(CALC_REFS.totalRevenue),
                opex: getValue(CALC_REFS.opex),
                ebitda: getValue(CALC_REFS.ebitda),
                netIncome: getValue(CALC_REFS.netIncome),
                debtBalance: getValue(CALC_REFS.debtClosing, 'stock'),
                principalRepayment: getValue(CALC_REFS.principalRepayment),
                interestPaid: getValue(CALC_REFS.interestPaid),
                agencyFee: getValue(CALC_REFS.agencyFee),
                dsrfFees: getValue(CALC_REFS.dsrfFees),
                totalDebtService: getValue(CALC_REFS.totalDebtService),
                dscr: getValue(CALC_REFS.dscr, 'stock'),
                debtOpening: getValue(CALC_REFS.debtOpening, 'stock'),
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
        }
    }, [calculationResults, calculationTypes, viewHeaders, viewMode])

    // Calculate debt metrics
    const debtMetrics = useMemo(() => {
        const getTotal = (ref, type = 'flow') => {
            const arr = calculationResults[ref] || []
            const calcType = calculationTypes?.[ref] || type
            const periodValues = calculatePeriodValues(arr, viewHeaders, viewMode, calcType)
            return calculateTotal(periodValues, calcType)
        }

        // Sized debt = max of opening balance array (first period it appears)
        const openingArr = calculationResults[CALC_REFS.debtOpening] || []
        const sizedDebt = openingArr.length > 0 ? Math.max(...openingArr) : 0

        const totalPrincipal = getTotal(CALC_REFS.principalRepayment)
        const totalInterest = getTotal(CALC_REFS.interestPaid)
        const totalAgencyFee = getTotal(CALC_REFS.agencyFee)
        const totalDsrfFees = getTotal(CALC_REFS.dsrfFees)
        const totalDebtService = getTotal(CALC_REFS.totalDebtService)

        // DSCR stats - only for periods where DSCR > 0 (debt service periods)
        const dscrArr = calculationResults[CALC_REFS.dscr] || []
        const activeDscr = dscrArr.filter(v => v > 0)
        const minDscr = activeDscr.length > 0 ? Math.min(...activeDscr) : 0
        const avgDscr = activeDscr.length > 0 ? activeDscr.reduce((s, v) => s + v, 0) / activeDscr.length : 0

        // Closing balance at end
        const closingArr = calculationResults[CALC_REFS.debtClosing] || []
        const finalBalance = closingArr.length > 0 ? closingArr[closingArr.length - 1] : 0

        return {
            sizedDebt,
            totalPrincipal,
            totalInterest,
            totalAgencyFee,
            totalDsrfFees,
            totalDebtService,
            minDscr,
            avgDscr,
            finalBalance,
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

            </div>

            {/* ==================== REVENUE BREAKDOWN ==================== */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
                <h2 className="text-lg font-bold text-blue-900 mb-4">Revenue Breakdown</h2>
                <div className="grid grid-cols-2 gap-6">
                    {/* Revenue Stacked Bar */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Revenue by Source ($M)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    formatter={(value) => [`$${value.toFixed(2)}M`, '']}
                                    contentStyle={{ fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Bar dataKey="tollingRevenue" stackId="rev" fill="#4f46e5" name="Tolling" />
                                <Bar dataKey="fcasRevenue" stackId="rev" fill="#818cf8" name="FCAS" />
                                <Bar dataKey="arbRevenue" stackId="rev" fill="#a5b4fc" name="Arbitrage" />
                                <Bar dataKey="marketEventRevenue" stackId="rev" fill="#c7d2fe" name="Market Events" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Contracted vs Merchant split */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Contracted vs Merchant ($M)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    formatter={(value) => [`$${value.toFixed(2)}M`, '']}
                                    contentStyle={{ fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Bar dataKey="tollingRevenue" stackId="split" fill="#4f46e5" name="Contracted (Tolling)" />
                                <Bar dataKey="merchantRevenue" stackId="split" fill="#818cf8" name="Merchant" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ==================== OPEX ==================== */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-6">
                <h2 className="text-lg font-bold text-amber-900 mb-4">Operating Expenses</h2>
                <div className="grid grid-cols-2 gap-6">
                    {/* OPEX vs Revenue */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Revenue vs OPEX ($M)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <ComposedChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    formatter={(value) => [`$${Math.abs(value).toFixed(2)}M`, '']}
                                    contentStyle={{ fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Bar dataKey="totalRevenue" fill="#4f46e5" name="Revenue" />
                                <Bar dataKey="opex" fill="#f59e0b" name="OPEX" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                    {/* EBITDA & Net Income */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">EBITDA & Net Income ($M)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    formatter={(value) => [`$${value.toFixed(2)}M`, '']}
                                    contentStyle={{ fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <ReferenceLine y={0} stroke="#94a3b8" />
                                <Line type="monotone" dataKey="ebitda" stroke="#10b981" strokeWidth={2} dot={false} name="EBITDA" />
                                <Line type="monotone" dataKey="netIncome" stroke="#f59e0b" strokeWidth={2} dot={false} name="Net Income" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ==================== DEBT DETAILS ==================== */}
            <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-xl border border-red-200 p-6">
                <h2 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white text-sm">$</span>
                    Debt Details
                </h2>

                {/* Debt Metrics Row */}
                <div className="grid grid-cols-5 gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-red-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Sized Debt</div>
                        <div className="text-2xl font-bold text-red-600">{formatCurrency(debtMetrics.sizedDebt)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-red-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Total Interest</div>
                        <div className="text-2xl font-bold text-orange-600">{formatCurrency(Math.abs(debtMetrics.totalInterest))}</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-red-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Total Debt Service</div>
                        <div className="text-2xl font-bold text-rose-600">{formatCurrency(Math.abs(debtMetrics.totalDebtService))}</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-red-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Min DSCR</div>
                        <div className="text-2xl font-bold text-amber-600">{debtMetrics.minDscr.toFixed(2)}x</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm border border-red-100">
                        <div className="text-xs text-slate-500 uppercase tracking-wide">Avg DSCR</div>
                        <div className="text-2xl font-bold text-emerald-600">{debtMetrics.avgDscr.toFixed(2)}x</div>
                    </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                    {/* Debt Service Breakdown */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Debt Service Breakdown ($M)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    formatter={(value) => [`$${Math.abs(value).toFixed(2)}M`, '']}
                                    contentStyle={{ fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Bar dataKey="principalRepayment" stackId="ds" fill="#ef4444" name="Principal" />
                                <Bar dataKey="interestPaid" stackId="ds" fill="#f97316" name="Interest" />
                                <Bar dataKey="agencyFee" stackId="ds" fill="#fbbf24" name="Agency Fee" />
                                <Bar dataKey="dsrfFees" stackId="ds" fill="#fcd34d" name="DSRF Fees" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Debt Balance with DSCR overlay */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Debt Balance & DSCR</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <ComposedChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} />
                                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                                    domain={[0, 'auto']} />
                                <Tooltip
                                    formatter={(value, name) => {
                                        if (name === 'DSCR') return [`${value.toFixed(2)}x`, name]
                                        return [`$${value.toFixed(1)}M`, name]
                                    }}
                                    contentStyle={{ fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Area yAxisId="left" type="monotone" dataKey="debtBalance" fill="#fca5a5" stroke="#ef4444" name="Debt Balance" />
                                <Line yAxisId="right" type="monotone" dataKey="dscr" stroke="#10b981" strokeWidth={2} dot={false} name="DSCR" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Debt Summary Table */}
                <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Debt Service Summary</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">Sized Debt</span>
                                <span className="text-sm font-semibold text-red-600">{formatCurrency(debtMetrics.sizedDebt)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">Total Principal Repaid</span>
                                <span className="text-sm font-semibold text-red-600">({formatCurrency(Math.abs(debtMetrics.totalPrincipal))})</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">Total Interest Paid</span>
                                <span className="text-sm font-semibold text-orange-600">({formatCurrency(Math.abs(debtMetrics.totalInterest))})</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">Agency Fees</span>
                                <span className="text-sm font-semibold text-amber-600">({formatCurrency(Math.abs(debtMetrics.totalAgencyFee))})</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">DSRF Fees</span>
                                <span className="text-sm font-semibold text-yellow-600">({formatCurrency(Math.abs(debtMetrics.totalDsrfFees))})</span>
                            </div>
                            <div className="flex justify-between items-center py-3 bg-red-50 rounded-lg px-3 mt-4">
                                <span className="text-sm font-semibold text-red-900">Total Debt Service</span>
                                <span className="text-lg font-bold text-red-600">({formatCurrency(Math.abs(debtMetrics.totalDebtService))})</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">Final Outstanding Balance</span>
                                <span className="text-sm font-semibold text-slate-700">{formatCurrency(debtMetrics.finalBalance)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Covenant Summary */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-4">Covenant Metrics</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">Minimum DSCR</span>
                                <span className={`text-sm font-semibold ${debtMetrics.minDscr >= 1.2 ? 'text-emerald-600' : debtMetrics.minDscr >= 1.0 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {debtMetrics.minDscr.toFixed(2)}x
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">Average DSCR</span>
                                <span className={`text-sm font-semibold ${debtMetrics.avgDscr >= 1.3 ? 'text-emerald-600' : debtMetrics.avgDscr >= 1.1 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {debtMetrics.avgDscr.toFixed(2)}x
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">Interest / Sized Debt</span>
                                <span className="text-sm font-semibold text-slate-700">
                                    {debtMetrics.sizedDebt !== 0 ? `${(Math.abs(debtMetrics.totalInterest) / debtMetrics.sizedDebt * 100).toFixed(1)}%` : 'N/A'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <span className="text-sm text-slate-600">Interest / Total Service</span>
                                <span className="text-sm font-semibold text-slate-700">
                                    {debtMetrics.totalDebtService !== 0 ? `${(Math.abs(debtMetrics.totalInterest) / Math.abs(debtMetrics.totalDebtService) * 100).toFixed(1)}%` : 'N/A'}
                                </span>
                            </div>
                        </div>
                        {/* DSCR color legend */}
                        <div className="mt-6 pt-4 border-t border-slate-200">
                            <div className="text-xs text-slate-500 mb-2">DSCR Health</div>
                            <div className="flex gap-4">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                    <span className="text-xs text-slate-600">Strong (&gt;1.2x)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                                    <span className="text-xs text-slate-600">Adequate (1.0-1.2x)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                    <span className="text-xs text-slate-600">Breach (&lt;1.0x)</span>
                                </div>
                            </div>
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

        </div>
    )
}
