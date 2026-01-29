'use client'

import { useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import SummaryTab from './components/SummaryTab'
import PLTab from './components/PLTab'
import CashflowTab from './components/CashflowTab'
import PageHeader from '../components/PageHeader'
import SubTabBar from '../components/SubTabBar'

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
                <PageHeader title="Outputs" subtitle="Financial statements and key metrics">
                    {/* View Mode Toggle */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">View:</span>
                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                            {['M', 'Q', 'Y', 'FY'].map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setViewMode(mode)}
                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                        viewMode === mode
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                                    }`}
                                >
                                    {mode === 'M' ? 'Monthly' : mode === 'Q' ? 'Quarterly' : mode === 'Y' ? 'Yearly' : 'Fin. Year'}
                                </button>
                            ))}
                        </div>
                    </div>
                </PageHeader>

                {/* Sub-tabs */}
                <SubTabBar tabs={SUB_TABS} activeTab={activeTab} onChange={setActiveTab} />

                {/* Content */}
                <div className="p-6">
                    {renderActiveTab()}
                </div>
            </div>
        </main>
    )
}
