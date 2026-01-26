'use client'

import { useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import SummaryTab from './components/SummaryTab'
import PLTab from './components/PLTab'
import CashflowTab from './components/CashflowTab'

const SUB_TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'pl', label: 'P&L' },
    { id: 'cashflow', label: 'Cashflow' },
]

export default function OutputsPage() {
    const [activeTab, setActiveTab] = useState('summary')

    const {
        viewMode,
        setViewMode,
        derived
    } = useDashboard()

    const {
        viewHeaders,
        calculationResults,
        calculationTypes,
    } = derived

    const renderActiveTab = () => {
        const commonProps = {
            viewHeaders,
            calculationResults,
            calculationTypes,
            viewMode,
        }

        switch (activeTab) {
            case 'summary':
                return <SummaryTab {...commonProps} />
            case 'pl':
                return <PLTab {...commonProps} />
            case 'cashflow':
                return <CashflowTab {...commonProps} />
            default:
                return <SummaryTab {...commonProps} />
        }
    }

    return (
        <main className="max-w-[1800px] mx-auto px-6 py-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Outputs</h2>
                            <p className="text-sm text-slate-500">Financial statements and key metrics</p>
                        </div>

                        {/* View Mode Toggle */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">View:</span>
                            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-300">
                                {['M', 'Q', 'Y', 'FY'].map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setViewMode(mode)}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                            viewMode === mode
                                                ? 'bg-indigo-600 text-white'
                                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                                        }`}
                                    >
                                        {mode === 'M' ? 'Monthly' : mode === 'Q' ? 'Quarterly' : mode === 'Y' ? 'Yearly' : 'Fin. Year'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sub-tabs */}
                <div className="px-6 py-2 border-b border-slate-200 bg-white">
                    <div className="flex gap-1">
                        {SUB_TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    activeTab === tab.id
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {renderActiveTab()}
                </div>
            </div>
        </main>
    )
}
