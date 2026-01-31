import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { runServerModel } from '../utils/serverModelEngine.js'

function mergeModules(calcData, dataDir) {
    try {
        const modulesData = JSON.parse(readFileSync(join(dataDir, 'model-modules.json'), 'utf-8'))
        if (modulesData.moduleGroups?.length) {
            calcData.calculationsGroups = [...(calcData.calculationsGroups || []), ...modulesData.moduleGroups]
        }
        if (modulesData.moduleCalculations?.length) {
            calcData.calculations = [...(calcData.calculations || []), ...modulesData.moduleCalculations]
        }
        if (modulesData.modules !== undefined) calcData.modules = modulesData.modules
        if (modulesData._mRefMap !== undefined) calcData._mRefMap = modulesData._mRefMap
    } catch { /* ignore */ }
    return calcData
}

describe('Construction CF', () => {
    it('net CF should be ~zero during construction', () => {
        const dataDir = join(process.cwd(), 'data')
        let calcData = JSON.parse(readFileSync(join(dataDir, 'model-calculations.json'), 'utf-8'))
        const inputs = JSON.parse(readFileSync(join(dataDir, 'model-inputs.json'), 'utf-8'))
        calcData = mergeModules(calcData, dataDir)
        const { calculationResults: r, timeline } = runServerModel(inputs, calcData)

        const dateOf = (i) => {
            const m = (timeline.startMonth - 1 + i) % 12
            const y = timeline.startYear + Math.floor((timeline.startMonth - 1 + i) / 12)
            return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m]} ${y}`
        }

        console.log('=== CONSTRUCTION CF (periods 0-18) ===')
        console.log('Period | Date     | R40(Net) | R42(Cash)')
        for (let i = 0; i <= 18; i++) {
            const r40v = r['R40']?.[i] || 0
            const r42v = r['R42']?.[i] || 0
            const marker = Math.abs(r40v) > 0.01 ? ' <-- NON-ZERO' : ''
            console.log(`  [${String(i).padStart(2)}] ${dateOf(i).padEnd(8)} | ${r40v.toFixed(4).padStart(8)} | ${r42v.toFixed(4).padStart(9)}${marker}`)
        }

        // Check construction cash is near zero
        const maxConstrCash = Math.max(...(r['R42'] || []).slice(0, 18).map(v => Math.abs(v)))
        console.log(`Max construction cash balance: ${maxConstrCash.toFixed(4)}`)

        // If BS fails, find worst period
        const r195arr = r['R195'] || []
        const maxDiff = Math.max(...r195arr.map(v => Math.abs(v)))
        console.log(`\nBS Check (R195) max diff: ${maxDiff}`)
        let worstIdx = 0, worstVal = 0
        for (let i = 0; i < r195arr.length; i++) {
            if (Math.abs(r195arr[i]) > Math.abs(worstVal)) { worstVal = r195arr[i]; worstIdx = i }
        }
        if (Math.abs(worstVal) > 0.01) {
            const i = worstIdx
            console.log(`\nBS imbalance at period ${i} (${dateOf(i)}): ${worstVal.toFixed(6)}`)
            console.log(`  R187(Assets): ${r['R187']?.[i]?.toFixed(4)}`)
            console.log(`  R194(L+E):    ${r['R194']?.[i]?.toFixed(4)}`)
            console.log(`  Assets: R182=${r['R182']?.[i]?.toFixed(4)}, R196=${r['R196']?.[i]?.toFixed(4)}, R183=${r['R183']?.[i]?.toFixed(4)}, R184=${r['R184']?.[i]?.toFixed(4)}, R230=${r['R230']?.[i]?.toFixed(4)}, R231=${r['R231']?.[i]?.toFixed(4)}`)
            console.log(`  Liab: R190=${r['R190']?.[i]?.toFixed(4)}, Eq: R193=${r['R193']?.[i]?.toFixed(4)}`)
            console.log(`  R191(SC)=${r['R191']?.[i]?.toFixed(4)}, R192(RE)=${r['R192']?.[i]?.toFixed(4)}`)
            console.log(`  R198(ConstrDebt)=${r['R198']?.[i]?.toFixed(4)}, R188(OpsDebt)=${r['R188']?.[i]?.toFixed(4)}`)
            // Check first period with imbalance
            let firstBad = r195arr.findIndex(v => Math.abs(v) > 0.005)
            if (firstBad >= 0) {
                console.log(`  First imbalance at period ${firstBad} (${dateOf(firstBad)}): ${r195arr[firstBad].toFixed(6)}`)
            }
        }

        // Check R61 vs R9011
        console.log(`\nR61[17]=${r['R61']?.[17]?.toFixed(6)}, R9011[17]=${r['R9011']?.[17]?.toFixed(6)}`)
        console.log(`R61[0]=${r['R61']?.[0]?.toFixed(6)}, R9011[0]=${r['R9011']?.[0]?.toFixed(6)}`)
        console.log(`Diff at 17: ${((r['R61']?.[17]||0)-(r['R9011']?.[17]||0)).toFixed(6)}`)
        console.log(`R9023[17]=${r['R9023']?.[17]?.toFixed(6)}`)
        console.log(`R9024 sum constr: ${r['R9024']?.slice(0,18).reduce((a,b)=>a+b,0).toFixed(6)}`)
        console.log(`R9020 (debt draw) total: ${r['R9020']?.slice(0,18).reduce((a,b)=>a+b,0).toFixed(6)}`)
        console.log(`R9021 (eq draw) total: ${r['R9021']?.slice(0,18).reduce((a,b)=>a+b,0).toFixed(6)}`)
        console.log(`R35 (eq inject) total: ${r['R35']?.slice(0,18).reduce((a,b)=>a+b,0).toFixed(6)}`)

        // What does R230 (IDC fees BS) look like at transition?
        console.log(`\nR230[17]=${r['R230']?.[17]?.toFixed(6)}, R230[18]=${r['R230']?.[18]?.toFixed(6)}`)

        // Period 18: show the key numbers
        console.log(`\nPeriod 18 (first ops):`)
        console.log(`  R42(cash)=${r['R42']?.[18]?.toFixed(6)}`)
        console.log(`  R196(WIP)=${r['R196']?.[18]?.toFixed(6)}`)
        console.log(`  R191(SC)=${r['R191']?.[18]?.toFixed(6)}`)
        console.log(`  R198(CDebt)=${r['R198']?.[18]?.toFixed(6)}`)

        // BS at end of construction
        console.log(`\nR195[17]=${r195arr[17]?.toFixed(8)}`)
        console.log(`R195[18]=${r195arr[18]?.toFixed(8)}`)

        // Show the GST asset on BS
        console.log(`\nGST on BS:`)
        // R230 = IDC+Comm fees, not GST. What's the GST receivable on BS?
        // R184 = Trade Receivables = R95 = R176 + R177 (tolling + merchant)
        // Where is GST receivable on the BS? Is it in Total Assets?
        // Check R187 formula components
        console.log(`R9011[17]=${r['R9011']?.[17]?.toFixed(6)} (GST receivable)`)
        console.log(`R9011[18]=${r['R9011']?.[18]?.toFixed(6)}`)
        // Is R9011 on the BS at all?

        expect(maxDiff).toBeLessThan(0.01)
    })
})
