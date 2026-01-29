/**
 * Colored metric card used in validation and model-review dashboards.
 *
 * Props:
 *   icon  - Lucide icon component
 *   label - Metric label (string)
 *   value - Display value (string or number)
 *   color - 'red' | 'amber' | 'blue' | 'green' | 'slate'
 */
const colorClasses = {
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700'
}

export default function SummaryCard({ label, value, icon: Icon, color }) {
    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${colorClasses[color]}`}>
            <Icon className="w-5 h-5" />
            <div>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs">{label}</div>
            </div>
        </div>
    )
}
