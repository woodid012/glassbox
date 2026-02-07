import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const SCRAPER_DIR = process.env.EXCEL_SCRAPER_DIR || 'C:/Projects/excel_scraper'
const RECIPES_DIR = path.join(SCRAPER_DIR, 'recipes')

/**
 * GET: List available extraction and write recipes from the scraper's recipes/ directory.
 */
export async function GET() {
    try {
        const recipes = []

        // Scan extraction recipes (top-level JSON files)
        try {
            const files = await fs.readdir(RECIPES_DIR)
            for (const file of files) {
                if (!file.endsWith('.json')) continue
                const filePath = path.join(RECIPES_DIR, file)
                try {
                    const content = await fs.readFile(filePath, 'utf-8')
                    const data = JSON.parse(content)
                    recipes.push({
                        type: 'extraction',
                        fingerprint: file.replace('.json', ''),
                        fileName: file,
                        name: data.name || data.model_name || file,
                        sheets: data.sheets ? Object.keys(data.sheets).length : 0,
                        path: filePath
                    })
                } catch {
                    // Skip unparseable files
                }
            }
        } catch {
            // recipes dir may not exist
        }

        // Scan write recipes
        const writeDir = path.join(RECIPES_DIR, 'write')
        try {
            const files = await fs.readdir(writeDir)
            for (const file of files) {
                if (!file.endsWith('.json')) continue
                const filePath = path.join(writeDir, file)
                try {
                    const content = await fs.readFile(filePath, 'utf-8')
                    const data = JSON.parse(content)
                    recipes.push({
                        type: 'write',
                        fingerprint: file.replace('_write.json', ''),
                        fileName: file,
                        name: data.name || data.model_name || file,
                        mappings: data.mappings ? Object.keys(data.mappings).length : 0,
                        path: filePath
                    })
                } catch {
                    // Skip unparseable files
                }
            }
        } catch {
            // write dir may not exist
        }

        return NextResponse.json({ recipes, scraperDir: SCRAPER_DIR })
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
