'use client'

import { useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import SummaryTab from './components/SummaryTab'
import PLTab from './components/PLTab'
import CashflowTab from './components/CashflowTab'
import BSTab from './components/BSTab'
import PageHeader from '../components/PageHeader'
import SubTabBar from '../components/SubTabBar'

const SUB_TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'pl', label: 'P&L' },
    { id: 'cashflow', label: 'Cashflow' },
    { id: 'bs', label: 'Balance Sheet' },
]

export default function OutputsPage() {
    const [activeTab, setActiveTab] = useState('summary')

    const {
        viewMode,
        appState,
        derived
    } = useDashboard()

    const {
        viewHeaders,
        calculationResults,
        calculationTypes,
    } = derived

    const calculations = appState?.calculations

    const renderActiveTab = () => {
        const commonProps = {
            viewHeaders,
            calculationResults,
            calculationTypes,
            viewMode,
            calculations,
        }

        switch (activeTab) {
            case 'summary':
                return <SummaryTab {...commonProps} />
            case 'pl':
                return <PLTab {...commonProps} />
            case 'cashflow':
                return <CashflowTab {...commonProps} />
            case 'bs':
                return <BSTab {...commonProps} />
            default:
                return <SummaryTab {...commonProps} />
        }
    }

    return (
        <main className="max-w-[1800px] mx-auto px-6 py-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Header */}
                <PageHeader title="Outputs" subtitle="Financial statements and key metrics" />

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
