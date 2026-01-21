import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

// Default template path - looks for full_inputs.json in common locations
const TEMPLATE_PATHS = [
    path.join(process.cwd(), 'data', 'template.json'),
    path.join(process.cwd(), '..', 'excel-model-builder', 'output', 'full_inputs.json'),
    path.join(process.cwd(), 'public', 'templates', 'full_inputs.json')
]

// GET - Load template data
export async function GET() {
    // Try each path until we find the template
    for (const templatePath of TEMPLATE_PATHS) {
        try {
            const data = await fs.readFile(templatePath, 'utf-8')
            return NextResponse.json(JSON.parse(data))
        } catch (error) {
            // Continue to next path
            continue
        }
    }

    // No template found
    return new NextResponse(JSON.stringify({
        error: 'No template file found',
        searchedPaths: TEMPLATE_PATHS
    }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
    })
}
