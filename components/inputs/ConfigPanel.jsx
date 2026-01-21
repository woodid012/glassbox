import React from 'react'
import { theme, cn } from './theme'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function ConfigPanel({ config, setConfig, timeline, inputCount, flagCount, indexCount }) {
    const handleFyStartMonthChange = (e) => {
        setConfig(prev => ({ ...prev, fyStartMonth: parseInt(e.target.value, 10) }))
    }

    return (
        <div className={cn(theme.bg.sectionHeader, 'border-b', theme.border.light)}>
            <div className="max-w-[1800px] mx-auto px-6 py-4">
                <div className="flex items-center gap-8">
                    <div className={cn('flex items-center gap-6')}>
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
                    <div className="border-l border-slate-300 pl-6 ml-2">
                        <label className={cn('text-xs uppercase', theme.text.muted, 'block mb-1')}>FY Start Month</label>
                        <select
                            value={config.fyStartMonth || 7}
                            onChange={handleFyStartMonthChange}
                            className="px-2 py-1 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            {MONTH_NAMES.map((name, idx) => (
                                <option key={idx + 1} value={idx + 1}>
                                    {idx + 1} - {name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    )
}
