import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import os from 'os'

export const dynamic = 'force-dynamic'

const SCRAPER_DIR = process.env.EXCEL_SCRAPER_DIR || 'C:/Projects/excel_scraper'

/**
 * Run a Python script and capture output.
 */
function runPython(args, cwd) {
    return new Promise((resolve, reject) => {
        const proc = spawn('python', args, { cwd })
        let stdout = ''
        let stderr = ''
        proc.stdout.on('data', d => { stdout += d.toString() })
        proc.stderr.on('data', d => { stderr += d.toString() })
        proc.on('close', code => {
            if (code !== 0) {
                reject(new Error(`Python exited with code ${code}: ${stderr}`))
            } else {
                resolve({ stdout, stderr })
            }
        })
        proc.on('error', reject)
    })
}

/**
 * POST: Upload an Excel file and run the AI extractor pipeline.
 *
 * Body (multipart/form-data):
 *   - file: the Excel file (.xlsx, .xlsb, .xlsm)
 *   - recipe: (optional) recipe fingerprint to use for matching
 *   - mode: 'pipeline' | 'import' (default: 'pipeline')
 *
 * Pipeline mode (--pipeline):
 *   Scrapes Excel -> matches against Glassbox inputs -> writes model-inputs-updated.json
 *   Outputs: match-report.json, model-inputs-updated.json
 *
 * Import mode (--import --recipe-from <fingerprint>):
 *   Reuses an existing recipe to extract from a new Excel file
 *   Outputs: import-report.json, model-inputs-imported.json
 *
 * In both cases: only INPUT VALUES change. Calculations/formulas are never touched.
 */
export async function POST(request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file')
        const recipe = formData.get('recipe') || ''
        const mode = formData.get('mode') || 'pipeline'

        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
        }

        // Save uploaded file to temp directory
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glassbox-import-'))
        const fileName = file.name || 'upload.xlsx'
        const filePath = path.join(tmpDir, fileName)
        const buffer = Buffer.from(await file.arrayBuffer())
        await fs.writeFile(filePath, buffer)

        // Build Python command args matching actual ai_extractor.py interface
        const args = ['ai_extractor.py', filePath, '--output', tmpDir]

        if (mode === 'import' && recipe) {
            // --import reuses a recipe to extract from a new Excel file
            args.push('--import', '--recipe-from', recipe)
        } else {
            // --pipeline: full scrape -> match -> write
            args.push('--pipeline')
        }

        // Point at current Glassbox inputs as the template
        const inputsTemplate = path.join(process.cwd(), 'data', 'model-inputs.json')
        args.push('--inputs-template', inputsTemplate)

        // Run the extractor
        const { stdout, stderr } = await runPython(args, SCRAPER_DIR)

        // Read output files - names differ by mode
        const result = { stdout, stderr, mode, files: {} }

        const possibleOutputs = [
            // Pipeline mode outputs
            'match-report.json',
            'model-inputs-updated.json',
            // Import mode outputs
            'import-report.json',
            'model-inputs-imported.json',
            // Extraction outputs
            'ai-extract-full.json',
            'ai-extract-compact.json',
            'match-report.html'
        ]

        for (const outputFile of possibleOutputs) {
            const filePath = path.join(tmpDir, outputFile)
            try {
                if (outputFile.endsWith('.html')) {
                    // Just note that HTML exists, don't return full content
                    await fs.access(filePath)
                    result.files[outputFile] = '(HTML report available)'
                } else {
                    const content = await fs.readFile(filePath, 'utf-8')
                    result.files[outputFile] = JSON.parse(content)
                }
            } catch {
                // File may not exist for this mode
            }
        }

        // Determine which updated inputs file was produced
        const updatedInputsKey = result.files['model-inputs-updated.json']
            ? 'model-inputs-updated.json'
            : result.files['model-inputs-imported.json']
                ? 'model-inputs-imported.json'
                : null

        result.updatedInputsKey = updatedInputsKey
        result.hasUpdatedInputs = !!updatedInputsKey

        // Clean up uploaded file (keep output dir for now)
        try { await fs.unlink(path.join(tmpDir, fileName)) } catch { /* ignore */ }

        return NextResponse.json(result)
    } catch (err) {
        return NextResponse.json(
            { error: err.message },
            { status: 500 }
        )
    }
}

/**
 * PUT: Apply import results - write updated model-inputs.json to data/
 *
 * Only writes input VALUES. Calculations and modules are never touched.
 * Creates a backup of the current model-inputs.json first.
 *
 * Body (JSON):
 *   - inputs: the updated model-inputs object to write
 */
export async function PUT(request) {
    try {
        const body = await request.json()
        const { inputs } = body

        if (!inputs) {
            return NextResponse.json({ error: 'No inputs provided' }, { status: 400 })
        }

        const dataDir = path.join(process.cwd(), 'data')
        const inputsPath = path.join(dataDir, 'model-inputs.json')

        // Backup current file before overwriting
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const backupPath = path.join(dataDir, `model-inputs.${timestamp}.backup.json`)
        try {
            await fs.copyFile(inputsPath, backupPath)
        } catch { /* may not exist */ }

        // Write updated inputs atomically (temp file + rename)
        const tmpFile = inputsPath + '.tmp.' + Date.now()
        try {
            await fs.writeFile(tmpFile, JSON.stringify(inputs, null, 2), 'utf-8')
            await fs.rename(tmpFile, inputsPath)
        } catch (writeErr) {
            try { await fs.unlink(tmpFile) } catch { /* ignore cleanup error */ }
            throw writeErr
        }

        return NextResponse.json({
            success: true,
            backup: backupPath,
            message: 'Model inputs updated. Refresh the dashboard to see changes.'
        })
    } catch (err) {
        return NextResponse.json(
            { error: err.message },
            { status: 500 }
        )
    }
}
