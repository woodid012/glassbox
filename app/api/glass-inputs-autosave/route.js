import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

// File path for storing autosave state
const AUTOSAVE_FILE = path.join(process.cwd(), 'data', 'glass-inputs-autosave.json')

// Ensure data directory exists
async function ensureDataDir() {
    const dataDir = path.join(process.cwd(), 'data')
    try {
        await fs.access(dataDir)
    } catch {
        await fs.mkdir(dataDir, { recursive: true })
    }
}

// GET - Load autosaved state
export async function GET() {
    try {
        await ensureDataDir()
        const data = await fs.readFile(AUTOSAVE_FILE, 'utf-8')
        const parsed = JSON.parse(data)
        return NextResponse.json(parsed)
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist - return 404
            return new NextResponse(null, { status: 404 })
        }
        if (error instanceof SyntaxError) {
            // JSON is corrupted - delete the file and return 404
            console.error('Autosave file corrupted, deleting:', error.message)
            try {
                await fs.unlink(AUTOSAVE_FILE)
            } catch {}
            return new NextResponse(null, { status: 404 })
        }
        console.error('Error reading autosave file:', error)
        return new NextResponse('Error reading autosave', { status: 500 })
    }
}

// POST - Save state (autosave)
export async function POST(request) {
    try {
        await ensureDataDir()
        const data = await request.json()
        await fs.writeFile(AUTOSAVE_FILE, JSON.stringify(data, null, 2), 'utf-8')
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error writing autosave file:', error)
        return new NextResponse('Error saving autosave', { status: 500 })
    }
}

// DELETE - Clear autosaved state
export async function DELETE() {
    try {
        await fs.unlink(AUTOSAVE_FILE)
        return NextResponse.json({ success: true })
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist - that's fine
            return NextResponse.json({ success: true })
        }
        console.error('Error deleting autosave file:', error)
        return new NextResponse('Error deleting autosave', { status: 500 })
    }
}
