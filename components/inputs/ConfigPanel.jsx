import React from 'react'
import { theme, cn } from './theme'

export default function ConfigPanel({ config, setConfig, timeline, inputCount, flagCount, indexCount }) {
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
                </div>
            </div>
        </div>
    )
}
