'use client'

import { Settings, RotateCcw, Check, Loader2 } from 'lucide-react'

export default function DashboardHeader({
    tabs,
    activeTab,
    onTabChange,
    timeline,
    showConfig,
    onToggleConfig,
    saveStatus,
    onRevertToOriginal
}) {
    return (
        <div className="bg-white border-b border-slate-200">
            <div className="max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* Internal Tab Navigation */}
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-300">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${activeTab === tab.id
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                        {timeline.periods} periods
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Auto-save Status Indicator */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                        {saveStatus === 'saving' ? (
                            <>
                                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                                <span className="text-xs text-slate-500">Saving...</span>
                            </>
                        ) : saveStatus === 'saved' ? (
                            <>
                                <Check className="w-4 h-4 text-green-600" />
                                <span className="text-xs text-green-600">Saved</span>
                            </>
                        ) : saveStatus === 'error' ? (
                            <>
                                <span className="w-4 h-4 text-red-600">!</span>
                                <span className="text-xs text-red-600">Error</span>
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4 text-slate-400" />
                                <span className="text-xs text-slate-400">Auto-save on</span>
                            </>
                        )}
                    </div>

                    {/* Revert to Original Button */}
                    <button
                        onClick={onRevertToOriginal}
                        className="p-2 rounded-lg transition-colors bg-amber-600 text-white hover:bg-amber-700"
                        title="Revert to original template (discard all changes)"
                    >
                        <RotateCcw className="w-5 h-5" />
                    </button>

                    <button
                        onClick={onToggleConfig}
                        className={`p-2 rounded-lg transition-colors ${showConfig
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-300'
                            }`}
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    )
}
