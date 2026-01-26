'use client'

import { formatValue } from '@/utils/valueAggregation'

/**
 * MetricCard - Reusable component for displaying key metrics
 * @param {string} title - Metric title
 * @param {number} value - Metric value
 * @param {string} format - 'currency', 'percent', 'number', 'ratio'
 * @param {string} color - Tailwind color class (e.g., 'indigo', 'emerald', 'amber')
 * @param {string} subtitle - Optional subtitle text
 */
export default function MetricCard({ title, value, format = 'currency', color = 'indigo', subtitle }) {
    const formatMetricValue = (val, fmt) => {
        if (val === null || val === undefined || isNaN(val)) return '–'

        switch (fmt) {
            case 'percent':
                return `${(val * 100).toFixed(1)}%`
            case 'ratio':
                return val.toFixed(2) + 'x'
            case 'currency':
                // Data is already in $M - just format and display
                return `$${formatValue(val, { decimals: 1 })}M`
            case 'number':
            default:
                return formatValue(val, { decimals: 1 })
        }
    }

    const colorClasses = {
        indigo: 'bg-indigo-50 border-indigo-200 text-indigo-600',
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-600',
        amber: 'bg-amber-50 border-amber-200 text-amber-600',
        rose: 'bg-rose-50 border-rose-200 text-rose-600',
        cyan: 'bg-cyan-50 border-cyan-200 text-cyan-600',
        purple: 'bg-purple-50 border-purple-200 text-purple-600',
        slate: 'bg-slate-50 border-slate-200 text-slate-600',
    }

    const valueColorClasses = {
        indigo: 'text-indigo-900',
        emerald: 'text-emerald-900',
        amber: 'text-amber-900',
        rose: 'text-rose-900',
        cyan: 'text-cyan-900',
        purple: 'text-purple-900',
        slate: 'text-slate-900',
    }

    return (
        <div className={`rounded-xl border p-4 ${colorClasses[color] || colorClasses.indigo}`}>
            <div className="text-xs font-medium uppercase tracking-wide opacity-75">{title}</div>
            <div className={`text-2xl font-bold mt-1 ${valueColorClasses[color] || valueColorClasses.indigo}`}>
                {formatMetricValue(value, format)}
            </div>
            {subtitle && (
                <div className="text-xs mt-1 opacity-60">{subtitle}</div>
            )}
        </div>
    )
}
