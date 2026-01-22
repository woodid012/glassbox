import React from 'react'
import { X, Settings } from 'lucide-react'
import { theme, cn } from './theme'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function SettingsModal({ isOpen, onClose, config, setConfig }) {
    if (!isOpen) return null

    const handleFyStartMonthChange = (e) => {
        setConfig(prev => ({ ...prev, fyStartMonth: parseInt(e.target.value, 10) }))
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                            <Settings className="w-4 h-4 text-indigo-600" />
                        </div>
                        <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-5 space-y-6">
                    {/* FY Start Month */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Fiscal Year Start Month
                        </label>
                        <select
                            value={config.fyStartMonth || 7}
                            onChange={handleFyStartMonthChange}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            {MONTH_NAMES.map((name, idx) => (
                                <option key={idx + 1} value={idx + 1}>
                                    {idx + 1} - {name}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1.5 text-xs text-slate-500">
                            Sets when fiscal years begin for FY view mode
                        </p>
                    </div>

                    {/* Default Spread Method */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Default Value Type
                        </label>
                        <select
                            value={config.defaultSpreadMethod || 'lookup'}
                            onChange={(e) => setConfig(prev => ({ ...prev, defaultSpreadMethod: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="lookup">Stock (Lookup) - Same value each period</option>
                            <option value="spread">Flow (Spread) - Sum across periods</option>
                        </select>
                        <p className="mt-1.5 text-xs text-slate-500">
                            How new inputs aggregate when viewing in different intervals (e.g., monthly → annual)
                        </p>
                    </div>

                    {/* Prefill Lookups */}
                    <div>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.prefillLookups !== false}
                                onChange={(e) => setConfig(prev => ({ ...prev, prefillLookups: e.target.checked }))}
                                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                                <span className="block text-sm font-medium text-slate-700">Prefill Lookups</span>
                                <span className="block text-xs text-slate-500 mt-0.5">
                                    Auto-fill empty lookup cells with the previous value
                                </span>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}
