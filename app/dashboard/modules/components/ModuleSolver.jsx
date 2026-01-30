'use client'

import { Play, RefreshCw } from 'lucide-react'

/**
 * Renders the solve button and solver result status for iterative debt sizing modules.
 */
export default function ModuleSolver({ module, moduleIndex, moduleOutputs, allRefs, solvingModuleId, onSolve }) {
    if (module.templateId !== 'iterative_debt_sizing') return null

    return (
        <div className="flex items-center gap-3 mb-4">
            <button
                onClick={() => onSolve(module.id)}
                disabled={solvingModuleId === module.id}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    solvingModuleId === module.id
                        ? 'bg-indigo-100 text-indigo-400 cursor-wait'
                        : module.solvedAt
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
            >
                {solvingModuleId === module.id ? (
                    <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Solving...
                    </>
                ) : module.solvedAt ? (
                    <>
                        <RefreshCw className="w-4 h-4" />
                        Re-solve
                    </>
                ) : (
                    <>
                        <Play className="w-4 h-4" />
                        Solve
                    </>
                )}
            </button>
            {module.solvedAt && (() => {
                const sizedDebtRef = `M${moduleIndex + 1}.1`
                const sizedDebtValues = moduleOutputs[sizedDebtRef] || []
                const sizedDebt = sizedDebtValues[0] || 0

                // Check if inputs resolved (support both old and new input key names)
                const cfadsRef = module.inputs?.contractedCfadsRef || module.inputs?.cfadsRef
                const cfadsArray = cfadsRef ? allRefs[cfadsRef] : null
                const cfadsFound = cfadsArray && cfadsArray.length > 0 && cfadsArray.some(v => v > 0)

                const flagRef = module.inputs?.debtFlagRef
                const flagArray = flagRef ? allRefs[flagRef] : null
                const flagFound = flagArray && flagArray.length > 0 && flagArray.some(v => v)

                return (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-4">
                            <span className="text-xs text-green-600">
                                Solved {new Date(module.solvedAt).toLocaleTimeString()}
                            </span>
                            <span className={`text-sm font-bold ${sizedDebt > 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                                Sized Debt: {sizedDebt > 0 ? sizedDebt.toFixed(2) + ' $M' : 'No viable debt found'}
                            </span>
                        </div>
                        {sizedDebt === 0 && (
                            <div className="text-xs text-red-500 space-y-0.5">
                                {!cfadsFound && cfadsRef && <div>CFADS ({cfadsRef}) not found or all zeros</div>}
                                {!flagFound && flagRef && (
                                    <div>
                                        Flag ({flagRef}) not found or all zeros.
                                        Available flags: {Object.keys(allRefs).filter(k => k.startsWith('F') && !k.includes('.')).sort().join(', ') || 'none'}
                                    </div>
                                )}
                                {!cfadsRef && <div>No CFADS reference set</div>}
                                {!flagRef && <div>No debt flag reference set</div>}
                            </div>
                        )}
                    </div>
                )
            })()}
            {!module.solvedAt && (
                <span className="text-xs text-amber-600">
                    Click Solve to run the debt sizing calculation
                </span>
            )}
        </div>
    )
}
