import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { analyzeModelCompleteness, generateMarkdownReport } from '@/utils/modelReviewAnalysis'

const DATA_DIR = path.join(process.cwd(), 'data')
const BLUEPRINT_FILE = path.join(DATA_DIR, 'model-blueprint.json')
const CALCULATIONS_FILE = path.join(DATA_DIR, 'model-calculations.json')
const INPUTS_FILE = path.join(DATA_DIR, 'model-inputs.json')
const REPORT_FILE = path.join(DATA_DIR, 'model-review-report.md')

async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(data)
    } catch (error) {
        if (error.code === 'ENOENT') return null
        if (error instanceof SyntaxError) {
            console.error(`JSON corrupted in ${filePath}`)
            return null
        }
        throw error
    }
}

/**
 * GET — Run analysis and return JSON results
 */
export async function GET() {
    try {
        const [blueprint, calcData, inputData] = await Promise.all([
            readJsonFile(BLUEPRINT_FILE),
            readJsonFile(CALCULATIONS_FILE),
            readJsonFile(INPUTS_FILE)
        ])

        if (!blueprint) {
            return NextResponse.json(
                { error: 'Blueprint file not found' },
                { status: 404 }
            )
        }

        const calculations = calcData?.calculations || []
        const modules = calcData?.modules || []

        const analysis = analyzeModelCompleteness(
            blueprint,
            calculations,
            modules,
            inputData,
            null // No live calculation results from API — page uses live data
        )

        return NextResponse.json(analysis)
    } catch (error) {
        console.error('Model review analysis error:', error)
        return NextResponse.json(
            { error: 'Analysis failed', details: error.message },
            { status: 500 }
        )
    }
}

/**
 * POST — Generate markdown report and save to file
 */
export async function POST() {
    try {
        const [blueprint, calcData, inputData] = await Promise.all([
            readJsonFile(BLUEPRINT_FILE),
            readJsonFile(CALCULATIONS_FILE),
            readJsonFile(INPUTS_FILE)
        ])

        if (!blueprint) {
            return NextResponse.json(
                { error: 'Blueprint file not found' },
                { status: 404 }
            )
        }

        const calculations = calcData?.calculations || []
        const modules = calcData?.modules || []

        const analysis = analyzeModelCompleteness(
            blueprint,
            calculations,
            modules,
            inputData,
            null
        )

        const report = generateMarkdownReport(analysis)

        await fs.writeFile(REPORT_FILE, report, 'utf-8')

        return NextResponse.json({
            success: true,
            reportPath: 'data/model-review-report.md',
            analysis
        })
    } catch (error) {
        console.error('Report generation error:', error)
        return NextResponse.json(
            { error: 'Report generation failed', details: error.message },
            { status: 500 }
        )
    }
}
