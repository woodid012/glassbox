'use client'

import { Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { DeferredInput } from '@/components/DeferredInput'
import { MODULE_TEMPLATES } from '@/utils/modules'
import ModuleInputDisplay from './ModuleInputDisplay'
import ModuleSolver from './ModuleSolver'
import { PartialModuleOutputs, FullyConvertedOutputs } from './ModuleOutputs'

/**
 * Renders a single module card with header, inputs, solver, and outputs.
 */
export default function ModuleCard({
    module,
    moduleIndex,
    template,
    inputsEditMode,
    // Data
    keyPeriods,
    inputGlass,
    calculations,
    indices,
    allRefs,
    moduleOutputs,
    calculationResults,
    displayPeriods,
    viewMode,
    // Solver state
    solvingModuleId,
    // Toggle states
    showFormulas,
    showDiff,
    showSolverInfo,
    // Callbacks
    onUpdateModuleName,
    onToggleEnabled,
    onRemove,
    onUpdateInput,
    onSolve,
    onToggleFormulas,
    onToggleDiff,
    onToggleSolverInfo,
    aggregateValues
}) {
    return (
        <div
            className={`border rounded-lg p-4 transition-all ${
                module.enabled === false
                    ? 'border-slate-200 bg-slate-50 opacity-60'
                    : 'border-slate-200 bg-white'
            }`}
        >
            {/* Card Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium text-orange-600 bg-orange-100">
                        M{moduleIndex + 1}
                    </span>
                    {inputsEditMode ? (
                        <DeferredInput
                            type="text"
                            value={module.name}
                            onChange={(val) => onUpdateModuleName(module.id, val)}
                            className="text-sm font-semibold text-slate-900 bg-slate-100 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    ) : (
                        <span className="text-sm font-semibold text-slate-900">{module.name}</span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                        module.category === 'financing' ? 'bg-blue-100 text-blue-700' :
                        module.category === 'accounting' ? 'bg-purple-100 text-purple-700' :
                        'bg-green-100 text-green-700'
                    }`}>
                        {module.category}
                    </span>
                </div>
                {inputsEditMode && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onToggleEnabled(module.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            module.enabled === false
                                ? 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                        title={module.enabled === false ? 'Enable module' : 'Disable module'}
                    >
                        {module.enabled === false ? (
                            <>
                                <ToggleLeft className="w-4 h-4" />
                                Disabled
                            </>
                        ) : (
                            <>
                                <ToggleRight className="w-4 h-4" />
                                Enabled
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => onRemove(module.id)}
                        className="p-1.5 hover:bg-red-100 rounded text-slate-400 hover:text-red-500 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
                )}
            </div>

            {/* Module Inputs - only in edit mode */}
            {inputsEditMode && template && (
                <ModuleInputDisplay
                    module={module}
                    template={template}
                    keyPeriods={keyPeriods}
                    allRefs={allRefs}
                    inputGlass={inputGlass}
                    calculations={calculations}
                    indices={indices}
                    onUpdateInput={onUpdateInput}
                />
            )}

            {/* Solve Button for iterative modules - only in edit mode */}
            {inputsEditMode && (
                <ModuleSolver
                    module={module}
                    moduleIndex={moduleIndex}
                    moduleOutputs={moduleOutputs}
                    allRefs={allRefs}
                    solvingModuleId={solvingModuleId}
                    onSolve={onSolve}
                />
            )}

            {/* Module Outputs Summary (non-fully-converted) */}
            <PartialModuleOutputs
                module={module}
                moduleIndex={moduleIndex}
                template={template}
                displayPeriods={displayPeriods}
                viewMode={viewMode}
                allRefs={allRefs}
                moduleOutputs={moduleOutputs}
                calculationResults={calculationResults}
                calculations={calculations}
                inputsEditMode={inputsEditMode}
                inputGlass={inputGlass}
                keyPeriods={keyPeriods}
                indices={indices}
                showFormulas={showFormulas}
                showDiff={showDiff}
                showSolverInfo={showSolverInfo}
                onToggleFormulas={onToggleFormulas}
                onToggleDiff={onToggleDiff}
                onToggleSolverInfo={onToggleSolverInfo}
                aggregateValues={aggregateValues}
            />

            {/* Calcs Preview - fully converted modules */}
            <FullyConvertedOutputs
                module={module}
                moduleIndex={moduleIndex}
                template={template}
                displayPeriods={displayPeriods}
                allRefs={allRefs}
                moduleOutputs={moduleOutputs}
                calculationResults={calculationResults}
                calculations={calculations}
                inputsEditMode={inputsEditMode}
                showFormulas={showFormulas}
                showDiff={showDiff}
                onToggleFormulas={onToggleFormulas}
                onToggleDiff={onToggleDiff}
                aggregateValues={aggregateValues}
            />
        </div>
    )
}
