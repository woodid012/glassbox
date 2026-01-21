'use client'

export default function NotesTab() {
    return (
        <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-4xl mx-auto">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Model Notes & Documentation</h2>

                {/* Forward-Fill Section */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
                    <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-slate-50">
                        <h3 className="text-lg font-semibold text-slate-900">Forward-Fill for Time Series</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-slate-700">
                            When input arrays don't extend to cover the full model timeline, the system automatically
                            <strong className="text-indigo-600"> forward-fills</strong> the last known value to fill remaining periods.
                        </p>

                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                            <h4 className="font-semibold text-slate-800 mb-2">How it works:</h4>
                            <ul className="list-disc list-inside space-y-2 text-slate-600">
                                <li>If your input data ends at June 2025 with value <code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm">100</code></li>
                                <li>And the model timeline extends to December 2026</li>
                                <li>Periods July 2025 onwards will automatically use <code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm">100</code></li>
                            </ul>
                        </div>

                        <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                            <h4 className="font-semibold text-amber-800 mb-2">Important Notes:</h4>
                            <ul className="list-disc list-inside space-y-2 text-amber-700">
                                <li><strong>Only applies to V, S, C references</strong> (Values, Series, Constants)</li>
                                <li><strong>Does NOT apply to Flags (F references)</strong> — flags are period-specific</li>
                                <li><strong>Does NOT fill gaps in the middle</strong> — only extends from the last defined value</li>
                            </ul>
                        </div>

                        <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                            <h4 className="font-semibold text-emerald-800 mb-2">Example:</h4>
                            <div className="font-mono text-sm text-emerald-700 space-y-1">
                                <div>Input data: <code className="bg-emerald-100 px-1 rounded">[100, 100, 100, 0, 0, 0]</code> (Jan-Jun)</div>
                                <div>After forward-fill: <code className="bg-emerald-100 px-1 rounded">[100, 100, 100, 100, 100, 100]</code> (Jan-Jun)</div>
                                <div className="text-emerald-600 text-xs mt-2">* The last non-zero value (100) fills the trailing zeros</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Reference Guide Section */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50">
                        <h3 className="text-lg font-semibold text-slate-900">Reference Guide</h3>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs px-2 py-1 rounded font-medium bg-indigo-100 text-indigo-700">V1</span>
                                    <span className="text-slate-600">Values group reference</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs px-2 py-1 rounded font-medium bg-emerald-100 text-emerald-700">S1</span>
                                    <span className="text-slate-600">Series group reference</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs px-2 py-1 rounded font-medium bg-amber-100 text-amber-700">C1</span>
                                    <span className="text-slate-600">Constants group reference</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs px-2 py-1 rounded font-medium bg-purple-100 text-purple-700">F1</span>
                                    <span className="text-slate-600">Flag reference (no forward-fill)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs px-2 py-1 rounded font-medium bg-cyan-100 text-cyan-700">I1</span>
                                    <span className="text-slate-600">Indexation reference</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs px-2 py-1 rounded font-medium bg-rose-100 text-rose-700">R1</span>
                                    <span className="text-slate-600">Calculation result reference</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}
