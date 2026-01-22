'use client'

import KeyPeriods from '@/components/inputs/KeyPeriods'
import { calculateLinkedStartPeriod, calculateLinkedAllPeriods, hasCircularDependency } from '../../../utils/dateCalculations'
import { useDashboard } from '../context/DashboardContext'

export default function KeyPeriodsPage() {
    const {
        viewMode,
        appState,
        setters,
        handlers
    } = useDashboard()

    const { config, keyPeriods, collapsedKeyPeriodGroups } = appState
    const { setConfig } = setters
    const {
        addKeyPeriod,
        updateKeyPeriod,
        removeKeyPeriod,
        reorderKeyPeriods,
        convertToGroup,
        ungroupPeriod,
        addToGroup,
        removeFromGroup,
        toggleKeyPeriodGroup
    } = handlers

    const handleUpdateConfig = (updates) => {
        if (setConfig) {
            setConfig({ ...config, ...updates })
        }
    }

    return (
        <section className="max-w-[1800px] mx-auto px-6 py-6">
            <div className="bg-white backdrop-blur border border-slate-200 rounded-xl overflow-hidden shadow-lg">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-slate-900">Key Periods</h2>
                    </div>
                </div>
                <div className="p-6">
                    <KeyPeriods
                        config={config}
                        keyPeriods={keyPeriods}
                        collapsedKeyPeriodGroups={collapsedKeyPeriodGroups || new Set()}
                        onAddPeriod={addKeyPeriod}
                        onUpdatePeriod={updateKeyPeriod}
                        onRemovePeriod={removeKeyPeriod}
                        onReorderPeriods={reorderKeyPeriods}
                        onUpdateConfig={handleUpdateConfig}
                        onConvertToGroup={convertToGroup}
                        onUngroupPeriod={ungroupPeriod}
                        onAddToGroup={addToGroup}
                        onRemoveFromGroup={removeFromGroup}
                        onToggleKeyPeriodGroup={toggleKeyPeriodGroup}
                        calculateLinkedStartPeriod={(linkedToPeriodId, linkOffset, allPeriods, linkToStart) =>
                            calculateLinkedStartPeriod(linkedToPeriodId, linkOffset, allPeriods, config, linkToStart)
                        }
                        calculateLinkedAllPeriods={(linkedToPeriodId, allPeriods) =>
                            calculateLinkedAllPeriods(linkedToPeriodId, allPeriods, config)
                        }
                        hasCircularDependency={hasCircularDependency}
                    />
                </div>
            </div>
        </section>
    )
}
