// Temporary API endpoint to compare old vs new model results
// Runs the server engine with current data, then with backup data (no _mRefMap, no converted flag)
// Returns differences

import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { runServerModel } from '@/utils/serverModelEngine'
import { evaluateSafeExpression } from '@/utils/formulaEvaluator'
import { loadModelData } from '@/utils/loadModelData'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const dataDir = path.join(process.cwd(), 'data')
        const { inputs, calculations: currentCalcs } = await loadModelData(dataDir)
        const backupCalcs = JSON.parse(await fs.readFile(path.join(dataDir, 'model-calculations.backup.json'), 'utf-8'))

        // Run new model (with debug)
        const newResults = runServerModel(inputs, currentCalcs, { debug: true })

        // Run old model
        const oldResults = runServerModel(inputs, backupCalcs)

        // Compare original calc results (R3-R209)
        const calcDiffs = []
        for (const [ref, oldValues] of Object.entries(oldResults.calculationResults)) {
            const id = parseInt(ref.substring(1))
            if (id >= 9000) continue // Skip generated calcs

            const newValues = newResults.calculationResults[ref]
            if (!newValues) {
                calcDiffs.push({ ref, issue: 'missing_in_new' })
                continue
            }

            let maxDiff = 0, maxDiffIdx = 0
            for (let i = 0; i < oldValues.length; i++) {
                const diff = Math.abs((oldValues[i] || 0) - (newValues[i] || 0))
                if (diff > maxDiff) { maxDiff = diff; maxDiffIdx = i }
            }

            if (maxDiff > 0.01) {
                calcDiffs.push({
                    ref, maxDiff: +maxDiff.toFixed(6), period: maxDiffIdx,
                    oldVal: +(oldValues[maxDiffIdx] || 0).toFixed(6),
                    newVal: +(newValues[maxDiffIdx] || 0).toFixed(6)
                })
            }
        }

        // Compare module outputs
        const modDiffs = []
        const mRefMap = currentCalcs._mRefMap || {}

        for (const [ref, oldValues] of Object.entries(oldResults.moduleOutputs)) {
            // In new model, converted module outputs are in calculationResults via R-refs
            // Also check moduleOutputs (M-ref aliases are populated there)
            const newValues = newResults.moduleOutputs[ref] || newResults.calculationResults[ref]

            // Also try via mRefMap
            const rRef = mRefMap[ref]
            const aliasedValues = rRef ? (newResults.calculationResults[rRef] || newResults.moduleOutputs[rRef]) : null
            const compareValues = newValues || aliasedValues

            if (!compareValues) {
                modDiffs.push({ ref, rRef, issue: 'missing_in_new' })
                continue
            }

            let maxDiff = 0, maxDiffIdx = 0
            for (let i = 0; i < oldValues.length; i++) {
                const diff = Math.abs((oldValues[i] || 0) - (compareValues[i] || 0))
                if (diff > maxDiff) { maxDiff = diff; maxDiffIdx = i }
            }

            if (maxDiff > 0.01) {
                modDiffs.push({
                    ref, rRef, maxDiff: +maxDiff.toFixed(6), period: maxDiffIdx,
                    oldVal: +(oldValues[maxDiffIdx] || 0).toFixed(6),
                    newVal: +(compareValues[maxDiffIdx] || 0).toFixed(6)
                })
            }
        }

        // Debug: dump M7 waterfall values at key periods
        const debugM7 = {}
        const m7Keys = ['M7.1','M7.11','M7.12','M7.13','M7.20','M7.21']
        for (const key of m7Keys) {
            const oldArr = oldResults.moduleOutputs[key]
            const rRef = mRefMap[key]
            const newArr = rRef ? (newResults.calculationResults[rRef] || newResults.moduleOutputs[rRef]) : newResults.moduleOutputs[key]
            if (oldArr && newArr) {
                // Find first divergence
                let firstDiffIdx = -1
                for (let i = 0; i < oldArr.length; i++) {
                    if (Math.abs((oldArr[i]||0) - (newArr[i]||0)) > 0.01) {
                        firstDiffIdx = i
                        break
                    }
                }
                debugM7[key] = {
                    rRef,
                    firstDiff: firstDiffIdx,
                    ...(firstDiffIdx >= 0 ? {
                        around_diff: {
                            old: oldArr.slice(Math.max(0,firstDiffIdx-2), firstDiffIdx+5).map(v => +v.toFixed(2)),
                            new: newArr.slice(Math.max(0,firstDiffIdx-2), firstDiffIdx+5).map(v => +v.toFixed(2)),
                            startIdx: Math.max(0,firstDiffIdx-2)
                        }
                    } : {})
                }
            }
        }

        // Debug: dump M4 outputs for key periods
        const debugM4 = {}
        for (const key of ['M4.1','M4.2','M4.3','M4.4','M4.5','M4.6','M4.7','M4.8','M4.9']) {
            const oldArr = oldResults.moduleOutputs[key]
            const rRef = mRefMap[key]
            const newArr = rRef ? (newResults.calculationResults[rRef] || newResults.moduleOutputs[rRef]) : newResults.moduleOutputs[key]
            if (oldArr && newArr) {
                debugM4[key] = {
                    rRef,
                    old_p15_18: oldArr.slice(15, 19).map(v => +v.toFixed(4)),
                    new_p15_18: newArr.slice(15, 19).map(v => +v.toFixed(4)),
                }
            }
        }

        // Debug: trace npat_test divergence
        const debugLockup = {}
        const traceRefs = ['R19', 'R9039', 'R9040', 'R9041', 'R9052', 'R9053', 'R9054', 'R9055', 'R9056', 'R9057']
        for (const ref of traceRefs) {
            const oldArr = oldResults.calculationResults[ref] || oldResults.moduleOutputs[ref]
            const newArr = newResults.calculationResults[ref] || newResults.moduleOutputs[ref]
            // Also check M-ref aliases
            const oldMRef = ref === 'R9039' ? oldResults.moduleOutputs['M7.3'] :
                           ref === 'R9040' ? oldResults.moduleOutputs['M7.4'] :
                           ref === 'R9041' ? oldResults.moduleOutputs['M7.5'] :
                           ref === 'R9052' ? oldResults.moduleOutputs['M7.16'] :
                           ref === 'R9055' ? oldResults.moduleOutputs['M7.19'] :
                           ref === 'R9056' ? oldResults.moduleOutputs['M7.20'] :
                           ref === 'R9057' ? oldResults.moduleOutputs['M7.21'] : null
            const effectiveOld = oldArr || oldMRef
            const effectiveNew = newArr
            debugLockup[ref] = {
                hasOld: !!effectiveOld,
                hasNew: !!effectiveNew,
                old_p16_22: effectiveOld?.slice(16, 23).map(v => v?.toFixed(6)),
                new_p16_22: effectiveNew?.slice(16, 23).map(v => v?.toFixed(6)),
                old_p90_96: effectiveOld?.slice(90, 97).map(v => v?.toFixed(6)),
                new_p90_96: effectiveNew?.slice(90, 97).map(v => v?.toFixed(6)),
                old_p136_142: effectiveOld?.slice(136, 143).map(v => v?.toFixed(6)),
                new_p136_142: effectiveNew?.slice(136, 143).map(v => v?.toFixed(6)),
            }
        }

        // Debug: manually verify R9041 should be (R9039 > 0) converted to 0/1
        const r9039new = newResults.calculationResults['R9039']
        const r9041new = newResults.calculationResults['R9041']
        const r9041expected = r9039new ? r9039new.map(v => v > 0 ? 1 : 0) : null

        // Check if R9041 was overwritten by the mRefMap aliasing
        const mRefMap2 = currentCalcs._mRefMap || {}
        const r9041mRefAlias = Object.entries(mRefMap2).find(([m, r]) => r === 'R9041')

        // Manual eval test
        const directEval = new Function('return (0.273 > 0)')()
        const directEval2 = new Function('return ((0.273 > 0))')()
        // Trace evaluateSafeExpression step by step
        const testExpr = '(0.273 > 0)'
        const step1 = testExpr
            .replace(/\bMIN\s*\(/gi, 'Math.min(')
            .replace(/\bMAX\s*\(/gi, 'Math.max(')
            .replace(/\bABS\s*\(/gi, 'Math.abs(')
        const step2 = step1.replace(/[^0-9+\-*/().e\s^Math.minaxbs,<>=!&|%]/gi, '')
        const step3 = step2.replace(/\^/g, '**')
        let step4result
        try { step4result = new Function(`return (${step3})`)() } catch(e) { step4result = `error: ${e.message}` }
        const manualEvalTests = {
            directEval,
            directEval2,
            step1,
            step2,
            step3,
            step2_same_as_step1: step2 === step1,
            step4result,
            step4type: typeof step4result,
            evaluateSafeResult: evaluateSafeExpression(testExpr),
            // Also test simple arithmetic
            simpleAdd: evaluateSafeExpression('2 + 3'),
            simpleCompare: evaluateSafeExpression('5 > 3'),
            maxCompare: evaluateSafeExpression('MAX(0, (0.273 > 0))'),
        }

        const r9041debug = {
            r9039_exists: !!r9039new,
            r9041_exists: !!r9041new,
            r9039_p18: r9039new?.[18],
            r9041_actual_p18: r9041new?.[18],
            r9041_expected_p18: r9041expected?.[18],
            r9041_all_zero: r9041new?.every(v => v === 0),
            r9041_first_nonzero: r9041new?.findIndex(v => v !== 0),
            r9041expected_first_nonzero: r9041expected?.findIndex(v => v !== 0),
            r9041_mRefAlias: r9041mRefAlias || null,
            r9041_inModOutputs: !!newResults.moduleOutputs?.['R9041'],
            m75_in_mRefMap: mRefMap2['M7.5'],
            m75_modOutput: newResults.moduleOutputs?.['M7.5'] ? newResults.moduleOutputs['M7.5'].slice(18, 20) : null,
        }

        // Sort by magnitude
        calcDiffs.sort((a, b) => (b.maxDiff || 0) - (a.maxDiff || 0))
        modDiffs.sort((a, b) => (b.maxDiff || 0) - (a.maxDiff || 0))

        return NextResponse.json({
            manualEvalTests,
            evalDebug: newResults.evalDebug || {},
            r9041debug,
            clusterDebug: newResults.clusterDebug || [],
            debugLockup,
            debugM7,
            debugM4,
            calcDiffs: calcDiffs.slice(0, 50),
            calcDiffCount: calcDiffs.length,
            calcTotalCompared: Object.keys(oldResults.calculationResults).filter(r => parseInt(r.substring(1)) < 9000).length,
            modDiffs: modDiffs.slice(0, 50),
            modDiffCount: modDiffs.length,
            modTotalCompared: Object.keys(oldResults.moduleOutputs).length,
            newCalcCount: Object.keys(newResults.calculationResults).length,
            newModCount: Object.keys(newResults.moduleOutputs).length,
            oldCalcCount: Object.keys(oldResults.calculationResults).length,
            oldModCount: Object.keys(oldResults.moduleOutputs).length
        })
    } catch (error) {
        console.error('compare-migration error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
