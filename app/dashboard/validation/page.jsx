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
import { formatValue } from '@/utils/valueAggregation'

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

// BS group IDs for Period Browser
const BS_GROUPS = [
    { groupId: 39, section: 'Assets', color: 'blue' },
    { groupId: 40, section: 'Liabilities', color: 'red' },
    { groupId: 41, section: 'Equity', color: 'green' },
    { groupId: 42, section: 'Check', color: 'slate' },
]

function buildBsLines(calculations) {
    const lines = []
    for (const grp of BS_GROUPS) {
        const calcs = (calculations || []).filter(c => c.groupId === grp.groupId)
        for (const c of calcs) {
            const ref = `R${c.id}`
            const nameLower = c.name.toLowerCase()
            lines.push({
                label: c.name,
                ref,
                bold: nameLower.includes('total') || grp.section === 'Check',
                check: grp.section === 'Check' && nameLower.includes('check'),
                section: grp.section,
            })
        }
    }
    return lines
}

// P&L group ID
const PL_GROUP_ID = 61

function buildPlLines(calculations) {
    const calcs = (calculations || []).filter(c => c.groupId === PL_GROUP_ID)
    return calcs.map(c => ({
        label: c.name,
        ref: `R${c.id}`,
        bold: ['ebitda', 'ebit', 'ebt', 'npat'].some(k => c.name.toLowerCase() === k),
        check: false,
    }))
}

// CF Waterfall group ID
const CF_GROUP_ID = 60

const CF_BOLD_KEYWORDS = ['total revenue', 'ebitda', 'operating cash', 'total capital', 'total funding', 'cash flow after', 'total debt service', 'net cash flow', 'cash balance']

function buildCfLines(calculations) {
    const calcs = (calculations || []).filter(c => c.groupId === CF_GROUP_ID)
    return calcs.map(c => ({
        label: c.name,
        ref: `R${c.id}`,
        bold: CF_BOLD_KEYWORDS.some(k => c.name.toLowerCase().includes(k)),
        check: false,
    }))
}

// Section header colors
const sectionColors = {
    Assets: { bg: 'bg-blue-50/30', text: 'text-blue-700', totalBg: 'bg-blue-50/50', totalText: 'text-blue-900' },
    Liabilities: { bg: 'bg-red-50/30', text: 'text-red-700', totalBg: 'bg-red-50/50', totalText: 'text-red-900' },
    Equity: { bg: 'bg-green-50/30', text: 'text-green-700', totalBg: 'bg-green-50/50', totalText: 'text-green-900' },
    Check: { bg: 'bg-slate-50', text: 'text-slate-600', totalBg: 'bg-slate-50', totalText: 'text-slate-900' },
}

const PERIODS_PER_PAGE = 20

function PeriodBrowser({ calculationResults, timeline, calculations }) {
    const [startIdx, setStartIdx] = useState(0)
    const [showSection, setShowSection] = useState('all') // 'all', 'bs', 'pl', 'cf'

    const bsLines = useMemo(() => buildBsLines(calculations), [calculations])
    const plLines = useMemo(() => buildPlLines(calculations), [calculations])
    const cfLines = useMemo(() => buildCfLines(calculations), [calculations])

    if (!timeline || !calculationResults) return null

    const maxPeriods = timeline.periods || 0
    const endIdx = Math.min(startIdx + PERIODS_PER_PAGE, maxPeriods)
    const periodIndices = []
    for (let i = startIdx; i < endIdx; i++) periodIndices.push(i)

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

    function periodLabel(i) {
        const y = timeline.year?.[i]
        const m = timeline.month?.[i]
        if (y && m) return `${monthNames[m - 1]} ${String(y).slice(2)}`
        return `P${i + 1}`
    }

    const acctFmt = { accounting: true, emptyValue: '' }

    function renderLines(lines, sectionLabel) {
        return (
            <>
                <tr className="bg-slate-100">
                    <td className="px-2 py-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-100 z-10" colSpan={1}>{sectionLabel}</td>
                    <td className="px-1 py-1 text-[10px] font-mono text-slate-400 sticky left-[180px] bg-slate-100 z-10"></td>
                    {periodIndices.map(i => <td key={i} className="px-1 py-1"></td>)}
                </tr>
                {lines.map(line => {
                    const arr = calculationResults[line.ref] || []
                    const isCheck = line.check
                    const isBold = line.bold
                    return (
                        <tr key={line.ref} className={`border-b border-slate-50 hover:bg-yellow-50/30 ${isBold ? 'bg-slate-50/70' : ''}`}>
                            <td className={`px-2 py-0.5 text-[11px] whitespace-nowrap sticky left-0 bg-white z-10 ${isBold ? 'font-semibold text-slate-900' : 'text-slate-600'}`} style={{ minWidth: 180 }}>
                                {line.label}
                            </td>
                            <td className="px-1 py-0.5 text-[10px] font-mono text-slate-400 sticky left-[180px] bg-white z-10" style={{ minWidth: 40 }}>
                                {line.ref}
                            </td>
                            {periodIndices.map(i => {
                                const v = arr[i] || 0
                                const isNonZero = Math.abs(v) > 0.005
                                const isFail = isCheck && Math.abs(v) > 0.01
                                return (
                                    <td key={i} className={`px-1 py-0.5 text-right font-mono text-[10px] tabular-nums whitespace-nowrap ${
                                        isFail ? 'bg-red-100 text-red-700 font-bold' :
                                        isCheck && isNonZero ? 'bg-red-50 text-red-600' :
                                        isCheck ? 'text-green-600' :
                                        v < -0.005 ? 'text-red-600' :
                                        isNonZero ? 'text-slate-600' : ''
                                    }`} style={{ minWidth: 72 }}>
                                        {isCheck ? (isNonZero ? v.toFixed(2) : '.') : formatValue(v, acctFmt)}
                                    </td>
                                )
                            })}
                        </tr>
                    )
                })}
            </>
        )
    }

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-slate-600" />
                    <h2 className="text-lg font-semibold text-slate-900">Period Browser</h2>
                    <span className="text-xs text-slate-400">Periods {startIdx + 1}–{endIdx} of {maxPeriods}</span>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={showSection}
                        onChange={e => setShowSection(e.target.value)}
                        className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                    >
                        <option value="all">All (BS + P&L + CF)</option>
                        <option value="bs">Balance Sheet</option>
                        <option value="pl">P&L</option>
                        <option value="cf">Cash Flow</option>
                    </select>
                    <button
                        onClick={() => setStartIdx(Math.max(0, startIdx - PERIODS_PER_PAGE))}
                        disabled={startIdx === 0}
                        className="px-2 py-1 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-30"
                    >
                        &larr; Prev
                    </button>
                    <button
                        onClick={() => setStartIdx(Math.min(maxPeriods - 1, startIdx + PERIODS_PER_PAGE))}
                        disabled={endIdx >= maxPeriods}
                        className="px-2 py-1 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-30"
                    >
                        Next &rarr;
                    </button>
                </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
                <table className="text-sm border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-10" style={{ minWidth: 180 }}>Line Item</th>
                            <th className="px-1 py-1.5 text-left text-[10px] font-semibold text-slate-400 sticky left-[180px] bg-slate-50 z-10" style={{ minWidth: 40 }}>Ref</th>
                            {periodIndices.map(i => (
                                <th key={i} className="px-1 py-1.5 text-right text-[10px] font-semibold text-slate-500 whitespace-nowrap" style={{ minWidth: 72 }}>
                                    {periodLabel(i)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(showSection === 'all' || showSection === 'bs') && renderLines(bsLines, 'Balance Sheet')}
                        {(showSection === 'all' || showSection === 'pl') && renderLines(plLines, 'P&L')}
                        {(showSection === 'all' || showSection === 'cf') && renderLines(cfLines, 'CF Waterfall')}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default function ValidationPage() {
    const { appState, derived, setters } = useDashboard()
    const { calculations } = appState
    const { referenceMap, moduleOutputs, calculationResults, timeline } = derived
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

        const lastIdx = bsCheckArr.length - 1

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
            lastIdx,
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

            </div>

            {/* Period Browser: BS + CF for first N periods */}
            <PeriodBrowser calculationResults={calculationResults} timeline={timeline} calculations={calculations} />

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
