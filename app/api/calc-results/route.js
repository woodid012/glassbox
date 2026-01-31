// Temporary API to dump calculation results for comparison
import { NextResponse } from 'next/server'
import path from 'path'
import { runServerModel } from '@/utils/serverModelEngine'
import { loadModelData } from '@/utils/loadModelData'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const dataDir = path.join(process.cwd(), 'data')
        const { inputs, calculations: calcs } = await loadModelData(dataDir)

        const results = runServerModel(inputs, calcs)

        // Return sums for each calculation
        const sums = {}
        for (const [ref, values] of Object.entries(results.calculationResults)) {
            const arr = Array.isArray(values) ? values : []
            const sum = arr.reduce((a, b) => a + (b || 0), 0)
            const nonZero = arr.filter(v => Math.abs(v || 0) > 0.0001).length
            sums[ref] = { sum: Math.round(sum * 10000) / 10000, nonZero, periods: arr.length }
        }

        // Also return full arrays for key calcs
        const keyRefs = [
            'R4','R7','R8','R9','R10','R13','R14','R15','R16','R17','R18','R19',
            'R20','R22','R23','R29','R31','R32','R35','R40','R41','R42',
            'R70','R71','R72','R73','R74','R80','R81','R82','R84',
            'R133','R134','R138','R143','R151','R154','R155','R174','R178',
            'R182','R183','R186','R187','R188','R189','R190','R191','R192','R193','R194','R195',
            'R196','R199','R200','R201','R203','R230','R231',
            'R9110','R9113','R9115','R9120','R9123','R9125'
        ]
        const arrays = {}
        for (const ref of keyRefs) {
            if (results.calculationResults[ref]) {
                arrays[ref] = results.calculationResults[ref]
            }
        }

        return NextResponse.json({
            timeline: {
                startYear: results.timeline.startYear,
                startMonth: results.timeline.startMonth,
                periods: results.timeline.periods
            },
            sums,
            arrays
        })
    } catch (err) {
        return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 })
    }
}
