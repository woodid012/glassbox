import { describe, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { runServerModel } from '../utils/serverModelEngine.js'

function loadModelData() {
    const dataDir = join(process.cwd(), 'data')
    const calcData = JSON.parse(readFileSync(join(dataDir, 'model-calculations.json'), 'utf-8'))
    const inputs = JSON.parse(readFileSync(join(dataDir, 'model-inputs.json'), 'utf-8'))
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
    } catch { /* */ }
    return { calcData, inputs }
}

describe('Debt Repayment Profile', () => {
    it('should diagnose debt tenor', () => {
        const { calcData, inputs } = loadModelData()
        const results = runServerModel(inputs, calcData)
        const r = results.calculationResults
        const ref = results.referenceMap
        const tl = results.timeline

        const f8 = ref['F8'] || []
        const f8Active = f8.filter(v => v > 0).length
        console.log('F8 (Ops Debt) active periods:', f8Active, 'months =', (f8Active / 12).toFixed(1), 'years')

        const kp = inputs.keyPeriods?.find(k => k.id === 8)
        console.log('Key Period 8:', JSON.stringify(kp))

        const r70 = r['R70'] || []
        const firstDebt = r70.findIndex(v => v > 0)
        const lastDebt = r70.findLastIndex(v => v > 0.01)
        console.log('\nR70 (Debt Opening):')
        console.log('  First:', firstDebt, `(${tl.year[firstDebt]}-${tl.month[firstDebt]})`)
        console.log('  Last:', lastDebt, `(${tl.year[lastDebt]}-${tl.month[lastDebt]})`)
        console.log('  Duration:', lastDebt - firstDebt + 1, 'months =', ((lastDebt - firstDebt + 1) / 12).toFixed(1), 'years')

        const r71 = r['R71'] || []
        const firstRepay = r71.findIndex(v => v !== 0)
        const lastRepay = r71.findLastIndex(v => v !== 0)
        console.log('\nR71 (Principal Repayment):')
        console.log('  First:', firstRepay >= 0 ? `${firstRepay} (${tl.year[firstRepay]}-${tl.month[firstRepay]})` : 'none')
        console.log('  Last:', lastRepay >= 0 ? `${lastRepay} (${tl.year[lastRepay]}-${tl.month[lastRepay]})` : 'none')
        console.log('  Duration:', lastRepay - firstRepay + 1, 'months =', ((lastRepay - firstRepay + 1) / 12).toFixed(1), 'years')
        console.log('  Total:', r71.reduce((s, v) => s + (v || 0), 0).toFixed(2))

        const r118 = r['R118'] || []
        const activeDscr = r118.filter(v => v > 0)
        console.log('\nDSCR:')
        console.log('  Active periods:', activeDscr.length)
        if (activeDscr.length > 0) {
            console.log('  Min:', Math.min(...activeDscr).toFixed(4))
            console.log('  Max:', Math.max(...activeDscr).toFixed(4))
        }

        // Constants
        const constants = inputs.inputGlass?.filter(i => i.groupId === 100) || []
        const cVal = (id) => constants.find(c => c.id === id)?.value
        console.log('\nConstants:')
        console.log('  Max Gearing (C1.19):', cVal(118))
        console.log('  DSCR Target (C1.25):', cVal(124))
        console.log('  Debt Tenor Yrs:', cVal(125))

        console.log('\nDebt by year (Oct):')
        for (let y = 2028; y <= 2052; y++) {
            const idx = tl.year.findIndex((yr, i) => yr === y && tl.month[i] === 10)
            if (idx < 0) continue
            const debt = r70[idx] || 0
            const repay = r71[idx] || 0
            const dscr = r118[idx] || 0
            if (debt > 0.01 || (y >= 2028 && y <= 2050))
                console.log(`  ${y}: Debt=${debt.toFixed(2)}  Repay=${repay.toFixed(3)}  DSCR=${dscr.toFixed(3)}`)
        }
    })
})
