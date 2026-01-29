/**
 * Pill-style sub-tab switcher.
 *
 * Props:
 *   tabs      - Array of { id, label }
 *   activeTab - Currently selected tab id
 *   onChange  - Callback(tabId)
 */
export default function SubTabBar({ tabs, activeTab, onChange }) {
    return (
        <div className="px-6 py-2 border-b border-slate-200 bg-white">
            <div className="flex gap-1">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onChange(tab.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeTab === tab.id
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
    )
}
