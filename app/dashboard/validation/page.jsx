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

function SummaryCard({ label, value, icon: Icon, color }) {
    const colorClasses = {
        red: 'bg-red-50 border-red-200 text-red-700',
        amber: 'bg-amber-50 border-amber-200 text-amber-700',
        blue: 'bg-blue-50 border-blue-200 text-blue-700',
        green: 'bg-green-50 border-green-200 text-green-700',
        slate: 'bg-slate-50 border-slate-200 text-slate-700'
    }

    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${colorClasses[color]}`}>
            <Icon className="w-5 h-5" />
            <div>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs">{label}</div>
            </div>
        </div>
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
            bsTotalPeriods: bsCheckArr.length
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <IntegrityCheck
                        label="Sources = Uses"
                        description={`Total Sources (${integrityChecks.totalSources.toFixed(1)}M) - Total Uses (${integrityChecks.totalUses.toFixed(1)}M)`}
                        value={integrityChecks.sourcesUsesCheck}
                        tolerance={0.01}
                        unit="$"
                    />
                    <IntegrityCheck
                        label="Balance Sheet Balances"
                        description={`Assets (${integrityChecks.bsTotalAssets.toFixed(1)}M) - L+E (${integrityChecks.bsTotalLE.toFixed(1)}M) | ${integrityChecks.bsFailCount === 0 ? 'All' : integrityChecks.bsTotalPeriods - integrityChecks.bsFailCount + '/' + integrityChecks.bsTotalPeriods} periods pass`}
                        value={integrityChecks.bsMaxDeviation}
                        tolerance={0.01}
                        unit="$"
                    />
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-slate-50 border-slate-200">
                        <div className="flex items-center gap-3">
                            <DollarSign className="w-5 h-5 text-slate-500" />
                            <div>
                                <div className="font-medium text-slate-900">Construction Summary</div>
                                <div className="text-xs text-slate-500">At period {integrityChecks.constructionEndIdx + 1}</div>
                            </div>
                        </div>
                        <div className="text-right text-slate-700">
                            <div className="text-sm">Uses: <span className="font-semibold">${integrityChecks.totalUses.toFixed(1)}M</span></div>
                            <div className="text-sm">Sources: <span className="font-semibold">${integrityChecks.totalSources.toFixed(1)}M</span></div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-slate-50 border-slate-200">
                        <div className="flex items-center gap-3">
                            <Scale className="w-5 h-5 text-slate-500" />
                            <div>
                                <div className="font-medium text-slate-900">B/S Summary</div>
                                <div className="text-xs text-slate-500">Worst deviation at period {integrityChecks.bsMaxDeviationIdx + 1}</div>
                            </div>
                        </div>
                        <div className="text-right text-slate-700">
                            <div className="text-sm">Assets: <span className="font-semibold">${integrityChecks.bsTotalAssets.toFixed(1)}M</span></div>
                            <div className="text-sm">L+E: <span className="font-semibold">${integrityChecks.bsTotalLE.toFixed(1)}M</span></div>
                        </div>
                    </div>
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
