// Export Schema - Bundle model data for Python/Excel export
// Generates a complete snapshot of the model for external consumption

import { MODULE_TEMPLATES } from './modules'

/**
 * Build timeline arrays from config
 */
function buildTimeline(config) {
    if (!config) return { periods: 0, year: [], month: [], periodLabels: [] }

    const { startYear, startMonth, endYear, endMonth } = config

    // Calculate total periods
    const periods = (endYear - startYear) * 12 + (endMonth - startMonth) + 1

    const year = []
    const month = []
    const periodLabels = []

    let currentYear = startYear
    let currentMonth = startMonth

    for (let i = 0; i < periods; i++) {
        year.push(currentYear)
        month.push(currentMonth)
        periodLabels.push(`${currentYear}-${String(currentMonth).padStart(2, '0')}`)

        currentMonth++
        if (currentMonth > 12) {
            currentMonth = 1
            currentYear++
        }
    }

    return { periods, year, month, periodLabels }
}

/**
 * Generate a complete export bundle containing all model data
 * @param {Object} inputs - model-inputs.json data
 * @param {Object} calculations - model-calculations.json data
 * @param {Object} computedResults - Optional pre-computed results for verification
 * @returns {Object} Complete export bundle
 */
export function generateExportBundle(inputs, calculations, computedResults = null) {
    const config = inputs.config || {}
    const timeline = buildTimeline(config)

    // Dynamically extract all input groups
    const inputGroups = extractAllInputGroups(inputs, timeline)

    return {
        version: "1.0",
        exported_at: new Date().toISOString(),

        // Timeline configuration
        timeline: {
            periods: timeline.periods,
            startYear: config.startYear,
            startMonth: config.startMonth,
            endYear: config.endYear,
            endMonth: config.endMonth,
            year: timeline.year,
            month: timeline.month,
            periodLabels: timeline.periodLabels
        },

        // Inputs organized dynamically by group
        inputs: inputGroups,

        // Key periods and indices (special input types)
        keyPeriods: extractKeyPeriods(inputs, timeline),
        indices: extractIndices(inputs, timeline),

        // Calculations with formulas and metadata
        calculations: {
            tabs: calculations.calculationsTabs || [],
            groups: calculations.calculationsGroups || [],
            items: extractCalculations(calculations)
        },

        // Module configurations
        modules: extractModules(calculations),

        // Reference documentation
        referenceMap: buildReferenceMap(inputs, calculations),

        // Pre-computed results (if provided) for verification
        computedResults: computedResults
    }
}

/**
 * Dynamically extract all input groups based on inputGlassGroups
 * This picks up any new groups added to the model
 */
function extractAllInputGroups(inputs, timeline) {
    const result = {}
    const groups = inputs.inputGlassGroups || []

    for (const group of groups) {
        const groupId = group.id
        const entryMode = group.entryMode || group.groupType || 'series'

        // Determine reference prefix based on group
        let refPrefix
        if (groupId === 100 || entryMode === 'constant') {
            refPrefix = 'C1'
        } else if (groupId === 1) {
            refPrefix = 'V1'
        } else if (groupId === 2) {
            refPrefix = 'S1'
        } else if (entryMode === 'lookup') {
            refPrefix = `L${groupId}`
        } else {
            // Generic series group - use G{id} prefix
            refPrefix = `G${groupId}`
        }

        // Create a normalized group key
        const groupKey = group.name.toLowerCase().replace(/\s+/g, '_')

        // Extract inputs for this group
        if (entryMode === 'constant') {
            result[groupKey] = extractConstantsForGroup(inputs, groupId, refPrefix)
        } else if (entryMode === 'lookup') {
            result[groupKey] = extractLookupGroup(inputs, group, timeline)
        } else {
            result[groupKey] = extractSeriesGroup(inputs, groupId, refPrefix, timeline)
        }

        // Add group metadata
        result[groupKey]._meta = {
            groupId: groupId,
            name: group.name,
            refPrefix: refPrefix,
            entryMode: entryMode
        }
    }

    return result
}

/**
 * Extract constants for a specific group
 */
function extractConstantsForGroup(inputs, groupId, refPrefix) {
    const items = {}
    const groupInputs = inputs.inputGlass?.filter(i => i.groupId === groupId) || []

    for (const input of groupInputs) {
        // C1.X reference = id - 99 (ids start at 100 for constants)
        const refIndex = groupId === 100 ? input.id - 99 : input.id
        const refName = `${refPrefix}.${refIndex}`

        items[refName] = {
            id: input.id,
            name: input.name,
            value: input.value,
            unit: input.unit || '',
            description: input.inputId || ''
        }
    }

    return items
}

/**
 * Extract series inputs for a specific group (CAPEX, OPEX, etc.)
 */
function extractSeriesGroup(inputs, groupId, refPrefix, timeline) {
    const items = {}
    const groupInputs = inputs.inputGlass?.filter(i => i.groupId === groupId) || []

    for (const input of groupInputs) {
        const refName = `${refPrefix}.${input.id}`

        // Build values array from sparse values object
        const values = new Array(timeline.periods).fill(0)

        if (input.mode === 'constant' && input.value !== undefined) {
            values.fill(input.value)
        } else if (input.values) {
            for (const [periodIdx, value] of Object.entries(input.values)) {
                const idx = parseInt(periodIdx)
                if (idx >= 0 && idx < timeline.periods) {
                    values[idx] = value
                }
            }
        }

        items[refName] = {
            id: input.id,
            name: input.name,
            values: values,
            unit: input.unit || '',
            total: input.total || values.reduce((a, b) => a + b, 0)
        }
    }

    // Also add group total
    const totalValues = new Array(timeline.periods).fill(0)
    for (const item of Object.values(items)) {
        if (item.values) {
            for (let i = 0; i < item.values.length; i++) {
                totalValues[i] += item.values[i] || 0
            }
        }
    }

    items[refPrefix] = {
        id: 0,
        name: `Total ${refPrefix}`,
        values: totalValues,
        unit: '$ M',
        total: totalValues.reduce((a, b) => a + b, 0)
    }

    return items
}

/**
 * Extract lookup group inputs
 */
function extractLookupGroup(inputs, group, timeline) {
    const items = {}
    const config = inputs.config || {}
    const groupInputs = inputs.inputGlass?.filter(i => i.groupId === group.id) || []

    for (const input of groupInputs) {
        const refName = `L${group.id}.${input.id}`

        // Build values from lookup values
        const values = new Array(timeline.periods).fill(0)

        if (input.lookupValues) {
            for (const [key, value] of Object.entries(input.lookupValues)) {
                const keyNum = parseInt(key)
                if (keyNum >= config.startYear) {
                    // Year-based lookup
                    for (let i = 0; i < timeline.periods; i++) {
                        if (timeline.year[i] === keyNum) {
                            values[i] = value
                        }
                    }
                } else if (keyNum < timeline.periods) {
                    values[keyNum] = value
                }
            }
        } else if (input.values) {
            for (const [periodIdx, value] of Object.entries(input.values)) {
                const idx = parseInt(periodIdx)
                if (idx >= 0 && idx < timeline.periods) {
                    values[idx] = value
                }
            }
        }

        items[refName] = {
            id: input.id,
            groupId: group.id,
            name: input.name,
            groupName: group.name,
            values: values,
            unit: input.unit || ''
        }
    }

    return items
}


/**
 * Extract key periods and generate flag arrays
 */
function extractKeyPeriods(inputs, timeline) {
    const keyPeriods = {}
    const config = inputs.config || {}
    const keyPeriodsArray = inputs.keyPeriods || []

    for (const kp of keyPeriodsArray) {
        // Generate flag array
        const flag = new Array(timeline.periods).fill(0)
        const flagStart = new Array(timeline.periods).fill(0)
        const flagEnd = new Array(timeline.periods).fill(0)

        // Find start and end period indices
        const startIdx = (kp.startYear - config.startYear) * 12 + (kp.startMonth - config.startMonth)
        const endIdx = (kp.endYear - config.startYear) * 12 + (kp.endMonth - config.startMonth)

        // Fill flag array
        for (let i = Math.max(0, startIdx); i <= Math.min(endIdx, timeline.periods - 1); i++) {
            flag[i] = 1
        }

        // Set start and end flags
        if (startIdx >= 0 && startIdx < timeline.periods) {
            flagStart[startIdx] = 1
        }
        if (endIdx >= 0 && endIdx < timeline.periods) {
            flagEnd[endIdx] = 1
        }

        const refName = `F${kp.id}`
        keyPeriods[refName] = {
            id: kp.id,
            name: kp.name,
            startYear: kp.startYear,
            startMonth: kp.startMonth,
            endYear: kp.endYear,
            endMonth: kp.endMonth,
            periods: kp.periods,
            flag: flag,
            flagStart: flagStart,
            flagEnd: flagEnd
        }
    }

    return keyPeriods
}

/**
 * Extract indexation arrays
 */
function extractIndices(inputs, timeline) {
    const indices = {}
    const config = inputs.config || {}
    const indicesArray = inputs.indices || []

    for (const idx of indicesArray) {
        const values = new Array(timeline.periods).fill(1)

        // Calculate compounding index
        const annualRate = (idx.indexationRate || 0) / 100
        const baseYear = idx.indexationStartYear || config.startYear
        const baseMonth = idx.indexationStartMonth || 1

        for (let i = 0; i < timeline.periods; i++) {
            const yearsFromBase = timeline.year[i] - baseYear + (timeline.month[i] - baseMonth) / 12

            if (idx.indexationPeriod === 'annual') {
                // Annual compounding
                const wholeYears = Math.floor(yearsFromBase)
                values[i] = Math.pow(1 + annualRate, Math.max(0, wholeYears))
            } else {
                // Monthly compounding
                const monthlyRate = Math.pow(1 + annualRate, 1/12) - 1
                const monthsFromBase = (timeline.year[i] - baseYear) * 12 + (timeline.month[i] - baseMonth)
                values[i] = Math.pow(1 + monthlyRate, Math.max(0, monthsFromBase))
            }
        }

        const refName = `I${idx.id}`
        indices[refName] = {
            id: idx.id,
            name: idx.name,
            rate: idx.indexationRate,
            period: idx.indexationPeriod,
            baseYear: baseYear,
            baseMonth: baseMonth,
            values: values
        }
    }

    return indices
}

/**
 * Extract calculations with formulas and metadata
 */
function extractCalculations(calculations) {
    const items = {}
    const calcsArray = calculations.calculations || []

    for (const calc of calcsArray) {
        const refName = `R${calc.id}`

        items[refName] = {
            id: calc.id,
            name: calc.name,
            formula: calc.formula || '0',
            description: calc.description || '',
            type: calc.type || 'flow',  // stock, stock_start, flow
            groupId: calc.groupId,
            tabId: calc.tabId
        }
    }

    return items
}

/**
 * Extract module configurations
 * Reads auditable formulas from template.outputFormulas and substitutes configured input values
 */
function extractModules(calculations) {
    return (calculations.modules || []).map((mod, index) => {
        const template = MODULE_TEMPLATES[mod.templateId]
        const moduleInputs = mod.inputs || {}

        // Build auditable formulas by substituting input values into template formulas
        const resolvedFormulas = {}
        if (template?.outputFormulas) {
            for (const [outputKey, templateFormula] of Object.entries(template.outputFormulas)) {
                let formula = templateFormula
                // Replace {inputKey} placeholders with actual configured values
                for (const [inputKey, inputValue] of Object.entries(moduleInputs)) {
                    const placeholder = new RegExp(`\\{${inputKey}\\}`, 'g')
                    formula = formula.replace(placeholder, String(inputValue))
                }
                // Replace any remaining placeholders with defaults from template inputs
                if (template.inputs) {
                    for (const inp of template.inputs) {
                        const placeholder = new RegExp(`\\{${inp.key}\\}`, 'g')
                        if (formula.match(placeholder)) {
                            formula = formula.replace(placeholder, String(inp.default || inp.key))
                        }
                    }
                }
                resolvedFormulas[outputKey] = formula
            }
        }

        return {
            index: index + 1,  // 1-based for M1, M2, etc.
            id: mod.id,
            templateId: mod.templateId,
            name: mod.name,
            description: mod.description,
            category: mod.category,
            inputs: moduleInputs,
            // Include input definitions from template for auditability
            inputDefinitions: template?.inputs?.map(inp => ({
                key: inp.key,
                label: inp.label,
                type: inp.type,
                required: inp.required,
                default: inp.default,
                configuredValue: moduleInputs[inp.key]
            })) || [],
            outputs: template?.outputs?.map((out, outIdx) => ({
                index: outIdx + 1,
                key: out.key,
                label: out.label,
                type: out.type,
                ref: `M${index + 1}.${outIdx + 1}`,
                // Auditable formula from template with configured values substituted
                formula: resolvedFormulas[out.key] || 'See module calculation logic'
            })) || []
        }
    })
}

/**
 * Build complete reference map for documentation
 */
function buildReferenceMap(inputs, calculations) {
    // Simplified version to debug
    const map = {
        calculations: {},
        constants: {},
        capex: {},
        opex: {},
        flags: {},
        indices: {},
        modules: {},
        timeConstants: {
            'T.MiY': { value: 12, description: 'Months in Year' },
            'T.DiY': { value: 365, description: 'Days in Year (approx)' },
        },
        timeFlags: {}
    }

    // Add calculations
    const calcs = calculations.calculations
    if (calcs && Array.isArray(calcs)) {
        for (const calc of calcs) {
            map.calculations[`R${calc.id}`] = {
                name: calc.name,
                formula: calc.formula,
                description: calc.description
            }
        }
    }

    // Add constants
    const inputGlass = inputs.inputGlass
    if (inputGlass && Array.isArray(inputGlass)) {
        for (const c of inputGlass) {
            if (c.groupId === 100) {
                const idx = c.id - 99
                map.constants[`C1.${idx}`] = {
                    name: c.name,
                    value: c.value,
                    unit: c.unit
                }
            } else if (c.groupId === 1) {
                map.capex[`V1.${c.id}`] = {
                    name: c.name,
                    total: c.total,
                    unit: c.unit
                }
            } else if (c.groupId === 2) {
                map.opex[`S1.${c.id}`] = {
                    name: c.name,
                    total: c.total,
                    unit: c.unit
                }
            }
        }
    }

    // Add key periods
    const keyPeriods = inputs.keyPeriods
    if (keyPeriods && Array.isArray(keyPeriods)) {
        for (const kp of keyPeriods) {
            map.flags[`F${kp.id}`] = { name: kp.name, type: 'period' }
        }
    }

    // Add indices
    const indices = inputs.indices
    if (indices && Array.isArray(indices)) {
        for (const idx of indices) {
            map.indices[`I${idx.id}`] = {
                name: idx.name,
                rate: idx.indexationRate
            }
        }
    }

    // Add modules
    const modules = calculations.modules
    if (modules && Array.isArray(modules)) {
        for (let i = 0; i < modules.length; i++) {
            const mod = modules[i]
            const template = MODULE_TEMPLATES[mod.templateId]
            if (template && template.outputs && Array.isArray(template.outputs)) {
                for (let j = 0; j < template.outputs.length; j++) {
                    const out = template.outputs[j]
                    map.modules[`M${i + 1}.${j + 1}`] = {
                        module: mod.name,
                        output: out.label,
                        key: out.key
                    }
                }
            }
        }
    }

    return map
}

/**
 * Generate reference documentation markdown
 */
export function generateReferenceGuide(bundle) {
    let md = `# Glass Box Model Reference Guide

## Model Overview

- **Exported:** ${bundle.exported_at}
- **Timeline:** ${bundle.timeline.startYear}-${String(bundle.timeline.startMonth).padStart(2, '0')} to ${bundle.timeline.endYear}-${String(bundle.timeline.endMonth).padStart(2, '0')}
- **Periods:** ${bundle.timeline.periods} months

## Reference Syntax

### Calculation References (R{id})
Reference other calculations by their ID.

| Reference | Name | Formula |
|-----------|------|---------|
`

    for (const [ref, info] of Object.entries(bundle.referenceMap.calculations)) {
        const formula = (info.formula || '').substring(0, 50) + (info.formula?.length > 50 ? '...' : '')
        md += `| ${ref} | ${info.name} | \`${formula}\` |\n`
    }

    md += `
### Constant References (C1.{idx})
Constants are single values applied to all periods.

| Reference | Name | Value | Unit |
|-----------|------|-------|------|
`

    for (const [ref, info] of Object.entries(bundle.referenceMap.constants)) {
        md += `| ${ref} | ${info.name} | ${info.value} | ${info.unit || '-'} |\n`
    }

    md += `
### CAPEX References (V1.{id})
Capital expenditure time series.

| Reference | Name | Total | Unit |
|-----------|------|-------|------|
`

    for (const [ref, info] of Object.entries(bundle.referenceMap.capex)) {
        md += `| ${ref} | ${info.name} | ${info.total} | ${info.unit || '-'} |\n`
    }

    md += `
### OPEX References (S1.{id})
Operating expenditure time series.

| Reference | Name | Total | Unit |
|-----------|------|-------|------|
`

    for (const [ref, info] of Object.entries(bundle.referenceMap.opex || {})) {
        md += `| ${ref} | ${info.name} | ${info.total} | ${info.unit || '-'} |\n`
    }

    md += `
---

## Time Series Data

### Key Periods / Flags (F{id})
Time period flags for conditional calculations. Each flag produces three arrays:
- \`F{id}\` - 1 during the period, 0 otherwise
- \`F{id}.Start\` - 1 only in the first period
- \`F{id}.End\` - 1 only in the last period

| Reference | Name | Start | End | Periods |
|-----------|------|-------|-----|---------|
`

    for (const [ref, data] of Object.entries(bundle.keyPeriods || {})) {
        const startStr = `${data.startYear}-${String(data.startMonth).padStart(2, '0')}`
        const endStr = `${data.endYear}-${String(data.endMonth).padStart(2, '0')}`
        md += `| ${ref} | ${data.name} | ${startStr} | ${endStr} | ${data.periods || ''} |\n`
    }

    md += `
### Indexation (I{id})
Compounding index arrays for inflation/escalation adjustments.

| Reference | Name | Rate (%) | Period | Base Year |
|-----------|------|----------|--------|-----------|
`

    for (const [ref, data] of Object.entries(bundle.indices || {})) {
        md += `| ${ref} | ${data.name} | ${data.rate || 0} | ${data.period || 'annual'} | ${data.baseYear || ''} |\n`
    }

    // Add lookup groups
    md += `
### Lookup Tables
Year-based or period-based lookup values.

`

    for (const [groupKey, groupData] of Object.entries(bundle.inputs || {})) {
        const meta = groupData._meta
        if (!meta || meta.entryMode !== 'lookup') continue

        md += `#### ${meta.name} (${meta.refPrefix}.X)

| Reference | Name | Unit |
|-----------|------|------|
`
        for (const [ref, data] of Object.entries(groupData)) {
            if (ref === '_meta') continue
            md += `| ${ref} | ${data.name} | ${data.unit || '-'} |\n`
        }
        md += '\n'
    }

    md += `
### Time Constants
Standard time conversion values.

| Reference | Value | Description |
|-----------|-------|-------------|
`

    for (const [ref, info] of Object.entries(bundle.referenceMap.timeConstants)) {
        md += `| ${ref} | ${info.value} | ${info.description} |\n`
    }

    md += `
### Module Outputs (M{idx}.{output})
Pre-built module outputs.

| Reference | Module | Output |
|-----------|--------|--------|
`

    for (const [ref, info] of Object.entries(bundle.referenceMap.modules)) {
        md += `| ${ref} | ${info.module} | ${info.output} |\n`
    }

    md += `
---

## Array Functions

| Function | Description | Example |
|----------|-------------|---------|
| CUMSUM(X) | Cumulative sum | \`CUMSUM(V1)\` |
| CUMPROD(X) | Cumulative product | \`CUMPROD(1 + rate)\` |
| SHIFT(X, n) | Shift array by n periods | \`SHIFT(R42, 1)\` |
| COUNT(X) | Count of non-zero values | \`COUNT(F1)\` |
| MIN(a, b) | Minimum of two values | \`MIN(R1, R2)\` |
| MAX(a, b) | Maximum of two values | \`MAX(0, R1)\` |
| ABS(X) | Absolute value | \`ABS(R1)\` |

---

## Modules

${bundle.modules.map(m => `
### M${m.index}: ${m.name}
${m.description}

**Inputs:**
${Object.entries(m.inputs).map(([k, v]) => `- ${k}: \`${v}\``).join('\n')}

**Outputs:**
| Ref | Output | Formula |
|-----|--------|---------|
${m.outputs.map(o => `| ${o.ref} | ${o.label} | \`${(o.formula || '').substring(0, 60)}${(o.formula?.length > 60 ? '...' : '')}\` |`).join('\n')}
`).join('\n')}

---

## Data Files

The exported package includes these JSON data files:

| File | Description |
|------|-------------|
| \`data/inputs.json\` | All input groups (constants, CAPEX, OPEX, lookups) |
| \`data/calculations.json\` | All calculations with formulas |
| \`data/modules.json\` | Module configurations and auditable formulas |
| \`data/timeline.json\` | Period definitions (year, month arrays) |
| \`data/key_periods.json\` | Key period flags (F1, F1.Start, F1.End arrays) |
| \`data/indices.json\` | Indexation arrays (I1, I2 compounded values) |
| \`data/reference_map.json\` | Complete reference documentation |
`

    return md
}
