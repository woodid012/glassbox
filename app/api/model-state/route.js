import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { splitState, mergeState, getDefaultInputs, getDefaultCalculations, getDefaultUiState } from '@/utils/modelStateSplit'

// File paths for the 4 split files (inputs, calculations, ui-state, results)
const DATA_DIR = path.join(process.cwd(), 'data')
const INPUTS_FILE = path.join(DATA_DIR, 'model-inputs.json')
const CALCULATIONS_FILE = path.join(DATA_DIR, 'model-calculations.json')
const UI_STATE_FILE = path.join(DATA_DIR, 'model-ui-state.json')
const RESULTS_FILE = path.join(DATA_DIR, 'model-results.json')

// Legacy autosave file for fallback
const LEGACY_AUTOSAVE_FILE = path.join(DATA_DIR, 'glass-inputs-autosave.json')

async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR)
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true })
    }
}

async function readJsonFile(filePath, defaultValue = null) {
    try {
        const data = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(data)
    } catch (error) {
        if (error.code === 'ENOENT') {
            return defaultValue
        }
        if (error instanceof SyntaxError) {
            console.error(`JSON corrupted in ${filePath}, using default`)
            return defaultValue
        }
        throw error
    }
}

async function writeJsonFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

// GET - Load state from 4 files (or fallback to legacy)
// Also loads cached calculation results for instant startup
export async function GET() {
    try {
        await ensureDataDir()

        // Try to load from split files first (including cached results)
        const [inputs, calculations, uiState, cachedResults] = await Promise.all([
            readJsonFile(INPUTS_FILE),
            readJsonFile(CALCULATIONS_FILE),
            readJsonFile(UI_STATE_FILE),
            readJsonFile(RESULTS_FILE)
        ])

        // If all 3 core files exist, merge and return
        if (inputs !== null && calculations !== null && uiState !== null) {
            const merged = mergeState(inputs, calculations, uiState)
            // Attach cached results if they exist (for instant startup)
            if (cachedResults !== null) {
                merged.cachedResults = cachedResults
            }
            return NextResponse.json(merged)
        }

        // Fallback: try legacy autosave file
        const legacyData = await readJsonFile(LEGACY_AUTOSAVE_FILE)
        if (legacyData !== null) {
            return NextResponse.json(legacyData)
        }

        // No data found
        return new NextResponse(null, { status: 404 })
    } catch (error) {
        console.error('Error loading model state:', error)
        return new NextResponse('Error loading model state', { status: 500 })
    }
}

// POST - Save state to 3 files
export async function POST(request) {
    try {
        await ensureDataDir()
        const data = await request.json()

        // Split the state
        const { inputs, calculations, uiState } = splitState(data)

        // Write all 3 files in parallel
        await Promise.all([
            writeJsonFile(INPUTS_FILE, inputs),
            writeJsonFile(CALCULATIONS_FILE, calculations),
            writeJsonFile(UI_STATE_FILE, uiState)
        ])

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error saving model state:', error)
        return new NextResponse('Error saving model state', { status: 500 })
    }
}

// PATCH - Save calculation results only (separate from main state)
// This allows fast saving of results after calculation without touching inputs/calcs
export async function PATCH(request) {
    try {
        await ensureDataDir()
        const data = await request.json()

        // Expect { calculationResults, moduleOutputs } format
        await writeJsonFile(RESULTS_FILE, data)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error saving calculation results:', error)
        return new NextResponse('Error saving calculation results', { status: 500 })
    }
}

// DELETE - Clear all state files
export async function DELETE() {
    try {
        const deleteFile = async (filePath) => {
            try {
                await fs.unlink(filePath)
            } catch (error) {
                if (error.code !== 'ENOENT') throw error
            }
        }

        await Promise.all([
            deleteFile(INPUTS_FILE),
            deleteFile(CALCULATIONS_FILE),
            deleteFile(UI_STATE_FILE),
            deleteFile(RESULTS_FILE)
        ])

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting model state:', error)
        return new NextResponse('Error deleting model state', { status: 500 })
    }
}
