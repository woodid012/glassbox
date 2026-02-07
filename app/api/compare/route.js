import { NextResponse } from 'next/server'
import path from 'path'
import { runServerModel } from '@/utils/serverModelEngine'
import { loadModelData } from '@/utils/loadModelData'

export const dynamic = 'force-dynamic'

/**
 * POST: Compare Glassbox engine results against an extraction JSON.
 *
 * Body (JSON):
 *   - extraction: Object with calculation refs as keys and arrays as values
 *   - mappings: (optional) Object mapping extraction keys to Glassbox refs
 *   - tolerance: (optional) Numeric tolerance for matching (default 0.01)
 */
export async function POST(request) {
    try {
        const body = await request.json()
        const { extraction, mappings, tolerance: tol } = body

        if (!extraction) {
            return NextResponse.json({ error: 'No extraction data provided' }, { status: 400 })
        }

        const tolerance = tol || 0.01

        // Run Glassbox engine
        const dataDir = path.join(process.cwd(), 'data')
        const { inputs, calculations: calcs } = await loadModelData(dataDir)
        const engineResults = runServerModel(inputs, calcs)
        const calcResults = engineResults.calculationResults

        // Compare each extraction ref against engine results
        const comparisons = []
        let totalMatched = 0
        let totalMismatched = 0
        let totalMissing = 0

        for (const [exRef, exValues] of Object.entries(extraction)) {
            // Determine the Glassbox ref to compare against
            const gbRef = mappings?.[exRef] || exRef

            const gbValues = calcResults[gbRef]
            if (!gbValues) {
                comparisons.push({
                    ref: exRef,
                    gbRef,
                    status: 'missing',
                    message: `${gbRef} not found in engine results`
                })
                totalMissing++
                continue
            }

            if (!Array.isArray(exValues)) {
                comparisons.push({
                    ref: exRef,
                    gbRef,
                    status: 'skipped',
                    message: 'Extraction value is not an array'
                })
                continue
            }

            // Compare period by period
            const periods = Math.min(exValues.length, gbValues.length)
            let maxVariance = 0
            let maxVariancePeriod = -1
            let matchingPeriods = 0
            let totalVariance = 0

            for (let i = 0; i < periods; i++) {
                const exVal = exValues[i] || 0
                const gbVal = gbValues[i] || 0
                const variance = Math.abs(exVal - gbVal)
                totalVariance += variance

                if (variance <= tolerance) {
                    matchingPeriods++
                } else if (variance > maxVariance) {
                    maxVariance = variance
                    maxVariancePeriod = i
                }
            }

            const matchPct = periods > 0 ? (matchingPeriods / periods * 100) : 100
            const status = matchPct >= 99 ? 'match' : matchPct >= 90 ? 'close' : 'mismatch'

            if (status === 'match') totalMatched++
            else totalMismatched++

            comparisons.push({
                ref: exRef,
                gbRef,
                status,
                matchPct: Math.round(matchPct * 10) / 10,
                periods,
                matchingPeriods,
                maxVariance: Math.round(maxVariance * 10000) / 10000,
                maxVariancePeriod,
                avgVariance: periods > 0 ? Math.round(totalVariance / periods * 10000) / 10000 : 0
            })
        }

        return NextResponse.json({
            summary: {
                total: comparisons.length,
                matched: totalMatched,
                mismatched: totalMismatched,
                missing: totalMissing,
                tolerance
            },
            comparisons: comparisons.sort((a, b) => {
                // Sort: mismatches first, then close, then matches
                const order = { mismatch: 0, close: 1, missing: 2, match: 3, skipped: 4 }
                return (order[a.status] || 5) - (order[b.status] || 5)
            })
        })
    } catch (err) {
        console.error('compare error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
