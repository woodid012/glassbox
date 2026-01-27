// Excel Export API Route
// Generates an Excel-compatible file (CSV or XLSX-XML format)

import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { generateExportBundle } from '@/utils/exportSchema'

// Mark as dynamic to prevent static generation issues
export const dynamic = 'force-dynamic'

// Simple ZIP file creation for XLSX
function createZipArchive(files) {
    const entries = []
    let centralDir = []
    let offset = 0

    for (const [filename, content] of Object.entries(files)) {
        const fileBuffer = Buffer.from(content, 'utf-8')
        const filenameBuffer = Buffer.from(filename, 'utf-8')

        const localHeader = Buffer.alloc(30 + filenameBuffer.length)
        localHeader.writeUInt32LE(0x04034b50, 0)
        localHeader.writeUInt16LE(10, 4)
        localHeader.writeUInt16LE(0, 6)
        localHeader.writeUInt16LE(0, 8)
        localHeader.writeUInt16LE(0, 10)
        localHeader.writeUInt16LE(0, 12)
        localHeader.writeUInt32LE(crc32(fileBuffer), 14)
        localHeader.writeUInt32LE(fileBuffer.length, 18)
        localHeader.writeUInt32LE(fileBuffer.length, 22)
        localHeader.writeUInt16LE(filenameBuffer.length, 26)
        localHeader.writeUInt16LE(0, 28)
        filenameBuffer.copy(localHeader, 30)

        entries.push(localHeader)
        entries.push(fileBuffer)

        const centralEntry = Buffer.alloc(46 + filenameBuffer.length)
        centralEntry.writeUInt32LE(0x02014b50, 0)
        centralEntry.writeUInt16LE(20, 4)
        centralEntry.writeUInt16LE(10, 6)
        centralEntry.writeUInt16LE(0, 8)
        centralEntry.writeUInt16LE(0, 10)
        centralEntry.writeUInt16LE(0, 12)
        centralEntry.writeUInt16LE(0, 14)
        centralEntry.writeUInt32LE(crc32(fileBuffer), 16)
        centralEntry.writeUInt32LE(fileBuffer.length, 20)
        centralEntry.writeUInt32LE(fileBuffer.length, 24)
        centralEntry.writeUInt16LE(filenameBuffer.length, 28)
        centralEntry.writeUInt16LE(0, 30)
        centralEntry.writeUInt16LE(0, 32)
        centralEntry.writeUInt16LE(0, 34)
        centralEntry.writeUInt16LE(0, 36)
        centralEntry.writeUInt32LE(0, 38)
        centralEntry.writeUInt32LE(offset, 42)
        filenameBuffer.copy(centralEntry, 46)

        centralDir.push(centralEntry)
        offset += localHeader.length + fileBuffer.length
    }

    const centralDirSize = centralDir.reduce((sum, b) => sum + b.length, 0)
    const endRecord = Buffer.alloc(22)
    endRecord.writeUInt32LE(0x06054b50, 0)
    endRecord.writeUInt16LE(0, 4)
    endRecord.writeUInt16LE(0, 6)
    endRecord.writeUInt16LE(centralDir.length, 8)
    endRecord.writeUInt16LE(centralDir.length, 10)
    endRecord.writeUInt32LE(centralDirSize, 12)
    endRecord.writeUInt32LE(offset, 16)
    endRecord.writeUInt16LE(0, 20)

    return Buffer.concat([...entries, ...centralDir, endRecord])
}

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

// Convert column number to Excel letter
function colToLetter(col) {
    let letter = ''
    while (col > 0) {
        const mod = (col - 1) % 26
        letter = String.fromCharCode(65 + mod) + letter
        col = Math.floor((col - 1) / 26)
    }
    return letter || 'A'
}

// Escape XML special characters
function escapeXml(str) {
    if (str === null || str === undefined) return ''
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

// Generate XLSX file using Office Open XML format
function generateXlsxFiles(bundle) {
    const files = {}

    // [Content_Types].xml
    files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

    // _rels/.rels
    files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

    // xl/_rels/workbook.xml.rels
    files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

    // xl/workbook.xml
    files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary" sheetId="1" r:id="rId1"/>
    <sheet name="Inputs" sheetId="2" r:id="rId2"/>
    <sheet name="Calculations" sheetId="3" r:id="rId3"/>
    <sheet name="Modules" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`

    // xl/styles.xml
    files['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border/>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`

    // Collect all strings for shared strings
    const strings = []
    const stringIndex = {}

    function addString(s) {
        const str = String(s)
        if (!(str in stringIndex)) {
            stringIndex[str] = strings.length
            strings.push(str)
        }
        return stringIndex[str]
    }

    // Sheet 1: Summary
    const summaryRows = [
        ['Glass Box Financial Model Export'],
        [`Exported: ${bundle.exported_at}`],
        [''],
        ['Timeline'],
        ['Start Year', bundle.timeline.startYear],
        ['Start Month', bundle.timeline.startMonth],
        ['End Year', bundle.timeline.endYear],
        ['End Month', bundle.timeline.endMonth],
        ['Total Periods', bundle.timeline.periods],
        [''],
        ['Model Reference Guide'],
        ['Reference', 'Description'],
        ['R{id}', 'Calculation reference'],
        ['V1.{id}', 'CAPEX input'],
        ['S1.{id}', 'OPEX input'],
        ['C1.{idx}', 'Constant'],
        ['F{id}', 'Period flag'],
        ['I{id}', 'Index'],
        ['M{n}.{m}', 'Module output']
    ]

    let sheet1Data = ''
    summaryRows.forEach((row, rowIdx) => {
        row.forEach((cell, colIdx) => {
            if (cell !== '' && cell !== null && cell !== undefined) {
                const cellRef = `${colToLetter(colIdx + 1)}${rowIdx + 1}`
                if (typeof cell === 'number') {
                    sheet1Data += `<c r="${cellRef}"><v>${cell}</v></c>`
                } else {
                    const idx = addString(cell)
                    sheet1Data += `<c r="${cellRef}" t="s"><v>${idx}</v></c>`
                }
            }
        })
    })

    files['xl/worksheets/sheet1.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${summaryRows.map((row, rowIdx) => {
        const cells = row.map((cell, colIdx) => {
            if (cell === '' || cell === null || cell === undefined) return ''
            const cellRef = `${colToLetter(colIdx + 1)}${rowIdx + 1}`
            if (typeof cell === 'number') {
                return `<c r="${cellRef}"><v>${cell}</v></c>`
            } else {
                const idx = addString(cell)
                return `<c r="${cellRef}" t="s"><v>${idx}</v></c>`
            }
        }).join('')
        return cells ? `<row r="${rowIdx + 1}">${cells}</row>` : ''
    }).join('')}</sheetData>
</worksheet>`

    // Sheet 2: Inputs - Dynamically extract all input groups
    const inputsRows = []

    // Iterate through all input groups dynamically
    for (const [groupKey, groupData] of Object.entries(bundle.inputs || {})) {
        const meta = groupData._meta
        if (!meta) continue // Skip non-group entries

        const entryMode = meta.entryMode
        const groupName = meta.name
        const refPrefix = meta.refPrefix

        // Add group header
        inputsRows.push([`${groupName.toUpperCase()} (${refPrefix}.X)`, '', '', ''])

        if (entryMode === 'constant') {
            inputsRows.push(['Reference', 'Name', 'Value', 'Unit'])
            for (const [ref, data] of Object.entries(groupData)) {
                if (ref === '_meta') continue
                inputsRows.push([ref, data.name, data.value, data.unit || ''])
            }
        } else if (entryMode === 'lookup') {
            inputsRows.push(['Reference', 'Name', 'Group', 'Unit'])
            for (const [ref, data] of Object.entries(groupData)) {
                if (ref === '_meta') continue
                inputsRows.push([ref, data.name, data.groupName || groupName, data.unit || ''])
            }
        } else {
            // Series (CAPEX, OPEX, etc.)
            inputsRows.push(['Reference', 'Name', 'Total', 'Unit'])
            for (const [ref, data] of Object.entries(groupData)) {
                if (ref === '_meta') continue
                if (ref === refPrefix) continue // Skip total row for now
                inputsRows.push([ref, data.name, data.total || 0, data.unit || ''])
            }
            // Add total row at end
            if (groupData[refPrefix]) {
                const total = groupData[refPrefix]
                inputsRows.push([`${refPrefix} (Total)`, total.name, total.total || 0, total.unit || ''])
            }
        }
        inputsRows.push(['', '', '', ''])
    }

    // Key Periods / Flags section
    if (bundle.keyPeriods && Object.keys(bundle.keyPeriods).length > 0) {
        inputsRows.push(['KEY PERIODS / FLAGS (F.X)', '', '', '', ''])
        inputsRows.push(['Reference', 'Name', 'Start (Year-Month)', 'End (Year-Month)', 'Periods'])
        for (const [ref, data] of Object.entries(bundle.keyPeriods)) {
            const startStr = `${data.startYear}-${String(data.startMonth).padStart(2, '0')}`
            const endStr = `${data.endYear}-${String(data.endMonth).padStart(2, '0')}`
            inputsRows.push([ref, data.name, startStr, endStr, data.periods || ''])
        }
        inputsRows.push(['', '', '', '', ''])
    }

    // Indices section
    if (bundle.indices && Object.keys(bundle.indices).length > 0) {
        inputsRows.push(['INDEXATION (I.X)', '', '', '', ''])
        inputsRows.push(['Reference', 'Name', 'Rate (%)', 'Period', 'Base Year'])
        for (const [ref, data] of Object.entries(bundle.indices)) {
            inputsRows.push([ref, data.name, data.rate || 0, data.period || 'annual', data.baseYear || ''])
        }
    }

    files['xl/worksheets/sheet2.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${inputsRows.map((row, rowIdx) => {
        const cells = row.map((cell, colIdx) => {
            if (cell === '' || cell === null || cell === undefined) return ''
            const cellRef = `${colToLetter(colIdx + 1)}${rowIdx + 1}`
            if (typeof cell === 'number') {
                return `<c r="${cellRef}"><v>${cell}</v></c>`
            } else {
                const idx = addString(escapeXml(cell))
                return `<c r="${cellRef}" t="s"><v>${idx}</v></c>`
            }
        }).join('')
        return cells ? `<row r="${rowIdx + 1}">${cells}</row>` : ''
    }).join('')}</sheetData>
</worksheet>`

    // Sheet 3: Calculations
    const calcRows = [['Reference', 'Name', 'Formula', 'Description']]
    Object.entries(bundle.calculations.items || {}).forEach(([ref, calc]) => {
        calcRows.push([ref, calc.name, calc.formula || '0', calc.description || ''])
    })

    files['xl/worksheets/sheet3.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${calcRows.map((row, rowIdx) => {
        const cells = row.map((cell, colIdx) => {
            if (cell === '' || cell === null || cell === undefined) return ''
            const cellRef = `${colToLetter(colIdx + 1)}${rowIdx + 1}`
            if (typeof cell === 'number') {
                return `<c r="${cellRef}"><v>${cell}</v></c>`
            } else {
                const idx = addString(escapeXml(cell))
                return `<c r="${cellRef}" t="s"><v>${idx}</v></c>`
            }
        }).join('')
        return cells ? `<row r="${rowIdx + 1}">${cells}</row>` : ''
    }).join('')}</sheetData>
</worksheet>`

    // Sheet 4: Modules - Detailed with auditable formulas
    const moduleRows = [['Module', 'Output Ref', 'Output Name', 'Type', 'Formula (Auditable)']]

    bundle.modules.forEach(mod => {
        // Add module header row
        moduleRows.push([`M${mod.index}: ${mod.name}`, '', '', '', mod.description || ''])

        // Add configured inputs
        if (mod.inputDefinitions && mod.inputDefinitions.length > 0) {
            moduleRows.push(['  Inputs:', '', '', '', ''])
            mod.inputDefinitions.forEach(inp => {
                const configValue = inp.configuredValue !== undefined ? inp.configuredValue : inp.default
                moduleRows.push(['', `  ${inp.key}`, inp.label, inp.type, String(configValue || '')])
            })
            moduleRows.push(['  Outputs:', '', '', '', ''])
        }

        // Add each output with its formula
        mod.outputs.forEach(out => {
            moduleRows.push([
                '',
                out.ref,
                out.label,
                out.type,
                out.formula || ''
            ])
        })

        // Add blank row between modules
        moduleRows.push(['', '', '', '', ''])
    })

    files['xl/worksheets/sheet4.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${moduleRows.map((row, rowIdx) => {
        const cells = row.map((cell, colIdx) => {
            if (cell === '' || cell === null || cell === undefined) return ''
            const cellRef = `${colToLetter(colIdx + 1)}${rowIdx + 1}`
            if (typeof cell === 'number') {
                return `<c r="${cellRef}"><v>${cell}</v></c>`
            } else {
                const idx = addString(escapeXml(cell))
                return `<c r="${cellRef}" t="s"><v>${idx}</v></c>`
            }
        }).join('')
        return cells ? `<row r="${rowIdx + 1}">${cells}</row>` : ''
    }).join('')}</sheetData>
</worksheet>`

    // xl/sharedStrings.xml
    files['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${strings.map(s => `<si><t>${escapeXml(s)}</t></si>`).join('\n')}
</sst>`

    return files
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

        // Generate XLSX files
        const xlsxFiles = generateXlsxFiles(bundle)

        // Create ZIP archive
        const zipBuffer = createZipArchive(xlsxFiles)

        // Return as downloadable XLSX
        return new NextResponse(zipBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="GlassBox_Model.xlsx"',
                'Content-Length': zipBuffer.length.toString()
            }
        })
    } catch (error) {
        console.error('Excel export error:', error)
        return NextResponse.json(
            { error: 'Failed to generate Excel export', details: error.message },
            { status: 500 }
        )
    }
}
