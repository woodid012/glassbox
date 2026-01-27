// Python Export API Route
// Generates a complete Python package as a ZIP file

import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { generateExportBundle, generateReferenceGuide } from '@/utils/exportSchema'
import { generatePythonPackage } from '@/utils/pythonGenerator'

// Mark as dynamic to prevent static generation issues
export const dynamic = 'force-dynamic'

// Simple ZIP file generation without external dependencies
// Creates a basic uncompressed ZIP archive
function createZipArchive(files) {
    // Build file entries
    const entries = []
    let centralDir = []
    let offset = 0

    for (const [filename, content] of Object.entries(files)) {
        const fileBuffer = Buffer.from(content, 'utf-8')
        const filenameBuffer = Buffer.from(filename, 'utf-8')

        // Local file header
        const localHeader = Buffer.alloc(30 + filenameBuffer.length)
        localHeader.writeUInt32LE(0x04034b50, 0)  // signature
        localHeader.writeUInt16LE(10, 4)          // version needed
        localHeader.writeUInt16LE(0, 6)           // flags
        localHeader.writeUInt16LE(0, 8)           // compression (none)
        localHeader.writeUInt16LE(0, 10)          // mod time
        localHeader.writeUInt16LE(0, 12)          // mod date
        localHeader.writeUInt32LE(crc32(fileBuffer), 14)  // crc32
        localHeader.writeUInt32LE(fileBuffer.length, 18)  // compressed size
        localHeader.writeUInt32LE(fileBuffer.length, 22)  // uncompressed size
        localHeader.writeUInt16LE(filenameBuffer.length, 26)  // filename length
        localHeader.writeUInt16LE(0, 28)          // extra field length
        filenameBuffer.copy(localHeader, 30)

        entries.push(localHeader)
        entries.push(fileBuffer)

        // Central directory entry
        const centralEntry = Buffer.alloc(46 + filenameBuffer.length)
        centralEntry.writeUInt32LE(0x02014b50, 0)  // signature
        centralEntry.writeUInt16LE(20, 4)          // version made by
        centralEntry.writeUInt16LE(10, 6)          // version needed
        centralEntry.writeUInt16LE(0, 8)           // flags
        centralEntry.writeUInt16LE(0, 10)          // compression
        centralEntry.writeUInt16LE(0, 12)          // mod time
        centralEntry.writeUInt16LE(0, 14)          // mod date
        centralEntry.writeUInt32LE(crc32(fileBuffer), 16)  // crc32
        centralEntry.writeUInt32LE(fileBuffer.length, 20)  // compressed size
        centralEntry.writeUInt32LE(fileBuffer.length, 24)  // uncompressed size
        centralEntry.writeUInt16LE(filenameBuffer.length, 28)  // filename length
        centralEntry.writeUInt16LE(0, 30)          // extra field length
        centralEntry.writeUInt16LE(0, 32)          // comment length
        centralEntry.writeUInt16LE(0, 34)          // disk number
        centralEntry.writeUInt16LE(0, 36)          // internal attr
        centralEntry.writeUInt32LE(0, 38)          // external attr
        centralEntry.writeUInt32LE(offset, 42)     // local header offset
        filenameBuffer.copy(centralEntry, 46)

        centralDir.push(centralEntry)
        offset += localHeader.length + fileBuffer.length
    }

    // End of central directory
    const centralDirSize = centralDir.reduce((sum, b) => sum + b.length, 0)
    const endRecord = Buffer.alloc(22)
    endRecord.writeUInt32LE(0x06054b50, 0)  // signature
    endRecord.writeUInt16LE(0, 4)           // disk number
    endRecord.writeUInt16LE(0, 6)           // disk with central dir
    endRecord.writeUInt16LE(centralDir.length, 8)   // entries on disk
    endRecord.writeUInt16LE(centralDir.length, 10)  // total entries
    endRecord.writeUInt32LE(centralDirSize, 12)     // central dir size
    endRecord.writeUInt32LE(offset, 16)             // central dir offset
    endRecord.writeUInt16LE(0, 20)                  // comment length

    return Buffer.concat([...entries, ...centralDir, endRecord])
}

// Simple CRC32 implementation
function crc32(buffer) {
    let crc = 0xFFFFFFFF
    const table = []

    for (let i = 0; i < 256; i++) {
        let c = i
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1))
        }
        table[i] = c
    }

    for (let i = 0; i < buffer.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF]
    }

    return (crc ^ 0xFFFFFFFF) >>> 0
}

export async function GET() {
    try {
        // Read model data
        const dataDir = path.join(process.cwd(), 'data')
        const [inputsData, calculationsData] = await Promise.all([
            fs.readFile(path.join(dataDir, 'model-inputs.json'), 'utf-8'),
            fs.readFile(path.join(dataDir, 'model-calculations.json'), 'utf-8')
        ])

        const inputs = JSON.parse(inputsData)
        const calculations = JSON.parse(calculationsData)

        // Generate export bundle
        const bundle = generateExportBundle(inputs, calculations)

        // Generate Python package
        const pythonFiles = generatePythonPackage(bundle)

        // Add reference guide
        pythonFiles['REFERENCE.md'] = generateReferenceGuide(bundle)

        // Prefix all files with glassbox_model/
        const packageFiles = {}
        for (const [filename, content] of Object.entries(pythonFiles)) {
            packageFiles[`glassbox_model/${filename}`] = content
        }

        // Create ZIP archive
        const zipBuffer = createZipArchive(packageFiles)

        // Return as downloadable ZIP
        return new NextResponse(zipBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': 'attachment; filename="glassbox_model.zip"',
                'Content-Length': zipBuffer.length.toString()
            }
        })
    } catch (error) {
        console.error('Python export error:', error)
        return NextResponse.json(
            { error: 'Failed to generate Python export', details: error.message },
            { status: 500 }
        )
    }
}
