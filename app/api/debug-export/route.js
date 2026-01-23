import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { compactifyDebugData } from '@/utils/compactJson'

export async function POST(request) {
    try {
        const debugData = await request.json()
        const url = new URL(request.url)
        const compact = url.searchParams.get('compact') !== 'false'  // default to compact

        // Generate timestamp for filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const suffix = compact ? '-compact' : ''
        const filename = `debug-${timestamp}${suffix}.json`
        const filePath = path.join(process.cwd(), 'data', filename)

        // Optionally compactify the data
        const dataToSave = compact ? compactifyDebugData(debugData) : debugData

        // Save debug data (no pretty-print for compact mode)
        const jsonString = compact
            ? JSON.stringify(dataToSave)
            : JSON.stringify(dataToSave, null, 2)

        await fs.writeFile(filePath, jsonString)

        // Get file size for feedback
        const stats = await fs.stat(filePath)
        const sizeKB = Math.round(stats.size / 1024)

        return NextResponse.json({
            success: true,
            filename,
            path: filePath,
            sizeKB,
            compact
        })
    } catch (error) {
        console.error('Error saving debug data:', error)
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        )
    }
}
