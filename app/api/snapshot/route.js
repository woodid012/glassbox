import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { mergeState } from '@/utils/modelStateSplit'

function generateMarkdown(data) {
    const lines = []

    // Header
    lines.push('# Financial Model Snapshot')
    lines.push('')
    lines.push(`Generated: ${new Date().toISOString()}`)
    lines.push('')

    // Config
    lines.push('## Model Configuration')
    lines.push('')
    lines.push(`- **Timeline**: ${data.config.startMonth}/${data.config.startYear} to ${data.config.endMonth}/${data.config.endYear}`)
    lines.push(`- **Min Frequency**: ${data.config.minFrequency || 'monthly'}`)
    if (data.config.fyStartMonth) {
        lines.push(`- **FY Start Month**: ${data.config.fyStartMonth}`)
    }
    lines.push('')

    // Key Periods
    if (data.keyPeriods && data.keyPeriods.length > 0) {
        lines.push('## Key Periods')
        lines.push('')
        lines.push('| Name | Start | End | Periods |')
        lines.push('|------|-------|-----|---------|')
        for (const kp of data.keyPeriods) {
            lines.push(`| ${kp.name} | ${kp.startMonth}/${kp.startYear} | ${kp.endMonth}/${kp.endYear} | ${kp.periods} |`)
        }
        lines.push('')
    }

    // Input Groups and Inputs
    if (data.inputGlassGroups && data.inputGlassGroups.length > 0) {
        lines.push('## Inputs')
        lines.push('')

        for (const group of data.inputGlassGroups) {
            lines.push(`### ${group.name}`)
            lines.push('')
            lines.push(`- **Frequency**: ${group.frequency || 'M'}`)
            lines.push(`- **Entry Mode**: ${group.entryMode || 'values'}`)
            lines.push(`- **Range**: ${group.startMonth}/${group.startYear} to ${group.endMonth}/${group.endYear}`)
            lines.push('')

            // Get inputs for this group
            const groupInputs = (data.inputGlass || []).filter(i => i.groupId === group.id)

            if (groupInputs.length > 0) {
                lines.push('| Input ID | Name | Mode | Value/First 5 Values | Unit |')
                lines.push('|----------|------|------|---------------------|------|')

                for (const input of groupInputs) {
                    const inputId = input.inputId || `id_${input.id}`
                    const name = input.name || 'Unnamed'
                    const mode = input.mode || 'values'
                    const unit = input.unit || ''

                    let valueStr = ''
                    if (mode === 'constant' && input.value !== undefined) {
                        valueStr = String(input.value)
                    } else if (input.values && Object.keys(input.values).length > 0) {
                        // Get first 5 values
                        const sortedKeys = Object.keys(input.values).map(Number).sort((a, b) => a - b)
                        const first5 = sortedKeys.slice(0, 5).map(k => input.values[k])
                        valueStr = `[${first5.join(', ')}${sortedKeys.length > 5 ? ', ...' : ''}]`
                    } else if (input.value !== undefined) {
                        valueStr = String(input.value)
                    }

                    lines.push(`| ${inputId} | ${name} | ${mode} | ${valueStr} | ${unit} |`)
                }
                lines.push('')
            }
        }
    }

    // Calculations
    if (data.calculations && data.calculations.length > 0) {
        lines.push('## Calculations')
        lines.push('')
        lines.push('| Name | Formula | Description |')
        lines.push('|------|---------|-------------|')

        for (const calc of data.calculations) {
            const name = calc.name || 'Unnamed'
            const formula = calc.formula || ''
            const desc = calc.description || ''
            lines.push(`| ${name} | \`${formula}\` | ${desc} |`)
        }
        lines.push('')
    }

    // Formula Reference
    lines.push('## Formula Reference')
    lines.push('')
    lines.push('The formula syntax uses these prefixes:')
    lines.push('- `V{groupId}.{inputIndex}` - Reference input value (e.g., V1.1 = Group 1, Input 1)')
    lines.push('- `V{groupId}` - Sum of all inputs in group')
    lines.push('- `C{groupId}.{inputIndex}` - Constant value')
    lines.push('- `L{groupId}.{inputIndex}` - Lookup value')
    lines.push('- `S{groupId}` - Series sum')
    lines.push('- `F{keyPeriodId}` - Flag for key period (1 during period, 0 otherwise)')
    lines.push('- `I{indexId}` - Indexation factor')
    lines.push('- `R{calcId}` - Reference another calculation result')
    lines.push('- `T.HiY` - Hours in year, `T.MiY` - Minutes in year, `T.DiM` - Days in month')
    lines.push('')

    // Instructions for LLM
    lines.push('---')
    lines.push('')
    lines.push('## Instructions for Building Calculations')
    lines.push('')
    lines.push('Use the inputs and key periods defined above to build financial model calculations.')
    lines.push('When creating formulas:')
    lines.push('1. Reference inputs using the V/C/L prefix with group and input index')
    lines.push('2. Use F{id} flags to limit calculations to specific time periods')
    lines.push('3. Use I{id} for inflation/indexation adjustments')
    lines.push('4. Reference other calculations with R{id}')
    lines.push('')

    return lines.join('\n')
}

export async function POST() {
    try {
        const dataDir = path.join(process.cwd(), 'data')

        // File paths for split files
        const inputsFile = path.join(dataDir, 'model-inputs.json')
        const calculationsFile = path.join(dataDir, 'model-calculations.json')
        const modulesFile = path.join(dataDir, 'model-modules.json')
        const uiStateFile = path.join(dataDir, 'model-ui-state.json')
        const legacyAutosaveFile = path.join(dataDir, 'glass-inputs-autosave.json')

        // Create timestamp: YYYY-MM-DD_HHmmss
        const now = new Date()
        const timestamp = now.toISOString().slice(0, 10) + '_' +
            now.toTimeString().slice(0, 8).replace(/:/g, '')

        // Check if split files exist
        const splitFilesExist = fs.existsSync(inputsFile) &&
            fs.existsSync(calculationsFile) &&
            fs.existsSync(uiStateFile)

        let jsonData

        if (splitFilesExist) {
            // Load from split files and merge
            const inputs = JSON.parse(fs.readFileSync(inputsFile, 'utf8'))
            const calculations = JSON.parse(fs.readFileSync(calculationsFile, 'utf8'))
            const modulesData = fs.existsSync(modulesFile)
                ? JSON.parse(fs.readFileSync(modulesFile, 'utf8'))
                : {}
            const uiState = JSON.parse(fs.readFileSync(uiStateFile, 'utf8'))
            jsonData = mergeState(inputs, calculations, modulesData, uiState)

            // Create snapshot files
            const inputsSnapshot = `${timestamp}_inputs.json`
            const calculationsSnapshot = `${timestamp}_calculations.json`
            const modulesSnapshot = `${timestamp}_modules.json`
            const uiStateSnapshot = `${timestamp}_ui-state.json`

            fs.copyFileSync(inputsFile, path.join(dataDir, inputsSnapshot))
            fs.copyFileSync(calculationsFile, path.join(dataDir, calculationsSnapshot))
            if (fs.existsSync(modulesFile)) {
                fs.copyFileSync(modulesFile, path.join(dataDir, modulesSnapshot))
            }
            fs.copyFileSync(uiStateFile, path.join(dataDir, uiStateSnapshot))

            // Also create merged snapshot for markdown generation
            const snapshotFilename = `${timestamp}_snapshot.json`
            fs.writeFileSync(path.join(dataDir, snapshotFilename), JSON.stringify(jsonData, null, 2), 'utf8')

            // Generate and save markdown
            const mdFilename = `${timestamp}_snapshot.md`
            const markdown = generateMarkdown(jsonData)
            fs.writeFileSync(path.join(dataDir, mdFilename), markdown, 'utf8')

            return NextResponse.json({
                success: true,
                files: {
                    inputs: inputsSnapshot,
                    calculations: calculationsSnapshot,
                    modules: modulesSnapshot,
                    uiState: uiStateSnapshot,
                    merged: snapshotFilename,
                    markdown: mdFilename
                },
                message: `Snapshot saved: ${inputsSnapshot}, ${calculationsSnapshot}, ${modulesSnapshot}, ${uiStateSnapshot}, ${mdFilename}`
            })
        } else if (fs.existsSync(legacyAutosaveFile)) {
            // Fallback to legacy autosave
            jsonData = JSON.parse(fs.readFileSync(legacyAutosaveFile, 'utf8'))

            const snapshotFilename = `${timestamp}_snapshot.json`
            const snapshotFile = path.join(dataDir, snapshotFilename)
            fs.copyFileSync(legacyAutosaveFile, snapshotFile)

            const mdFilename = `${timestamp}_snapshot.md`
            const markdown = generateMarkdown(jsonData)
            fs.writeFileSync(path.join(dataDir, mdFilename), markdown, 'utf8')

            return NextResponse.json({
                success: true,
                filename: snapshotFilename,
                mdFilename: mdFilename,
                message: `Snapshot saved: ${snapshotFilename} and ${mdFilename}`
            })
        } else {
            return NextResponse.json({ error: 'No model data found' }, { status: 404 })
        }
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
