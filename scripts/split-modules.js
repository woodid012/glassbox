/**
 * One-time migration script: Split model-calculations.json into
 * model-calculations.json (core) + model-modules.json (module data)
 *
 * Usage: node scripts/split-modules.js
 */
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')
const CALCS_FILE = path.join(DATA_DIR, 'model-calculations.json')
const MODULES_FILE = path.join(DATA_DIR, 'model-modules.json')

// Read current file
const data = JSON.parse(fs.readFileSync(CALCS_FILE, 'utf-8'))

// Identify module groups
const allGroups = data.calculationsGroups || []
const moduleGroups = allGroups.filter(g => g._isModuleGroup)
const coreGroups = allGroups.filter(g => !g._isModuleGroup)
const moduleGroupIds = new Set(moduleGroups.map(g => g.id))

// Separate calculations
const allCalcs = data.calculations || []
const moduleCalcs = allCalcs.filter(c => moduleGroupIds.has(c.groupId))
const coreCalcs = allCalcs.filter(c => !moduleGroupIds.has(c.groupId))

console.log('=== Split Analysis ===')
console.log(`Total groups: ${allGroups.length} (core: ${coreGroups.length}, module: ${moduleGroups.length})`)
console.log(`Total calcs: ${allCalcs.length} (core: ${coreCalcs.length}, module: ${moduleCalcs.length})`)
console.log(`Module group IDs: ${[...moduleGroupIds].join(', ')}`)
console.log(`Modules array: ${(data.modules || []).length} entries`)
console.log(`_mRefMap: ${Object.keys(data._mRefMap || {}).length} entries`)

// Build model-modules.json
const modulesData = {
    _description: 'Module definitions, groups, calculations, and M-ref map',
    modules: data.modules || [],
    moduleGroups: moduleGroups,
    moduleCalculations: moduleCalcs,
    _mRefMap: data._mRefMap || {}
}

// Keep moduleTemplates if present
if (data.moduleTemplates) {
    modulesData.moduleTemplates = data.moduleTemplates
}

// Build slimmed model-calculations.json
const slimCalcs = {
    _description: data._description || 'Model structure - formulas and relationships only',
    calculationsTabs: data.calculationsTabs || [],
    calculationsGroups: coreGroups,
    calculations: coreCalcs
}

// Keep _constantsReference if present
if (data._constantsReference) {
    slimCalcs._constantsReference = data._constantsReference
}

// Write both files
fs.writeFileSync(MODULES_FILE, JSON.stringify(modulesData, null, 2), 'utf-8')
console.log(`\nWrote ${MODULES_FILE}`)

fs.writeFileSync(CALCS_FILE, JSON.stringify(slimCalcs, null, 2), 'utf-8')
console.log(`Wrote ${CALCS_FILE}`)

// Report sizes
const modulesSize = fs.statSync(MODULES_FILE).size
const calcsSize = fs.statSync(CALCS_FILE).size
console.log(`\n=== File Sizes ===`)
console.log(`model-modules.json: ${(modulesSize / 1024).toFixed(1)} KB`)
console.log(`model-calculations.json: ${(calcsSize / 1024).toFixed(1)} KB`)
console.log(`\nDone! Migration complete.`)
