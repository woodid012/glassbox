'use client'

import { Table } from 'lucide-react'

export default function MainTabNav({ activeTab, onTabChange }) {
    const tabs = [
        { id: 'glassinputs', label: 'Glass Inputs', icon: Table }
        // Model Builder disabled - see docs/MODEL_BUILDER_CONCEPT.md
    ]

    return (
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            {tabs.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2 rounded-md text-sm font-semibold transition-all ${
                            isActive
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                        }`}
                    >
                        <Icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                )
            })}
        </div>
    )
}
