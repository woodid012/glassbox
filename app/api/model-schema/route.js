import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { buildModelSchema } from '@/utils/modelSchemaBuilder'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const dataDir = path.join(process.cwd(), 'data')
        const schema = await buildModelSchema(dataDir)

        // Cache to data/model-schema.json for direct AI file access
        const cachePath = path.join(dataDir, 'model-schema.json')
        const tmpPath = cachePath + '.tmp.' + Date.now()
        try {
            await fs.writeFile(tmpPath, JSON.stringify(schema, null, 2), 'utf-8')
            await fs.rename(tmpPath, cachePath)
        } catch (writeErr) {
            try { await fs.unlink(tmpPath) } catch { /* ignore */ }
            throw writeErr
        }

        return NextResponse.json(schema)
    } catch (err) {
        console.error('model-schema error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
