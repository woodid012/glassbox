'use client'

import { useState, useEffect, useMemo } from 'react'
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from 'lucide-react'

const SECTION_LABELS = { CF: 'Cash Flow', PL: 'Profit & Loss', BS: 'Balance Sheet' }
const SECTION_ORDER = ['CF', 'PL', 'BS']

const DRIFT_COLORS = {
    'none': 'bg-green-100 text-green-700',
    'one-time': 'bg-blue-100 text-blue-700',
    'periodic': 'bg-amber-100 text-amber-700',
    'cumulative': 'bg-red-100 text-red-700',
    'mixed': 'bg-purple-100 text-purple-700',
}

function fmt(v, decimals = 4) {
    if (v === null || v === undefined) return '-'
    if (v === Infinity || v === -Infinity) return 'Inf'
    const abs = Math.abs(v)
    if (abs === 0) return '0'
    if (abs < 0.01) return v.toFixed(6)
    if (abs < 1) return v.toFixed(4)
    if (abs < 1000) return v.toFixed(decimals)
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function MatchBadge({ match }) {
    return match
        ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3" /> Match</span>
        : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700"><XCircle className="w-3 h-3" /> Diff</span>
}

function DriftBadge({ pattern }) {
    if (!pattern || pattern === 'none') return null
    return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${DRIFT_COLORS[pattern] || 'bg-slate-100 text-slate-600'}`}>{pattern}</span>
}

function ResolutionBadge({ resolvedAt }) {
    if (resolvedAt === 'Baseline') return <span className="text-xs text-green-600 font-medium">Baseline</span>
    if (resolvedAt === 'UNRESOLVED') return <span className="text-xs text-red-600 font-medium">Unresolved</span>
    return <span className="text-xs text-blue-600 font-medium">{resolvedAt}</span>
}

function SummaryCards({ summary }) {
    return (
        <div className="grid grid-cols-4 gap-3 mb-4">
            {summary.map(run => (
                <div key={run.name} className={`p-3 rounded-lg border ${run.pct === 100 ? 'bg-green-50 border-green-200' : run.pct > 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="text-sm font-semibold text-slate-800">{run.name}</div>
                    <div className="text-xs text-slate-500 mb-2">{run.description}</div>
                    <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold">{run.pct}%</span>
                        <span className="text-xs text-slate-500 mb-1">{run.matched}/{run.total}</span>
                    </div>
                    {run.overrides.length > 0 && (
                        <div className="mt-1 text-xs text-slate-400">Overrides: {run.overrides.join(', ')}</div>
                    )}
                </div>
            ))}
        </div>
    )
}

function DrillDownTable({ drillDown }) {
    if (!drillDown || !drillDown.periods || drillDown.periods.length === 0) return null
    const periods = drillDown.periods
    const maxShow = 50
    const shown = periods.slice(0, maxShow)

    return (
        <div className="mt-2 mb-2 ml-6 mr-2">
            <div className="flex items-center gap-3 mb-1.5">
                <DriftBadge pattern={drillDown.driftPattern} />
                <span className="text-xs text-slate-500">
                    {drillDown.diffPeriodCount} periods differ | First: {drillDown.firstDiffDate} (p{drillDown.firstDiffPeriod}) | Max delta: {fmt(drillDown.maxPeriodDelta)}
                </span>
            </div>
            <table className="w-full text-xs border border-slate-200 rounded">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="px-2 py-1 text-left text-slate-500 font-medium">Period</th>
                        <th className="px-2 py-1 text-left text-slate-500 font-medium">Date</th>
                        <th className="px-2 py-1 text-right text-slate-500 font-medium">GB</th>
                        <th className="px-2 py-1 text-right text-slate-500 font-medium">Excel</th>
                        <th className="px-2 py-1 text-right text-slate-500 font-medium">Delta</th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map(p => (
                        <tr key={p.idx} className="border-t border-slate-100 hover:bg-amber-50/50">
                            <td className="px-2 py-0.5 font-mono text-slate-400">{p.idx}</td>
                            <td className="px-2 py-0.5 text-slate-600">{p.date}</td>
                            <td className="px-2 py-0.5 text-right font-mono">{fmt(p.gb)}</td>
                            <td className="px-2 py-0.5 text-right font-mono">{fmt(p.xl)}</td>
                            <td className={`px-2 py-0.5 text-right font-mono font-medium ${p.delta > 0 ? 'text-red-600' : p.delta < 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                                {p.delta > 0 ? '+' : ''}{fmt(p.delta)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {periods.length > maxShow && (
                <div className="text-xs text-slate-400 mt-1">Showing {maxShow} of {periods.length} periods</div>
            )}
        </div>
    )
}

function ComparisonSection({ section, lines, deltaOrigins, drillDown, activeRun }) {
    const [expanded, setExpanded] = useState({})

    const toggle = (key) => {
        setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
    }

    return (
        <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-700 mb-2 px-1">{SECTION_LABELS[section]}</h3>
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500">
                        <th className="w-6"></th>
                        <th className="px-3 py-1.5 text-left font-medium">Line</th>
                        <th className="px-3 py-1.5 text-left font-medium">Name</th>
                        <th className="px-2 py-1.5 text-center font-medium">XL Row</th>
                        <th className="px-3 py-1.5 text-right font-medium">GB Sum</th>
                        <th className="px-3 py-1.5 text-right font-medium">XL Sum</th>
                        <th className="px-3 py-1.5 text-right font-medium">Delta</th>
                        <th className="px-2 py-1.5 text-right font-medium">%</th>
                        <th className="px-3 py-1.5 text-center font-medium">Status</th>
                        <th className="px-3 py-1.5 text-center font-medium">Resolved</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map(([key, comp]) => {
                        const origin = deltaOrigins[key]
                        const dd = drillDown[key]
                        const isExpanded = expanded[key]
                        const hasDD = dd && dd.periods && dd.periods.length > 0

                        return (
                            <tr key={key} className="contents">
                                <td colSpan="10" className="p-0">
                                    <table className="w-full">
                                        <tbody>
                                            <tr
                                                className={`border-t border-slate-100 hover:bg-slate-50/80 ${hasDD ? 'cursor-pointer' : ''} ${!comp.match ? 'bg-red-50/30' : ''}`}
                                                onClick={hasDD ? () => toggle(key) : undefined}
                                            >
                                                <td className="w-6 px-1 py-1.5 text-center">
                                                    {hasDD ? (
                                                        isExpanded
                                                            ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                                            : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                                    ) : <span className="w-3.5" />}
                                                </td>
                                                <td className="px-3 py-1.5 font-mono text-xs font-medium text-indigo-600">{comp.gbRef || key}</td>
                                                <td className="px-3 py-1.5 text-slate-700">{comp.name}</td>
                                                <td className="px-2 py-1.5 text-center font-mono text-xs text-slate-400">{comp.excelRow}</td>
                                                <td className="px-3 py-1.5 text-right font-mono text-xs">{fmt(comp.gbSum, 2)}</td>
                                                <td className="px-3 py-1.5 text-right font-mono text-xs">{fmt(comp.xlSum, 2)}</td>
                                                <td className={`px-3 py-1.5 text-right font-mono text-xs font-medium ${!comp.match ? 'text-red-600' : 'text-slate-400'}`}>
                                                    {comp.match ? '-' : (comp.delta > 0 ? '+' : '') + fmt(comp.delta, 2)}
                                                </td>
                                                <td className="px-2 py-1.5 text-right font-mono text-xs text-slate-400">
                                                    {comp.match ? '-' : comp.pctDiff === Infinity ? 'Inf' : fmt(comp.pctDiff, 1) + '%'}
                                                </td>
                                                <td className="px-3 py-1.5 text-center"><MatchBadge match={comp.match} /></td>
                                                <td className="px-3 py-1.5 text-center">{origin && <ResolutionBadge resolvedAt={origin.resolvedAt} />}</td>
                                            </tr>
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan="10" className="bg-slate-50/50 border-t border-slate-100">
                                                        <DrillDownTable drillDown={dd} />
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

function ProgressionView({ deltaOrigins, runs }) {
    if (!runs || runs.length === 0) return null

    const keys = Object.keys(deltaOrigins)

    return (
        <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-700 mb-2">Override Progression</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-xs border border-slate-200 rounded">
                    <thead>
                        <tr className="bg-slate-50">
                            <th className="px-2 py-1.5 text-left text-slate-500 font-medium">Line</th>
                            <th className="px-2 py-1.5 text-left text-slate-500 font-medium">Name</th>
                            {runs.map(r => (
                                <th key={r.name} className="px-2 py-1.5 text-center text-slate-500 font-medium">{r.name}</th>
                            ))}
                            <th className="px-2 py-1.5 text-center text-slate-500 font-medium">Resolved</th>
                        </tr>
                    </thead>
                    <tbody>
                        {keys.map(key => {
                            const origin = deltaOrigins[key]
                            return (
                                <tr key={key} className="border-t border-slate-100 hover:bg-slate-50/50">
                                    <td className="px-2 py-1 font-mono font-medium text-indigo-600">{key}</td>
                                    <td className="px-2 py-1 text-slate-600">{origin.name}</td>
                                    {origin.progression.map((p, i) => (
                                        <td key={i} className="px-2 py-1 text-center">
                                            {p.match
                                                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" />
                                                : <span className="font-mono text-red-500">{fmt(p.delta, 1)}</span>
                                            }
                                        </td>
                                    ))}
                                    <td className="px-2 py-1 text-center"><ResolutionBadge resolvedAt={origin.resolvedAt} /></td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default function DebugPage() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('comparison')
    const [activeRun, setActiveRun] = useState(0)
    const [sectionFilter, setSectionFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')

    useEffect(() => {
        fetch('/api/compare-excel')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.json()
            })
            .then(d => { setData(d); setLoading(false) })
            .catch(e => { setError(e.message); setLoading(false) })
    }, [])

    const comparisons = useMemo(() => {
        if (!data || !data.runs || !data.runs[activeRun]) return {}
        return data.runs[activeRun].comparisons
    }, [data, activeRun])

    const groupedLines = useMemo(() => {
        const groups = {}
        for (const section of SECTION_ORDER) groups[section] = []

        for (const [key, comp] of Object.entries(comparisons)) {
            const section = comp.section || 'CF'
            if (!groups[section]) groups[section] = []
            if (sectionFilter !== 'all' && section !== sectionFilter) continue
            if (statusFilter === 'match' && !comp.match) continue
            if (statusFilter === 'diff' && comp.match) continue
            groups[section].push([key, comp])
        }
        return groups
    }, [comparisons, sectionFilter, statusFilter])

    const stats = useMemo(() => {
        if (!comparisons) return { total: 0, matched: 0, unmatched: 0 }
        const entries = Object.values(comparisons)
        return {
            total: entries.length,
            matched: entries.filter(c => c.match).length,
            unmatched: entries.filter(c => !c.match).length,
        }
    }, [comparisons])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                <span className="text-slate-500">Loading Excel comparison (this may take a moment)...</span>
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="text-red-700 font-semibold mb-1">Failed to load comparison</h3>
                    <p className="text-red-600 text-sm">{error}</p>
                    <p className="text-red-500 text-xs mt-2">Make sure <code>data/IFS_month.xlsx</code> exists.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 max-w-[1800px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-lg font-bold text-slate-800">Excel Comparison (IFS vs GlassBox)</h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Comparing {stats.total} lines | {stats.matched} match | {stats.unmatched} differ
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Run selector */}
                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        {(data?.summary || []).map((run, i) => (
                            <button
                                key={run.name}
                                onClick={() => setActiveRun(i)}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                                    activeRun === i
                                        ? 'bg-indigo-600 text-white shadow'
                                        : 'text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {run.name} ({run.pct}%)
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Summary cards */}
            <SummaryCards summary={data?.summary || []} />

            {/* Tabs */}
            <div className="flex items-center gap-4 mb-4 border-b border-slate-200">
                {[
                    { id: 'comparison', label: 'Line Comparison' },
                    { id: 'progression', label: 'Override Progression' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === tab.id
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}

                {/* Filters (only for comparison tab) */}
                {activeTab === 'comparison' && (
                    <div className="ml-auto flex items-center gap-2 pb-2">
                        <select
                            value={sectionFilter}
                            onChange={e => setSectionFilter(e.target.value)}
                            className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600"
                        >
                            <option value="all">All sections</option>
                            {SECTION_ORDER.map(s => (
                                <option key={s} value={s}>{SECTION_LABELS[s]}</option>
                            ))}
                        </select>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600"
                        >
                            <option value="all">All status</option>
                            <option value="match">Matches only</option>
                            <option value="diff">Diffs only</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Content */}
            {activeTab === 'comparison' && (
                <>
                    {SECTION_ORDER.map(section => {
                        const lines = groupedLines[section]
                        if (!lines || lines.length === 0) return null
                        return (
                            <ComparisonSection
                                key={section}
                                section={section}
                                lines={lines}
                                deltaOrigins={data?.deltaOrigins || {}}
                                drillDown={data?.drillDown || {}}
                                activeRun={activeRun}
                            />
                        )
                    })}
                </>
            )}

            {activeTab === 'progression' && (
                <ProgressionView deltaOrigins={data?.deltaOrigins || {}} runs={data?.summary || []} />
            )}
        </div>
    )
}
