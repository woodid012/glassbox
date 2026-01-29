'use client'

import { useMemo, useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import { analyzeModelCompleteness, generateMarkdownReport } from '@/utils/modelReviewAnalysis'
import {
    CheckCircle2,
    XCircle,
    ChevronDown,
    ChevronRight,
    FileText,
    Loader2,
    Package,
    BarChart3,
    Shield,
    Database,
    AlertCircle,
    MinusCircle
} from 'lucide-react'
import SummaryCard from '../components/SummaryCard'

// Load blueprint statically (bundled at build)
import blueprintData from '@/data/model-blueprint.json'

function PctSummaryCard({ label, value, total, icon, color }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 100
    const effectiveColor = pct === 100 ? 'green' : pct >= 75 ? 'amber' : color || 'red'
    return (
        <SummaryCard
            icon={icon}
            label={`${label} (${value}/${total})`}
            value={`${pct}%`}
            color={effectiveColor}
        />
    )
}

function IntegrityItem({ check }) {
    const isPass = check.status === 'pass'
    const isUnknown = check.status === 'unknown' || check.status === 'missing'
    const Icon = isPass ? CheckCircle2 : isUnknown ? MinusCircle : XCircle
    const bgClass = isPass
        ? 'bg-green-50 border-green-200'
        : isUnknown
        ? 'bg-slate-50 border-slate-200'
        : 'bg-red-50 border-red-200'
    const iconColor = isPass ? 'text-green-600' : isUnknown ? 'text-slate-400' : 'text-red-600'

    return (
        <div className={`flex items-center justify-between p-4 rounded-lg border ${bgClass}`}>
            <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${iconColor}`} />
                <div>
                    <div className="font-medium text-slate-900">{check.label}</div>
                    <div className="text-xs text-slate-500">{check.description}</div>
                </div>
            </div>
            <div className="text-right">
                <div className={`text-sm font-semibold ${isPass ? 'text-green-700' : isUnknown ? 'text-slate-400' : 'text-red-700'}`}>
                    {check.status === 'pass' ? 'PASS' : check.status === 'fail' ? 'FAIL' : 'N/A'}
                </div>
                <div className="text-xs text-slate-500">{check.message}</div>
            </div>
        </div>
    )
}

function SectionAccordion({ section }) {
    const [open, setOpen] = useState(false)
    const isComplete = section.completionPct === 100
    const pctColor = isComplete ? 'text-green-600' : section.completionPct >= 75 ? 'text-amber-600' : 'text-red-600'

    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span className="font-medium text-slate-900">{section.name}</span>
                    <span className={`text-sm font-semibold ${pctColor}`}>{section.completionPct}%</span>
                </div>
                <span className="text-xs text-slate-500">
                    {section.totalMatched}/{section.totalItems} matched
                </span>
            </button>
            {open && (
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 space-y-4">
                    {section.groups.map((group, gi) => (
                        <div key={gi}>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-slate-700">{group.name}</h4>
                                <span className="text-xs text-slate-500">{group.matched}/{group.total}</span>
                            </div>
                            <div className="space-y-1">
                                {group.items.map((item, ii) => (
                                    <div key={ii} className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                                        item.matched ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                                    }`}>
                                        {item.matched ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                        ) : (
                                            <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                                        )}
                                        <span className="font-medium">{item.label}</span>
                                        {item.matched ? (
                                            <span className="text-green-600 ml-auto">
                                                R{item.calcId} "{item.calcName}"
                                                <span className="text-green-400 ml-1">({item.matchType})</span>
                                            </span>
                                        ) : (
                                            <span className="text-red-500 ml-auto">
                                                {item.matchRef || 'Not found'}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function ModuleGrid({ modules }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {modules.items.map((mod, i) => (
                <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
                        mod.present
                            ? mod.enabled
                                ? 'bg-green-50 border-green-200'
                                : 'bg-amber-50 border-amber-200'
                            : mod.required
                            ? 'bg-red-50 border-red-200'
                            : 'bg-slate-50 border-slate-200'
                    }`}
                >
                    {mod.present ? (
                        mod.enabled ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                        )
                    ) : (
                        <XCircle className={`w-4 h-4 ${mod.required ? 'text-red-500' : 'text-slate-400'}`} />
                    )}
                    <div>
                        <div className="text-sm font-medium text-slate-900">{mod.label}</div>
                        <div className="text-xs text-slate-500">
                            {mod.present
                                ? mod.enabled ? 'Active' : 'Disabled'
                                : mod.required ? 'Missing (Required)' : 'Missing (Optional)'}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

function InputsPanel({ inputs }) {
    return (
        <div className="space-y-4">
            <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Key Periods</h4>
                <div className="space-y-1">
                    {inputs.keyPeriods.map((kp, i) => (
                        <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                            kp.matched ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                        }`}>
                            {kp.matched ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                            )}
                            <span className="font-medium">{kp.label}</span>
                            {kp.matched && (
                                <span className="text-green-600 ml-auto">"{kp.matchedName}" (id: {kp.matchedId})</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Constants</h4>
                <div className="space-y-1">
                    {inputs.constants.map((c, i) => (
                        <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                            c.matched ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                        }`}>
                            {c.matched ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                            )}
                            <span className="font-medium">{c.label}</span>
                            {c.matched && (
                                <span className="text-green-600 ml-auto">"{c.matchedName}" (id: {c.matchedId})</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default function ModelReviewPage() {
    const { appState, derived } = useDashboard()
    const { calculations, modules, keyPeriods, inputGlass, inputGlassGroups } = appState
    const { calculationResults } = derived

    const [reportStatus, setReportStatus] = useState(null)

    // Run analysis with live data
    const analysis = useMemo(() => {
        const inputs = {
            keyPeriods: keyPeriods || [],
            inputGlass: inputGlass || [],
            inputGlassGroups: inputGlassGroups || []
        }
        return analyzeModelCompleteness(
            blueprintData,
            calculations || [],
            modules || [],
            inputs,
            calculationResults
        )
    }, [calculations, modules, keyPeriods, inputGlass, inputGlassGroups, calculationResults])

    const handleGenerateReport = async () => {
        setReportStatus('generating')
        try {
            const res = await fetch('/api/model-review', { method: 'POST' })
            const data = await res.json()
            if (res.ok && data.success) {
                setReportStatus('saved')
                setTimeout(() => setReportStatus(null), 3000)
            } else {
                setReportStatus('error')
                setTimeout(() => setReportStatus(null), 3000)
            }
        } catch {
            setReportStatus('error')
            setTimeout(() => setReportStatus(null), 3000)
        }
    }

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Model Review</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Completeness check against project finance blueprint
                    </p>
                </div>
                <button
                    onClick={handleGenerateReport}
                    disabled={reportStatus === 'generating'}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        reportStatus === 'saved'
                            ? 'bg-green-50 border-green-300 text-green-700'
                            : reportStatus === 'error'
                            ? 'bg-red-50 border-red-300 text-red-700'
                            : 'bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100'
                    }`}
                >
                    {reportStatus === 'generating' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <FileText className="w-4 h-4" />
                    )}
                    {reportStatus === 'generating' ? 'Generating...'
                        : reportStatus === 'saved' ? 'Report Saved!'
                        : reportStatus === 'error' ? 'Error'
                        : 'Generate Report'}
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <PctSummaryCard
                    label="Overall"
                    value={analysis.overall.matched}
                    total={analysis.overall.total}
                    icon={BarChart3}
                />
                <PctSummaryCard
                    label="Calculations"
                    value={analysis.calculations.matched}
                    total={analysis.calculations.total}
                    icon={Database}
                />
                <PctSummaryCard
                    label="Modules"
                    value={analysis.modules.totalPresent}
                    total={analysis.modules.totalExpected}
                    icon={Package}
                />
                <PctSummaryCard
                    label="Inputs"
                    value={analysis.inputs.totalMatched}
                    total={analysis.inputs.totalExpected}
                    icon={Shield}
                />
            </div>

            {/* Integrity Checks */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-5 h-5 text-slate-600" />
                    <h2 className="text-lg font-semibold text-slate-900">Integrity Checks</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.integrity.map((check, i) => (
                        <IntegrityItem key={i} check={check} />
                    ))}
                </div>
            </div>

            {/* Section Accordions */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <Database className="w-5 h-5 text-slate-600" />
                    <h2 className="text-lg font-semibold text-slate-900">Calculation Sections</h2>
                </div>
                <div className="space-y-2">
                    {analysis.sections.map((section, i) => (
                        <SectionAccordion key={i} section={section} />
                    ))}
                </div>
            </div>

            {/* Modules */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <Package className="w-5 h-5 text-slate-600" />
                    <h2 className="text-lg font-semibold text-slate-900">
                        Modules ({analysis.modules.totalPresent}/{analysis.modules.totalExpected})
                    </h2>
                </div>
                <ModuleGrid modules={analysis.modules} />
            </div>

            {/* Inputs */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-5 h-5 text-slate-600" />
                    <h2 className="text-lg font-semibold text-slate-900">
                        Key Inputs ({analysis.inputs.totalMatched}/{analysis.inputs.totalExpected})
                    </h2>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <InputsPanel inputs={analysis.inputs} />
                </div>
            </div>
        </div>
    )
}
