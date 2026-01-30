// Compare model output values before and after migration
// Uses the backup file (pre-migration) vs current file (post-migration)
// Runs the server model engine on both to compare results

import { readFileSync } from 'fs'

// We can't easily import ESM from the project, so let's compare via the API
// Instead, let's check what the formulas produce by examining key references

const current = JSON.parse(readFileSync('data/model-calculations.json', 'utf-8'))
const backup = JSON.parse(readFileSync('data/model-calculations.backup.json', 'utf-8'))

// Check: are the original calculations unchanged?
const origCalcs = backup.calculations || []
const newCalcs = current.calculations || []

// Find calcs that exist in both (original calcs, not the new R9001+ ones)
const origById = new Map()
origCalcs.forEach(c => origById.set(c.id, c))

const newById = new Map()
newCalcs.forEach(c => newById.set(c.id, c))

console.log('=== Original Calc Formula Comparison ===')
let formulaChanges = 0
for (const [id, origCalc] of origById) {
    const newCalc = newById.get(id)
    if (!newCalc) {
        console.log(`MISSING: R${id} (${origCalc.name})`)
        continue
    }
    if (origCalc.formula !== newCalc.formula) {
        console.log(`CHANGED: R${id} (${origCalc.name})`)
        console.log(`  Before: ${origCalc.formula}`)
        console.log(`  After:  ${newCalc.formula}`)
        formulaChanges++
    }
}
console.log(`Formula changes in original calcs: ${formulaChanges}`)
console.log('')

// Check modules
console.log('=== Module Status ===')
const modules = current.modules || []
modules.forEach((mod, idx) => {
    console.log(`M${idx+1}: ${mod.name} - converted: ${mod.converted || false}, enabled: ${mod.enabled !== false}`)
})
console.log('')

// Check the new generated calcs
console.log('=== Generated Calc Formulas ===')
const genCalcs = newCalcs.filter(c => c.id >= 9001)
genCalcs.forEach(c => {
    console.log(`R${c.id} [${c._moduleId}.${c._moduleOutputKey}]: ${c.formula}`)
})
console.log('')

// Check M-ref map
console.log('=== M-Ref Map ===')
const mRefMap = current._mRefMap || {}
for (const [mRef, rRef] of Object.entries(mRefMap)) {
    console.log(`${mRef} -> ${rRef}`)
}
