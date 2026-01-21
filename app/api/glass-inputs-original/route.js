import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

// File path for original template state (read-only)
const ORIGINAL_FILE = path.join(process.cwd(), 'data', 'glass-inputs-state.json')

// GET - Load original template state (read-only)
export async function GET() {
    try {
        const data = await fs.readFile(ORIGINAL_FILE, 'utf-8')
        return NextResponse.json(JSON.parse(data))
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist - return 404
            return new NextResponse(null, { status: 404 })
        }
        console.error('Error reading original state file:', error)
        return new NextResponse('Error reading original state', { status: 500 })
    }
}
