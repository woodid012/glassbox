import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { splitState } from '@/utils/modelStateSplit'

const DATA_DIR = path.join(process.cwd(), 'data')
const LEGACY_FILE = path.join(DATA_DIR, 'glass-inputs-autosave.json')
const INPUTS_FILE = path.join(DATA_DIR, 'model-inputs.json')
const CALCULATIONS_FILE = path.join(DATA_DIR, 'model-calculations.json')
const UI_STATE_FILE = path.join(DATA_DIR, 'model-ui-state.json')

/**
 * POST - Migrate from legacy glass-inputs-autosave.json to 3 split files
 * This is a one-time migration endpoint
 */
export async function POST() {
    try {
        // Check if legacy file exists
        try {
            await fs.access(LEGACY_FILE)
        } catch {
            return NextResponse.json({
                success: false,
                error: 'Legacy autosave file not found'
            }, { status: 404 })
        }

        // Check if split files already exist
        const splitFilesExist = await Promise.all([
            fs.access(INPUTS_FILE).then(() => true).catch(() => false),
            fs.access(CALCULATIONS_FILE).then(() => true).catch(() => false),
            fs.access(UI_STATE_FILE).then(() => true).catch(() => false)
        ])

        if (splitFilesExist.every(Boolean)) {
            return NextResponse.json({
                success: false,
                error: 'Split files already exist. Delete them first if you want to re-migrate.'
            }, { status: 400 })
        }

        // Read legacy file
        const legacyData = await fs.readFile(LEGACY_FILE, 'utf-8')
        const state = JSON.parse(legacyData)

        // Split the state
        const { inputs, calculations, uiState } = splitState(state)

        // Write all 3 files
        await Promise.all([
            fs.writeFile(INPUTS_FILE, JSON.stringify(inputs, null, 2), 'utf-8'),
            fs.writeFile(CALCULATIONS_FILE, JSON.stringify(calculations, null, 2), 'utf-8'),
            fs.writeFile(UI_STATE_FILE, JSON.stringify(uiState, null, 2), 'utf-8')
        ])

        // Get file sizes for reporting
        const [inputsStats, calculationsStats, uiStateStats] = await Promise.all([
            fs.stat(INPUTS_FILE),
            fs.stat(CALCULATIONS_FILE),
            fs.stat(UI_STATE_FILE)
        ])

        return NextResponse.json({
            success: true,
            message: 'Migration completed successfully',
            files: {
                'model-inputs.json': `${(inputsStats.size / 1024).toFixed(1)} KB`,
                'model-calculations.json': `${(calculationsStats.size / 1024).toFixed(1)} KB`,
                'model-ui-state.json': `${(uiStateStats.size / 1024).toFixed(1)} KB`
            },
            inputKeys: Object.keys(inputs),
            calculationKeys: Object.keys(calculations),
            uiStateKeys: Object.keys(uiState)
        })
    } catch (error) {
        console.error('Migration error:', error)
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 })
    }
}

/**
 * GET - Check migration status
 */
export async function GET() {
    try {
        const [legacyExists, inputsExists, calculationsExists, uiStateExists] = await Promise.all([
            fs.access(LEGACY_FILE).then(() => true).catch(() => false),
            fs.access(INPUTS_FILE).then(() => true).catch(() => false),
            fs.access(CALCULATIONS_FILE).then(() => true).catch(() => false),
            fs.access(UI_STATE_FILE).then(() => true).catch(() => false)
        ])

        const splitComplete = inputsExists && calculationsExists && uiStateExists

        return NextResponse.json({
            legacyFileExists: legacyExists,
            splitFilesExist: {
                inputs: inputsExists,
                calculations: calculationsExists,
                uiState: uiStateExists
            },
            migrationStatus: splitComplete ? 'completed' : (legacyExists ? 'pending' : 'no-data')
        })
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
