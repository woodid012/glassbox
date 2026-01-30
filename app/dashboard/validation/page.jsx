'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDashboard } from '../context/DashboardContext'
import {
    validateAllCalculations,
    getValidationSummary,
    groupIssuesByCalculation,
    SEVERITY,
    CATEGORY
} from '@/utils/formulaValidation'
import {
    AlertCircle,
    AlertTriangle,
    Info,
    CheckCircle2,
    Filter,
    Link as LinkIcon,
    Scale,
    DollarSign
} from 'lucide-react'
import SummaryCard from '../components/SummaryCard'

// Severity icons and colors
const severityConfig = {
    [SEVERITY.ERROR]: {
        icon: AlertCircle,
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-700',
        badgeColor: 'bg-red-100 text-red-700',
        label: 'Error'
    },
    [SEVERITY.WARNING]: {
        icon: AlertTriangle,
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        textColor: 'text-amber-700',
        badgeColor: 'bg-amber-100 text-amber-700',
        label: 'Warning'
    },
    [SEVERITY.INFO]: {
        icon: Info,
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        textColor: 'text-blue-700',
        badgeColor: 'bg-blue-100 text-blue-700',
        label: 'Info'
    }
}

// Category labels
const categoryLabels = {
    [CATEGORY.REFERENCE]: 'Reference Issues',
    [CATEGORY.SYNTAX]: 'Syntax Errors',
    [CATEGORY.DEPENDENCY]: 'Dependency Issues',
    [CATEGORY.BEST_PRACTICE]: 'Best Practices',
    [CATEGORY.RUNTIME]: 'Runtime Risks'
}

function IssueRow({ issue, calcRef, calcName, calcId, onGoTo, showCalcRef }) {
    const config = severityConfig[issue.severity]
    const Icon = config.icon

    return (
        <tr className={`border-b border-slate-100 hover:bg-slate-50/50 ${showCalcRef ? '' : 'bg-slate-25'}`}>
            <td className="px-3 py-1.5 whitespace-nowrap align-top">
                {showCalcRef ? (
                    <button
                        onClick={() => onGoTo(calcId)}
                        className="font-mono text-xs font-medium text-indigo-600 hover:text-indigo-800"
                        title="Go to calculation"
                    >
                        {calcRef}
                    </button>
                ) : (
                    <span className="text-xs text-slate-300 font-mono">&nbsp;</span>
                )}
            </td>
            <td className="px-3 py-1.5 align-top">
                {showCalcRef && calcName && (
                    <span className="text-xs text-slate-500 mr-2">{calcName} &mdash;</span>
                )}
                <span className={`text-xs ${config.textColor}`}>{issue.message}</span>
                {issue.details && (
                    <span className="text-xs text-slate-400 ml-1">({issue.details})</span>
                )}
            </td>
            <td className="px-3 py-1.5 whitespace-nowrap align-top">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.badgeColor}`}>
                    <Icon className="w-2.5 h-2.5" />
                    {config.label}
                </span>
            </td>
            <td className="px-3 py-1.5 whitespace-nowrap align-top">
                <span className="text-[10px] text-slate-400">
                    {categoryLabels[issue.category]?.replace(' Issues', '').replace(' Errors', '').replace(' Risks', '') || issue.category}
                </span>
            </td>
        </tr>
    )
}

// Model integrity check component
function IntegrityCheck({ label, description, value, tolerance = 0.01, unit = '$M' }) {
    const isPass = Math.abs(value) <= tolerance
    const Icon = isPass ? CheckCircle2 : AlertCircle
    const colorClass = isPass
        ? 'bg-green-50 border-green-200'
        : 'bg-red-50 border-red-200'
    const iconColor = isPass ? 'text-green-600' : 'text-red-600'
    const valueColor = isPass ? 'text-green-700' : 'text-red-700'

    return (
        <div className={`flex items-center justify-between p-4 rounded-lg border ${colorClass}`}>
            <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${iconColor}`} />
                <div>
                    <div className="font-medium text-slate-900">{label}</div>
                    <div className="text-xs text-slate-500">{description}</div>
                </div>
            </div>
            <div className={`text-right ${valueColor}`}>
                <div className="text-lg font-bold">
                    {value >= 0 ? '' : '-'}{unit}{Math.abs(value).toFixed(2)}
                </div>
                <div className="text-xs">
                    {isPass ? 'PASS' : 'FAIL'}
                </div>
            </div>
        </div>
    )
}

export default function ValidationPage() {
    const { appState, derived, setters } = useDashboard()
    const { calculations } = appState
    const { referenceMap, moduleOutputs, calculationResults } = derived
    const { setSelectedCalculationId } = setters
    const router = useRouter()

    const [severityFilter, setSeverityFilter] = useState('all')
    const [categoryFilter, setCategoryFilter] = useState('all')

    // Navigate to a calculation
    const goToCalculation = (calcId) => {
        setSelectedCalculationId(calcId)
        router.push('/dashboard/calculations')
    }

    // Model integrity checks
    const integrityChecks = useMemo(() => {
        // Get values at end of construction (find last non-zero period for R64)
        const totalUsesArr = calculationResults?.R64 || []
        const totalSourcesArr = calculationResults?.R68 || []
        const sourcesUsesCheckArr = calculationResults?.R69 || []

        // Find the construction end period (last non-zero Total Uses)
        let constructionEndIdx = 0
        for (let i = totalUsesArr.length - 1; i >= 0; i--) {
            if (totalUsesArr[i] > 0) {
                constructionEndIdx = i
                break
            }
        }

        const totalUses = totalUsesArr[constructionEndIdx] || 0
        const totalSources = totalSourcesArr[constructionEndIdx] || 0
        const sourcesUsesCheck = sourcesUsesCheckArr[constructionEndIdx] || (totalSources - totalUses)

        // Balance sheet check - R195 should be zero every period
        const bsCheckArr = calculationResults?.R195 || []
        const totalAssetsArr = calculationResults?.R187 || []
        const totalLEArr = calculationResults?.R194 || []

        // Find max absolute deviation and the period it occurs
        let bsMaxDeviation = 0
        let bsMaxDeviationIdx = 0
        let bsFailCount = 0
        for (let i = 0; i < bsCheckArr.length; i++) {
            const val = Math.abs(bsCheckArr[i] || 0)
            if (val > 0.01) bsFailCount++
            if (val > Math.abs(bsMaxDeviation)) {
                bsMaxDeviation = bsCheckArr[i] || 0
                bsMaxDeviationIdx = i
            }
        }

        // Get the assets and L+E at the worst period for display
        const bsTotalAssets = totalAssetsArr[bsMaxDeviationIdx] || 0
        const bsTotalLE = totalLEArr[bsMaxDeviationIdx] || 0

        // Detailed B/S line items
        const getVal = (ref, idx) => (calculationResults?.[ref] || [])[idx] || 0
        const lastIdx = bsCheckArr.length - 1

        const bsDetail = {
            worstIdx: bsMaxDeviationIdx,
            lastIdx,
            assets: [
                { label: 'Cash & Cash Equivalents', ref: 'R182', worst: getVal('R182', bsMaxDeviationIdx), last: getVal('R182', lastIdx) },
                { label: 'Construction WIP', ref: 'R196', worst: getVal('R196', bsMaxDeviationIdx), last: getVal('R196', lastIdx) },
                { label: 'PP&E (Net Book Value)', ref: 'R183', worst: getVal('R183', bsMaxDeviationIdx), last: getVal('R183', lastIdx) },
                { label: 'Trade Receivables', ref: 'R184', worst: getVal('R184', bsMaxDeviationIdx), last: getVal('R184', lastIdx) },
                { label: 'GST Receivable', ref: 'R185', worst: getVal('R185', bsMaxDeviationIdx), last: getVal('R185', lastIdx) },
                { label: 'MRA Balance', ref: 'R186', worst: getVal('R186', bsMaxDeviationIdx), last: getVal('R186', lastIdx) },
            ],
            totalAssets: { worst: bsTotalAssets, last: getVal('R187', lastIdx) },
            liabilities: [
                { label: 'Construction Debt', ref: 'R198', worst: getVal('R198', bsMaxDeviationIdx), last: getVal('R198', lastIdx) },
                { label: 'Operations Debt', ref: 'R188', worst: getVal('R188', bsMaxDeviationIdx), last: getVal('R188', lastIdx) },
                { label: 'Trade Payables', ref: 'R189', worst: getVal('R189', bsMaxDeviationIdx), last: getVal('R189', lastIdx) },
            ],
            totalLiabilities: { worst: getVal('R190', bsMaxDeviationIdx), last: getVal('R190', lastIdx) },
            equity: [
                { label: 'Share Capital', ref: 'R191', worst: getVal('R191', bsMaxDeviationIdx), last: getVal('R191', lastIdx) },
                { label: 'Retained Earnings', ref: 'R192', worst: getVal('R192', bsMaxDeviationIdx), last: getVal('R192', lastIdx) },
            ],
            totalEquity: { worst: getVal('R193', bsMaxDeviationIdx), last: getVal('R193', lastIdx) },
            totalLE: { worst: bsTotalLE, last: getVal('R194', lastIdx) },
            check: { worst: bsMaxDeviation, last: getVal('R195', lastIdx) },
        }

        return {
            totalUses,
            totalSources,
            sourcesUsesCheck,
            constructionEndIdx,
            bsMaxDeviation,
            bsMaxDeviationIdx,
            bsFailCount,
            bsTotalAssets,
            bsTotalLE,
            bsTotalPeriods: bsCheckArr.length,
            bsDetail
        }
    }, [calculationResults])

    // Run validation
    const issues = useMemo(() => {
        return validateAllCalculations(calculations, referenceMap, moduleOutputs)
    }, [calculations, referenceMap, moduleOutputs])

    // Get summary
    const summary = useMemo(() => getValidationSummary(issues), [issues])

    // Filter issues
    const filteredIssues = useMemo(() => {
        return issues.filter(issue => {
            if (severityFilter !== 'all' && issue.severity !== severityFilter) return false
            if (categoryFilter !== 'all' && issue.category !== categoryFilter) return false
            return true
        })
    }, [issues, severityFilter, categoryFilter])

    // Group by calculation
    const groupedIssues = useMemo(() => {
        return groupIssuesByCalculation(filteredIssues)
    }, [filteredIssues])

    const hasIssues = issues.length > 0
    const hasErrors = summary.bySeverity[SEVERITY.ERROR] > 0

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900">Formula Validation</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Check calculations for errors, warnings, and best practice recommendations
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <SummaryCard
                    label="Total Issues"
                    value={summary.total}
                    icon={hasIssues ? AlertCircle : CheckCircle2}
                    color={hasErrors ? 'red' : hasIssues ? 'amber' : 'green'}
                />
                <SummaryCard
                    label="Errors"
                    value={summary.bySeverity[SEVERITY.ERROR]}
                    icon={AlertCircle}
                    color={summary.bySeverity[SEVERITY.ERROR] > 0 ? 'red' : 'slate'}
                />
                <SummaryCard
                    label="Warnings"
                    value={summary.bySeverity[SEVERITY.WARNING]}
                    icon={AlertTriangle}
                    color={summary.bySeverity[SEVERITY.WARNING] > 0 ? 'amber' : 'slate'}
                />
                <SummaryCard
                    label="Info"
                    value={summary.bySeverity[SEVERITY.INFO]}
                    icon={Info}
                    color={summary.bySeverity[SEVERITY.INFO] > 0 ? 'blue' : 'slate'}
                />
                <SummaryCard
                    label="Calculations"
                    value={calculations?.length || 0}
                    icon={LinkIcon}
                    color="slate"
                />
            </div>

            {/* Model Integrity Checks */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <Scale className="w-5 h-5 text-slate-600" />
                    <h2 className="text-lg font-semibold text-slate-900">Model Integrity Checks</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <IntegrityCheck
                        label="Sources = Uses"
                        description={`Total Sources (${integrityChecks.totalSources.toFixed(1)}M) - Total Uses (${integrityChecks.totalUses.toFixed(1)}M) at period ${integrityChecks.constructionEndIdx + 1}`}
                        value={integrityChecks.sourcesUsesCheck}
                        tolerance={0.01}
                        unit="$"
                    />
                    <IntegrityCheck
                        label="Balance Sheet Balances"
                        description={`Max deviation: period ${integrityChecks.bsMaxDeviationIdx + 1} | ${integrityChecks.bsFailCount === 0 ? 'All' : integrityChecks.bsTotalPeriods - integrityChecks.bsFailCount + '/' + integrityChecks.bsTotalPeriods} periods pass`}
                        value={integrityChecks.bsMaxDeviation}
                        tolerance={0.01}
                        unit="$"
                    />
                </div>

                {/* Detailed B/S Breakdown */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Scale className="w-4 h-4 text-slate-600" />
                            <h3 className="text-sm font-semibold text-slate-900">Balance Sheet Detail</h3>
                        </div>
                        <div className="text-xs text-slate-500">
                            Worst: Period {integrityChecks.bsDetail.worstIdx + 1} | End: Period {integrityChecks.bsDetail.lastIdx + 1}
                        </div>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Line Item</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-16">Ref</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Worst Period</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Final Period</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Assets */}
                            <tr className="border-b border-slate-100 bg-blue-50/30">
                                <td colSpan={4} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase tracking-wider">Assets</td>
                            </tr>
                            {integrityChecks.bsDetail.assets.map((item, i) => (
                                <tr key={`a-${i}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <td className="px-4 py-1.5 text-slate-700">{item.label}</td>
                                    <td className="px-4 py-1.5 text-xs font-mono text-slate-400">{item.ref}</td>
                                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{item.worst.toFixed(2)}</td>
                                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{item.last.toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr className="border-b border-slate-200 bg-blue-50/50 font-semibold">
                                <td className="px-4 py-1.5 text-blue-900">Total Assets</td>
                                <td className="px-4 py-1.5 text-xs font-mono text-slate-400">R187</td>
                                <td className="px-4 py-1.5 text-right font-mono tabular-nums text-blue-900">{integrityChecks.bsDetail.totalAssets.worst.toFixed(2)}</td>
                                <td className="px-4 py-1.5 text-right font-mono tabular-nums text-blue-900">{integrityChecks.bsDetail.totalAssets.last.toFixed(2)}</td>
                            </tr>

                            {/* Liabilities */}
                            <tr className="border-b border-slate-100 bg-red-50/30">
                                <td colSpan={4} className="px-4 py-1.5 text-xs font-bold text-red-700 uppercase tracking-wider">Liabilities</td>
                            </tr>
                            {integrityChecks.bsDetail.liabilities.map((item, i) => (
                                <tr key={`l-${i}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <td className="px-4 py-1.5 text-slate-700">{item.label}</td>
                                    <td className="px-4 py-1.5 text-xs font-mono text-slate-400">{item.ref}</td>
                                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{item.worst.toFixed(2)}</td>
                                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{item.last.toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr className="border-b border-slate-200 bg-red-50/50 font-semibold">
                                <td className="px-4 py-1.5 text-red-900">Total Liabilities</td>
                                <td className="px-4 py-1.5 text-xs font-mono text-slate-400">R190</td>
                                <td className="px-4 py-1.5 text-right font-mono tabular-nums text-red-900">{integrityChecks.bsDetail.totalLiabilities.worst.toFixed(2)}</td>
                                <td className="px-4 py-1.5 text-right font-mono tabular-nums text-red-900">{integrityChecks.bsDetail.totalLiabilities.last.toFixed(2)}</td>
                            </tr>

                            {/* Equity */}
                            <tr className="border-b border-slate-100 bg-green-50/30">
                                <td colSpan={4} className="px-4 py-1.5 text-xs font-bold text-green-700 uppercase tracking-wider">Equity</td>
                            </tr>
                            {integrityChecks.bsDetail.equity.map((item, i) => (
                                <tr key={`e-${i}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <td className="px-4 py-1.5 text-slate-700">{item.label}</td>
                                    <td className="px-4 py-1.5 text-xs font-mono text-slate-400">{item.ref}</td>
                                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{item.worst.toFixed(2)}</td>
                                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{item.last.toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr className="border-b border-slate-200 bg-green-50/50 font-semibold">
                                <td className="px-4 py-1.5 text-green-900">Total Equity</td>
                                <td className="px-4 py-1.5 text-xs font-mono text-slate-400">R193</td>
                                <td className="px-4 py-1.5 text-right font-mono tabular-nums text-green-900">{integrityChecks.bsDetail.totalEquity.worst.toFixed(2)}</td>
                                <td className="px-4 py-1.5 text-right font-mono tabular-nums text-green-900">{integrityChecks.bsDetail.totalEquity.last.toFixed(2)}</td>
                            </tr>

                            {/* Totals */}
                            <tr className="border-b border-slate-200 bg-slate-50 font-semibold">
                                <td className="px-4 py-1.5 text-slate-900">Total L + E</td>
                                <td className="px-4 py-1.5 text-xs font-mono text-slate-400">R194</td>
                                <td className="px-4 py-1.5 text-right font-mono tabular-nums text-slate-900">{integrityChecks.bsDetail.totalLE.worst.toFixed(2)}</td>
                                <td className="px-4 py-1.5 text-right font-mono tabular-nums text-slate-900">{integrityChecks.bsDetail.totalLE.last.toFixed(2)}</td>
                            </tr>
                            <tr className={`font-bold ${Math.abs(integrityChecks.bsDetail.check.worst) > 0.01 || Math.abs(integrityChecks.bsDetail.check.last) > 0.01 ? 'bg-red-50' : 'bg-green-50'}`}>
                                <td className="px-4 py-2 text-slate-900">Balance Check (A - L&E)</td>
                                <td className="px-4 py-2 text-xs font-mono text-slate-400">R195</td>
                                <td className={`px-4 py-2 text-right font-mono tabular-nums ${Math.abs(integrityChecks.bsDetail.check.worst) > 0.01 ? 'text-red-700' : 'text-green-700'}`}>
                                    {integrityChecks.bsDetail.check.worst.toFixed(4)}
                                </td>
                                <td className={`px-4 py-2 text-right font-mono tabular-nums ${Math.abs(integrityChecks.bsDetail.check.last) > 0.01 ? 'text-red-700' : 'text-green-700'}`}>
                                    {integrityChecks.bsDetail.check.last.toFixed(4)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-3">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                >
                    <option value="all">All Severities</option>
                    <option value={SEVERITY.ERROR}>Errors</option>
                    <option value={SEVERITY.WARNING}>Warnings</option>
                    <option value={SEVERITY.INFO}>Info</option>
                </select>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                >
                    <option value="all">All Categories</option>
                    <option value={CATEGORY.REFERENCE}>Reference</option>
                    <option value={CATEGORY.SYNTAX}>Syntax</option>
                    <option value={CATEGORY.DEPENDENCY}>Dependency</option>
                    <option value={CATEGORY.BEST_PRACTICE}>Best Practice</option>
                    <option value={CATEGORY.RUNTIME}>Runtime</option>
                </select>
                {(severityFilter !== 'all' || categoryFilter !== 'all') && (
                    <button
                        onClick={() => { setSeverityFilter('all'); setCategoryFilter('all') }}
                        className="text-xs text-indigo-600 hover:text-indigo-700"
                    >
                        Clear
                    </button>
                )}
                <span className="text-xs text-slate-400 ml-auto">{filteredIssues.length} issues</span>
            </div>

            {/* Issues Table */}
            {hasIssues && filteredIssues.length > 0 ? (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-20">Ref</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Info</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-20">Type</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-24">Category</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(groupedIssues)
                                .sort((a, b) => {
                                    const aHasError = a[1].issues.some(i => i.severity === SEVERITY.ERROR)
                                    const bHasError = b[1].issues.some(i => i.severity === SEVERITY.ERROR)
                                    if (aHasError !== bHasError) return bHasError ? 1 : -1
                                    const aHasWarning = a[1].issues.some(i => i.severity === SEVERITY.WARNING)
                                    const bHasWarning = b[1].issues.some(i => i.severity === SEVERITY.WARNING)
                                    if (aHasWarning !== bHasWarning) return bHasWarning ? 1 : -1
                                    return 0
                                })
                                .flatMap(([key, group]) => {
                                    const calcId = group.calcRef ? parseInt(group.calcRef.replace('R', ''), 10) : null
                                    return group.issues.map((issue, idx) => (
                                        <IssueRow
                                            key={`${key}-${idx}`}
                                            issue={issue}
                                            calcRef={group.calcRef}
                                            calcName={group.calcName}
                                            calcId={calcId}
                                            onGoTo={goToCalculation}
                                            showCalcRef={idx === 0}
                                        />
                                    ))
                                })}
                        </tbody>
                    </table>
                </div>
            ) : !hasIssues ? (
                <div className="text-center py-8 bg-white rounded-lg border border-slate-200">
                    <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                    <h3 className="text-sm font-medium text-slate-900">All Checks Passed</h3>
                    <p className="text-xs text-slate-500 mt-1">No validation issues found.</p>
                </div>
            ) : (
                <div className="text-center py-6 bg-white rounded-lg border border-slate-200">
                    <Filter className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-600">No issues match the current filters.</p>
                    <button
                        onClick={() => { setSeverityFilter('all'); setCategoryFilter('all') }}
                        className="text-xs text-indigo-600 hover:text-indigo-700 mt-1"
                    >
                        Clear filters
                    </button>
                </div>
            )}
        </div>
    )
}
