import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { theme, cn } from './theme'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function IndicesSection({
    indices,
    config,
    onAddIndex,
    onUpdateIndex,
    onRemoveIndex
}) {
    // Generate year options based on config
    const startYear = config?.startYear || 2024
    const endYear = config?.endYear || 2030
    const years = []
    for (let y = startYear; y <= endYear; y++) {
        years.push(y)
    }

    return (
        <div className="space-y-4">
            {/* Indices Table */}
            <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
                <table className="w-full">
                    <thead className={cn(theme.bg.sectionHeader, 'border-b', theme.border.light)}>
                        <tr>
                            <th className={cn('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', theme.text.secondary)}>
                                Name
                            </th>
                            <th className={cn('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', theme.text.secondary)}>
                                Start Date (MM/YYYY)
                            </th>
                            <th className={cn('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', theme.text.secondary)}>
                                Rate (%)
                            </th>
                            <th className={cn('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', theme.text.secondary)}>
                                Period
                            </th>
                            <th className={cn('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', theme.text.secondary)}>
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {indices.map((index) => (
                            <tr
                                key={index.id}
                                className="border-b border-slate-200 hover:bg-slate-50"
                            >
                                <td className="px-4 py-3">
                                    <input
                                        type="text"
                                        value={index.name}
                                        onChange={(e) => onUpdateIndex(index.id, 'name', e.target.value)}
                                        className="border border-slate-300 rounded px-2 py-1 text-sm w-full bg-white text-slate-900 focus:border-indigo-500 focus:outline-none"
                                        placeholder="Index Name"
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-1">
                                        <select
                                            value={index.indexationStartMonth || 1}
                                            onChange={(e) => onUpdateIndex(index.id, 'indexationStartMonth', parseInt(e.target.value))}
                                            className="border border-slate-300 rounded px-2 py-1 text-sm bg-white text-slate-900 focus:border-indigo-500 focus:outline-none"
                                        >
                                            {MONTHS.map((month, i) => (
                                                <option key={i} value={i + 1}>{month}</option>
                                            ))}
                                        </select>
                                        <span className="text-slate-400">/</span>
                                        <select
                                            value={index.indexationStartYear || startYear}
                                            onChange={(e) => onUpdateIndex(index.id, 'indexationStartYear', parseInt(e.target.value))}
                                            className="border border-slate-300 rounded px-2 py-1 text-sm bg-white text-slate-900 focus:border-indigo-500 focus:outline-none"
                                        >
                                            {years.map(year => (
                                                <option key={year} value={year}>{year}</option>
                                            ))}
                                        </select>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={index.indexationRate}
                                        onChange={(e) => onUpdateIndex(index.id, 'indexationRate', parseFloat(e.target.value) || 0)}
                                        className="border border-slate-300 rounded px-2 py-1 text-sm text-right w-24 bg-white text-slate-900 focus:border-indigo-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder="0"
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <select
                                        value={index.indexationPeriod || 'annual'}
                                        onChange={(e) => onUpdateIndex(index.id, 'indexationPeriod', e.target.value)}
                                        className="border border-slate-300 rounded px-2 py-1 text-sm bg-white text-slate-900 focus:border-indigo-500 focus:outline-none"
                                    >
                                        <option value="annual">Annual</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </td>
                                <td className="px-4 py-3">
                                    <button
                                        onClick={() => onRemoveIndex(index.id)}
                                        className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                        title="Remove index"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Index Button */}
            <div className="flex justify-start">
                <button
                    onClick={onAddIndex}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Index
                </button>
            </div>
        </div>
    )
}
