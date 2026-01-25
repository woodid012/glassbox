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
    ChevronDown,
    ChevronRight,
    RefreshCw,
    Filter,
    Link as LinkIcon,
    ExternalLink
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

function SeverityBadge({ severity }) {
    const config = severityConfig[severity]
    const Icon = config.icon

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.badgeColor}`}>
            <Icon className="w-3 h-3" />
            {config.label}
        </span>
    )
}

function CategoryBadge({ category }) {
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
            {categoryLabels[category] || category}
        </span>
    )
}

function IssueCard({ issue }) {
    const config = severityConfig[issue.severity]

    return (
        <div className={`p-3 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
            <div className="flex items-start gap-3">
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <SeverityBadge severity={issue.severity} />
                        <CategoryBadge category={issue.category} />
                    </div>
                    <p className={`mt-2 text-sm font-medium ${config.textColor}`}>
                        {issue.message}
                    </p>
                    {issue.details && (
                        <p className="mt-1 text-xs text-slate-600">
                            {issue.details}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

function CalculationIssueGroup({ calcRef, calcName, calcId, issues, isExpanded, onToggle, onGoTo }) {
    const errorCount = issues.filter(i => i.severity === SEVERITY.ERROR).length
    const warningCount = issues.filter(i => i.severity === SEVERITY.WARNING).length
    const infoCount = issues.filter(i => i.severity === SEVERITY.INFO).length

    // Determine overall severity for styling
    const hasErrors = errorCount > 0
    const hasWarnings = warningCount > 0

    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div className={`px-4 py-3 flex items-center justify-between ${
                hasErrors ? 'bg-red-50/50' : hasWarnings ? 'bg-amber-50/50' : ''
            }`}>
                <button
                    onClick={onToggle}
                    className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity"
                >
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <div>
                        <span className="font-mono text-sm font-medium text-indigo-600">
                            {calcRef}
                        </span>
                        {calcName && (
                            <span className="text-sm text-slate-600 ml-2">
                                {calcName}
                            </span>
                        )}
                    </div>
                </button>
                <div className="flex items-center gap-2">
                    {errorCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                            <AlertCircle className="w-3 h-3" />
                            {errorCount}
                        </span>
                    )}
                    {warningCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            <AlertTriangle className="w-3 h-3" />
                            {warningCount}
                        </span>
                    )}
                    {infoCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            <Info className="w-3 h-3" />
                            {infoCount}
                        </span>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onGoTo(calcId)
                        }}
                        className="ml-2 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
                        title="Go to calculation"
                    >
                        <ExternalLink className="w-3 h-3" />
                        Go to
                    </button>
                </div>
            </div>
            {isExpanded && (
                <div className="px-4 pb-4 pt-2 space-y-2 border-t border-slate-100">
                    {issues.map((issue, idx) => (
                        <IssueCard key={idx} issue={issue} />
                    ))}
                </div>
            )}
        </div>
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

export default function ValidationPage() {
    const { appState, derived, setters } = useDashboard()
    const { calculations } = appState
    const { referenceMap, moduleOutputs } = derived
    const { setSelectedCalculationId } = setters
    const router = useRouter()

    const [expandedCalcs, setExpandedCalcs] = useState(new Set())
    const [severityFilter, setSeverityFilter] = useState('all')
    const [categoryFilter, setCategoryFilter] = useState('all')

    // Navigate to a calculation
    const goToCalculation = (calcId) => {
        setSelectedCalculationId(calcId)
        router.push('/dashboard/calculations')
    }

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

    const toggleCalc = (calcRef) => {
        setExpandedCalcs(prev => {
            const next = new Set(prev)
            if (next.has(calcRef)) {
                next.delete(calcRef)
            } else {
                next.add(calcRef)
            }
            return next
        })
    }

    const expandAll = () => {
        setExpandedCalcs(new Set(Object.keys(groupedIssues)))
    }

    const collapseAll = () => {
        setExpandedCalcs(new Set())
    }

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

            {/* Filters and Actions */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <select
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value)}
                            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
                        >
                            <option value="all">All Severities</option>
                            <option value={SEVERITY.ERROR}>Errors Only</option>
                            <option value={SEVERITY.WARNING}>Warnings Only</option>
                            <option value={SEVERITY.INFO}>Info Only</option>
                        </select>
                    </div>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
                    >
                        <option value="all">All Categories</option>
                        <option value={CATEGORY.REFERENCE}>Reference Issues</option>
                        <option value={CATEGORY.SYNTAX}>Syntax Errors</option>
                        <option value={CATEGORY.DEPENDENCY}>Dependency Issues</option>
                        <option value={CATEGORY.BEST_PRACTICE}>Best Practices</option>
                        <option value={CATEGORY.RUNTIME}>Runtime Risks</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={expandAll}
                        className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100"
                    >
                        Expand All
                    </button>
                    <button
                        onClick={collapseAll}
                        className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100"
                    >
                        Collapse All
                    </button>
                </div>
            </div>

            {/* Issues List */}
            {hasIssues ? (
                <div className="space-y-3">
                    {Object.entries(groupedIssues)
                        .sort((a, b) => {
                            // Sort by highest severity issue in group
                            const aHasError = a[1].issues.some(i => i.severity === SEVERITY.ERROR)
                            const bHasError = b[1].issues.some(i => i.severity === SEVERITY.ERROR)
                            if (aHasError !== bHasError) return bHasError ? 1 : -1

                            const aHasWarning = a[1].issues.some(i => i.severity === SEVERITY.WARNING)
                            const bHasWarning = b[1].issues.some(i => i.severity === SEVERITY.WARNING)
                            if (aHasWarning !== bHasWarning) return bHasWarning ? 1 : -1

                            return 0
                        })
                        .map(([key, group]) => {
                            // Extract calc ID from calcRef (e.g., "R123" -> 123)
                            const calcId = group.calcRef ? parseInt(group.calcRef.replace('R', ''), 10) : null
                            return (
                                <CalculationIssueGroup
                                    key={key}
                                    calcRef={group.calcRef}
                                    calcName={group.calcName}
                                    calcId={calcId}
                                    issues={group.issues}
                                    isExpanded={expandedCalcs.has(key)}
                                    onToggle={() => toggleCalc(key)}
                                    onGoTo={goToCalculation}
                                />
                            )
                        })}
                </div>
            ) : (
                <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
                    <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900">All Checks Passed</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        No validation issues found in your calculations.
                    </p>
                </div>
            )}

            {/* Empty filtered state */}
            {hasIssues && filteredIssues.length === 0 && (
                <div className="text-center py-8 bg-white rounded-lg border border-slate-200">
                    <Filter className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                    <p className="text-sm text-slate-600">
                        No issues match the current filters.
                    </p>
                    <button
                        onClick={() => {
                            setSeverityFilter('all')
                            setCategoryFilter('all')
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-700 mt-2"
                    >
                        Clear filters
                    </button>
                </div>
            )}
        </div>
    )
}
