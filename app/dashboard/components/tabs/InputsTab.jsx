'use client'

import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import ExcelInputs from '@/components/inputs/ExcelInputs'
import IndicesSection from '@/components/inputs/IndicesSection'

export default function InputsTab({
    appState,
    setters,
    derived,
    handlers,
    viewMode
}) {
    const {
        config,
        showIndices,
        keyPeriods,
        inputGlass,
        indices,
        inputGlassGroups,
        collapsedInputGlassGroups
    } = appState

    const {
        setShowIndices,
        setCollapsedInputGlassGroups
    } = setters

    const {
        addInputGlassGroup,
        updateInputGlassGroup,
        removeInputGlassGroup,
        addInputGlass,
        updateInputGlass,
        removeInputGlass,
        addInputGlassSubgroup,
        updateInputGlassSubgroup,
        removeInputGlassSubgroup,
        addIndex,
        updateIndex,
        removeIndex
    } = handlers

    return (
        <>
            {/* Timing Constants Section */}
            <section className="max-w-[1800px] mx-auto px-6 py-6">
                <div className="bg-white backdrop-blur border border-slate-200 rounded-xl overflow-hidden shadow-lg">
                    <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-slate-900">Timing</h2>
                            <span className="text-xs text-slate-600">Time conversion constants</span>
                        </div>
                    </div>
                    <div className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="text-xs text-slate-500 uppercase mb-1">Hours / Year</div>
                                <div className="text-lg font-semibold text-slate-900">8,760</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="text-xs text-slate-500 uppercase mb-1">Hours / Day</div>
                                <div className="text-lg font-semibold text-slate-900">24</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="text-xs text-slate-500 uppercase mb-1">Days / Year</div>
                                <div className="text-lg font-semibold text-slate-900">365</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="text-xs text-slate-500 uppercase mb-1">Days / Month</div>
                                <div className="text-lg font-semibold text-slate-900">30.42</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="text-xs text-slate-500 uppercase mb-1">Months / Year</div>
                                <div className="text-lg font-semibold text-slate-900">12</div>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <div className="text-xs text-slate-500 uppercase mb-1">Quarters / Year</div>
                                <div className="text-lg font-semibold text-slate-900">4</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Inputs Section */}
            <section className="max-w-[1800px] mx-auto px-6 py-6">
                <div className="bg-white backdrop-blur border border-slate-200 rounded-xl overflow-hidden shadow-lg">
                    <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-semibold text-slate-900">Inputs</h2>
                                <span className="text-xs text-slate-600">Values by period</span>
                            </div>
                            <button
                                onClick={() => addInputGlassGroup()}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                <Plus className="w-4 h-4" />
                                Add Group
                            </button>
                        </div>
                    </div>
                    <div className="p-6">
                        <ExcelInputs
                            groups={inputGlassGroups}
                            inputs={inputGlass}
                            config={config}
                            keyPeriods={keyPeriods}
                            onUpdateGroup={updateInputGlassGroup}
                            onRemoveGroup={removeInputGlassGroup}
                            onAddInput={addInputGlass}
                            onUpdateInput={updateInputGlass}
                            onRemoveInput={removeInputGlass}
                            onAddSubgroup={addInputGlassSubgroup}
                            onUpdateSubgroup={updateInputGlassSubgroup}
                            onRemoveSubgroup={removeInputGlassSubgroup}
                            collapsedGroups={collapsedInputGlassGroups}
                            setCollapsedGroups={setCollapsedInputGlassGroups}
                        />
                    </div>
                </div>
            </section>

            {/* Indices Section */}
            <section className="max-w-[1800px] mx-auto px-6 py-6">
                <div className="bg-white backdrop-blur border border-slate-200 rounded-xl overflow-hidden shadow-lg mb-6">
                    <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                        <button
                            onClick={() => setShowIndices(!showIndices)}
                            className="flex items-center justify-between w-full text-left"
                        >
                            <div className="flex items-center gap-3">
                                {showIndices ? (
                                    <ChevronDown className="w-5 h-5 text-slate-600" />
                                ) : (
                                    <ChevronRight className="w-5 h-5 text-slate-600" />
                                )}
                                <h2 className="text-lg font-semibold text-slate-900">Indices</h2>
                                <span className="text-xs text-slate-600">Indexation time series</span>
                            </div>
                        </button>
                    </div>

                    {showIndices && (
                        <div className="p-6">
                            <IndicesSection
                                indices={indices}
                                config={config}
                                onAddIndex={addIndex}
                                onUpdateIndex={updateIndex}
                                onRemoveIndex={removeIndex}
                            />
                        </div>
                    )}
                </div>
            </section>

        </>
    )
}
