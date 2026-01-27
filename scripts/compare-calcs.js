/**
 * Compare calculation outputs between two debug snapshots
 * Usage: node scripts/compare-calcs.js data/debug-BEFORE.json data/debug-AFTER.json
 */
const fs = require('fs')

const beforePath = process.argv[2] || 'data/debug-BEFORE.json'
const afterPath = process.argv[3] || 'data/debug-AFTER.json'

if (!fs.existsSync(beforePath)) {
    console.error(`Before file not found: ${beforePath}`)
    process.exit(1)
}
if (!fs.existsSync(afterPath)) {
    console.error(`After file not found: ${afterPath}`)
    process.exit(1)
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'))
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'))

const diffs = []

// Compare calculations
for (const [key, beforeCalc] of Object.entries(before.calculations || {})) {
    const afterCalc = (after.calculations || {})[key]
    if (!afterCalc) {
        diffs.push({ key, name: beforeCalc.n || '', issue: 'MISSING in after' })
        continue
    }
    // Compare y arrays (handle RLE encoding)
    const beforeY = JSON.stringify(beforeCalc.y)
    const afterY = JSON.stringify(afterCalc.y)
    if (beforeY !== afterY) {
        diffs.push({ key, name: beforeCalc.n || '', issue: 'VALUES DIFFER' })
    }
}

// Check for new calculations in after
for (const key of Object.keys(after.calculations || {})) {
    if (!(before.calculations || {})[key]) {
        diffs.push({ key, name: (after.calculations || {})[key].n || '', issue: 'NEW in after' })
    }
}

console.log('Comparison complete')
console.log('==================')
console.log(`Before: ${beforePath}`)
console.log(`After: ${afterPath}`)
console.log('')
console.log(`Differences found: ${diffs.length}`)

if (diffs.length > 0) {
    diffs.forEach(d => console.log(`  ${d.key}: ${d.name} - ${d.issue}`))
} else {
    console.log('  No differences - outputs match!')
}
