import React from 'react'
import { theme, cn } from './theme'

export default function ConfigPanel({ config, setConfig, timeline, inputCount, flagCount, indexCount, inputsEditMode, setInputsEditMode }) {
    return (
        <div className={cn(theme.bg.sectionHeader, 'border-b', theme.border.light)}>
            <div className="max-w-[1800px] mx-auto px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-indigo-600">{timeline.periods}</div>
                            <div className={cn('text-xs uppercase', theme.text.muted)}>Periods</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-600">{inputCount}</div>
                            <div className={cn('text-xs uppercase', theme.text.muted)}>Inputs</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-amber-600">{flagCount}</div>
                            <div className={cn('text-xs uppercase', theme.text.muted)}>Flags</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-cyan-600">{indexCount}</div>
                            <div className={cn('text-xs uppercase', theme.text.muted)}>Indexes</div>
                        </div>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <button
                            onClick={() => setInputsEditMode(true)}
                            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                                inputsEditMode
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                            }`}
                        >
                            Edit
                        </button>
                        <button
                            onClick={() => setInputsEditMode(false)}
                            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                                !inputsEditMode
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                            }`}
                        >
                            View
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
