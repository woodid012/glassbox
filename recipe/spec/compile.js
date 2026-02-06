/**
 * Compile a model spec into a full recipe.
 *
 * The spec is a simplified, Claude-friendly format that expands into
 * the complete recipe.json structure.
 *
 * FORMULA REFERENCES:
 * - Formulas can use symbolic names in braces: {PowerCapacity} * {TollingFee}
 * - Or explicit refs: C1.2 * C1.9
 * - Symbolic refs are translated to actual refs during compilation
 */

import { getTemplateFormulas } from './moduleFormulas.js'

// Month name to number mapping
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
}

/**
 * Parse a date string like "Apr 2027" into { year, month }
 */
function parseDate(dateStr) {
  const match = dateStr.match(/^([A-Za-z]{3})\s+(\d{4})$/)
  if (!match) throw new Error(`Invalid date format: ${dateStr}`)
  const month = MONTHS[match[1].toLowerCase()]
  if (!month) throw new Error(`Invalid month: ${match[1]}`)
  return { year: parseInt(match[2]), month }
}

/**
 * Parse a duration string like "18 months" or "25 years" into months
 */
function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)\s+(months?|years?)$/)
  if (!match) throw new Error(`Invalid duration format: ${durationStr}`)
  const value = parseInt(match[1])
  const unit = match[2].toLowerCase()
  return unit.startsWith('year') ? value * 12 : value
}

/**
 * Add months to a date, returning new { year, month }
 */
function addMonths(date, months) {
  let totalMonths = (date.year * 12 + date.month - 1) + months
  return {
    year: Math.floor(totalMonths / 12),
    month: (totalMonths % 12) + 1
  }
}

/**
 * Calculate end date from start date and duration in months
 */
function calculateEndDate(startDate, durationMonths) {
  // End is (duration - 1) months after start (inclusive)
  return addMonths(startDate, durationMonths - 1)
}

/**
 * Compile a model spec into a full recipe.
 */
export function compileSpec(spec) {
  const recipe = {
    _generatedFrom: 'model-spec',
    _generatedAt: new Date().toISOString(),
    project: compileProject(spec.project),
    timeline: compileTimeline(spec.timeline),
    keyPeriods: [],
    indices: [],
    inputGroups: [],
    inputs: [],
    calculationGroups: [],
    calculations: [],
    tabs: [],
    moduleGroups: [],
    moduleCalculations: [],
    modules: [],
    mRefMap: {},
    validation: spec.validation || {},
    bestPractices: {
      signConvention: { enabled: true },
      noHardcodedNumbers: true
    }
  }

  // Build lookup maps for resolving references by name
  const context = {
    timeline: recipe.timeline,
    keyPeriodsByFlag: {},
    keyPeriodsByName: {},
    inputGroupsByName: {},
    calculationGroupsByName: {},
    tabsByName: {},
    // Symbol maps for formula translation (name -> ref)
    constantRefsByName: {},
    inputRefsByName: {},
    calcRefsByName: {},
    nextIds: {
      keyPeriod: 1,
      index: 1,
      constant: 100, // Start at 100 so first constant is C1.1
      inputGroup: 1,
      input: 1,
      calculationGroup: 1,
      calculation: 1,
      tab: 1,
      module: 1,
      moduleCalc: 9001
    }
  }

  // Phase 1: Compile key periods (need to resolve anchors in dependency order)
  recipe.keyPeriods = compileKeyPeriods(spec.keyPeriods || [], context)

  // Phase 2: Compile indices
  recipe.indices = compileIndices(spec.indices || [], context)

  // Phase 3: Compile constants (into the special constants input group)
  const { constantsGroup, constantInputs, constantsReference } = compileConstants(spec.constants || [], context)
  recipe.inputGroups.push(constantsGroup)
  recipe.inputs.push(...constantInputs)
  recipe._constantsReference = constantsReference

  // Phase 4: Compile input groups and inputs
  const { groups, inputs } = compileInputs(spec.inputGroups || [], spec.inputs || [], context)
  recipe.inputGroups.push(...groups)
  recipe.inputs.push(...inputs)

  // Phase 5: Compile calculation groups and tabs
  const { calcGroups, tabs } = compileCalculationGroups(spec.calculationGroups || [], context)
  recipe.calculationGroups = calcGroups
  recipe.tabs = tabs

  // Phase 6: Compile calculations
  recipe.calculations = compileCalculations(spec.calculations || [], context)

  // Phase 7: Compile modules (with formula expansion)
  if (spec.modules && spec.modules.length > 0) {
    const moduleResult = compileModules(spec.modules, context)
    recipe.moduleGroups = moduleResult.moduleGroups
    recipe.moduleCalculations = moduleResult.moduleCalculations
    recipe.modules = moduleResult.modules
    recipe.mRefMap = moduleResult.mRefMap
    // Module-generated calcs with real formulas go into main calculations array
    if (moduleResult.expandedCalculations && moduleResult.expandedCalculations.length > 0) {
      recipe.calculations.push(...moduleResult.expandedCalculations)
    }
  }

  // Phase 8: Validate all formula references
  const validationErrors = validateFormulas(recipe, context)
  if (validationErrors.length > 0) {
    console.warn('\n=== Formula Validation Warnings ===')
    for (const err of validationErrors) {
      console.warn(`  ${err}`)
    }
    console.warn('===================================\n')
  }

  return recipe
}

/**
 * Validate that all formula references exist.
 * Returns array of error messages.
 */
function validateFormulas(recipe, context) {
  const errors = []

  // Build sets of valid refs
  const validRefs = new Set()

  // Key period flags (F1, F2, etc.) and their variants (.Start, .End, .M, .Q, .Y)
  for (const kp of recipe.keyPeriods) {
    const flag = kp.generates || `F${kp.id}`
    validRefs.add(flag)
    validRefs.add(`${flag}.Start`)
    validRefs.add(`${flag}.End`)
    validRefs.add(`${flag}.M`)
    validRefs.add(`${flag}.Q`)
    validRefs.add(`${flag}.Y`)
  }

  // Constants (C1.x)
  for (const input of recipe.inputs) {
    if (input.ref) validRefs.add(input.ref)
  }

  // Input groups (V1, S1, L1, etc.)
  for (const group of recipe.inputGroups) {
    if (group.ref) validRefs.add(group.ref)
  }

  // Calculations (R1, R2, etc.)
  for (const calc of recipe.calculations) {
    validRefs.add(`R${calc.id}`)
  }

  // Module calculations (R9001, etc.)
  for (const calc of recipe.moduleCalculations || []) {
    validRefs.add(`R${calc.id}`)
  }

  // Module outputs (M1.1, M1.2, etc.)
  for (const [mRef] of Object.entries(recipe.mRefMap || {})) {
    validRefs.add(mRef)
  }

  // Indices (I1, I2, etc.)
  for (const idx of recipe.indices || []) {
    validRefs.add(`I${idx.id}`)
  }

  // Time constants
  const timeConstants = ['T.MiY', 'T.DiY', 'T.DiM', 'T.QiY', 'T.HiD', 'T.HiY', 'T.MiQ', 'T.DiQ', 'T.QE', 'T.CYE', 'T.FYE']
  for (const tc of timeConstants) {
    validRefs.add(tc)
  }

  // Check each calculation formula (including module-expanded calcs)
  const allCalcs = [...recipe.calculations, ...(recipe.moduleCalculations || [])]
  for (const calc of allCalcs) {
    if (!calc.formula || calc.formula === '0') continue
    const refs = extractRefs(calc.formula)
    for (const ref of refs) {
      if (!validRefs.has(ref) && !isValidRef(ref, validRefs)) {
        errors.push(`R${calc.id} (${calc.name}): Unknown ref "${ref}" in formula: ${calc.formula}`)
      }
    }
  }

  return errors
}

/**
 * Extract all refs from a formula (R1, C1.2, F1, M1.2, etc.)
 */
function extractRefs(formula) {
  if (!formula) return []

  const refs = []

  // R-refs (R1, R10, R9001)
  const rRefs = formula.match(/R\d+/g) || []
  refs.push(...rRefs)

  // C-refs (C1.1, C1.19)
  const cRefs = formula.match(/C\d+\.\d+/g) || []
  refs.push(...cRefs)

  // V-refs (V1.1, V1.5)
  const vRefs = formula.match(/V\d+\.\d+/g) || []
  refs.push(...vRefs)

  // S-refs (S1.10, S2.1)
  const sRefs = formula.match(/S\d+\.\d+/g) || []
  refs.push(...sRefs)

  // L-refs (L1.1, L2.3)
  const lRefs = formula.match(/L\d+\.\d+/g) || []
  refs.push(...lRefs)

  // F-refs (F1, F2, F1.Start, F1.End, F1.M)
  const fRefs = formula.match(/F\d+(?:\.[A-Za-z]+)?/g) || []
  refs.push(...fRefs)

  // M-refs (M1.1, M5.7)
  const mRefs = formula.match(/M\d+\.\d+/g) || []
  refs.push(...mRefs)

  // I-refs (I1, I2)
  const iRefs = formula.match(/I\d+/g) || []
  refs.push(...iRefs)

  // T-refs (T.MiY, T.HiY)
  const tRefs = formula.match(/T\.[A-Za-z]+/g) || []
  refs.push(...tRefs)

  return [...new Set(refs)] // Dedupe
}

/**
 * Check if a ref pattern is valid even if not in the set
 * (e.g., V1 group refs, composite refs)
 */
function isValidRef(ref, validRefs) {
  // V/S/L group refs without the .id part (V1, S1, L1)
  if (/^[VSL]\d+$/.test(ref)) {
    return true // Group ref, valid if group exists
  }

  // Check if it's a valid pattern but just not registered
  // (e.g., dynamic refs that get resolved at runtime)
  return false
}

function compileProject(project) {
  return {
    name: project.name,
    type: project.type,
    currency: project.currency || 'AUD',
    financialYearEnd: project.financialYearEnd || 6
  }
}

function compileTimeline(timeline) {
  const start = parseDate(timeline.start)
  const end = parseDate(timeline.end)
  return {
    startYear: start.year,
    startMonth: start.month,
    endYear: end.year,
    endMonth: end.month
  }
}

function compileKeyPeriods(keyPeriods, context) {
  const compiled = []
  const flagCounter = { next: 1 }

  // First pass: assign IDs and flags, build lookup
  // IMPORTANT: ID must match flag number (F6 -> id: 6) for formula refs to work
  for (const kp of keyPeriods) {
    let flag = kp.flag
    let id = kp.id

    // If flag is specified, extract ID from it (F6 -> 6)
    if (flag && !id) {
      const match = flag.match(/^F(\d+)$/)
      if (match) {
        id = parseInt(match[1])
      }
    }

    // If no flag, auto-generate sequential
    if (!flag) {
      flag = `F${flagCounter.next}`
      id = id || flagCounter.next
      flagCounter.next++
    }

    // Default ID if still not set
    if (!id) {
      id = context.nextIds.keyPeriod++
    }

    const period = {
      id,
      name: kp.name,
      generates: flag,
      periods: parseDuration(kp.duration)
    }

    if (kp.isGroup) period.isGroup = true
    if (kp.parent) period.parentGroupId = null // Resolved in second pass
    if (kp.children) period.childIds = [] // Resolved in second pass

    context.keyPeriodsByFlag[flag] = period
    context.keyPeriodsByName[kp.name] = period
    compiled.push({ spec: kp, period })
  }

  // Second pass: resolve anchors and parent/child relationships
  for (const { spec, period } of compiled) {
    // Resolve start anchor
    if (spec.start) {
      if (spec.start === 'timeline.start') {
        period.startAnchor = 'timeline.start'
        period.startYear = context.timeline.startYear
        period.startMonth = context.timeline.startMonth
      } else if (spec.start.startsWith('after ')) {
        const targetFlag = spec.start.replace('after ', '')
        const target = context.keyPeriodsByFlag[targetFlag]
        if (!target) throw new Error(`Key period anchor not found: ${targetFlag}`)
        period.startAnchor = `${targetFlag}.End`
        period.startOffset = { value: 1, unit: 'months' }
      } else if (spec.start.startsWith('with ')) {
        const targetFlag = spec.start.replace('with ', '')
        const target = context.keyPeriodsByFlag[targetFlag]
        if (!target) throw new Error(`Key period anchor not found: ${targetFlag}`)
        period.startAnchor = `${targetFlag}.Start`
      }
    }

    // Resolve parent
    if (spec.parent) {
      const parent = context.keyPeriodsByFlag[spec.parent]
      if (!parent) throw new Error(`Parent key period not found: ${spec.parent}`)
      period.parentGroupId = parent.id
    }

    // Resolve children
    if (spec.children) {
      period.childIds = spec.children.map(childFlag => {
        const child = context.keyPeriodsByFlag[childFlag]
        if (!child) throw new Error(`Child key period not found: ${childFlag}`)
        return child.id
      })
    }
  }

  // Third pass: calculate dates using topological order
  const resolved = new Set()
  const result = []

  function resolveDates(period) {
    if (resolved.has(period.id)) return

    // If has anchor, resolve anchor first
    if (period.startAnchor && period.startAnchor !== 'timeline.start') {
      const match = period.startAnchor.match(/^(F\d+)\.(Start|End)$/)
      if (match) {
        const targetPeriod = context.keyPeriodsByFlag[match[1]]
        if (!targetPeriod) {
          console.warn(`Warning: Anchor target not found: ${match[1]} for period ${period.name}`)
          return
        }
        if (!resolved.has(targetPeriod.id)) {
          resolveDates(targetPeriod)
        }

        // Calculate start date from anchor
        if (match[2] === 'End') {
          if (!targetPeriod.endYear || !targetPeriod.endMonth) {
            console.warn(`Warning: Target period ${match[1]} has no end date for ${period.name}`)
            return
          }
          const end = { year: targetPeriod.endYear, month: targetPeriod.endMonth }
          const offset = period.startOffset?.value || 0
          const start = addMonths(end, offset)
          period.startYear = start.year
          period.startMonth = start.month
        } else {
          period.startYear = targetPeriod.startYear
          period.startMonth = targetPeriod.startMonth
        }
      }
    }

    // Calculate end date
    if (period.startYear && period.startMonth && period.periods) {
      const end = calculateEndDate(
        { year: period.startYear, month: period.startMonth },
        period.periods
      )
      period.endYear = end.year
      period.endMonth = end.month
    }

    resolved.add(period.id)
    result.push(period)
  }

  for (const { period } of compiled) {
    resolveDates(period)
  }

  return result
}

function compileIndices(indices, context) {
  return indices.map((idx, i) => ({
    id: idx.id || context.nextIds.index++,
    name: idx.name,
    ref: `I${idx.id || i + 1}`,
    rate: idx.rate,
    period: 'annual',
    startYear: idx.startYear || context.timeline.startYear
  }))
}

function compileConstants(constants, context) {
  const constantsGroup = {
    id: 100,
    name: 'Constants',
    ref: 'C1',
    refIndex: 1,
    mode: 'constant',
    entryMode: 'constant',
    groupType: 'combined'
  }

  const constantInputs = []
  const constantsReference = {}

  for (const c of constants) {
    // Skip comment-only entries
    if (c._comment && !c.name) continue

    const id = c.id || context.nextIds.constant++
    const refNum = id - 99 // C1.1 = id 100, C1.2 = id 101, etc.
    const ref = `C1.${refNum}`

    constantInputs.push({
      id,
      groupId: 100,
      name: c.name,
      ref,
      value: c.value,
      unit: c.unit || '',
      entryMode: 'constant'
    })

    constantsReference[ref] = {
      id,
      name: c.name
    }

    // Build symbol map: sanitized name -> ref
    // "Power Capacity (MW)" -> "PowerCapacityMW" -> C1.1
    const sanitizedName = c.name.replace(/[^a-zA-Z0-9]/g, '')
    context.constantRefsByName[sanitizedName] = ref

    // Also add shorthand versions
    // "Power Capacity (MW)" -> "PowerCapacity" (without unit)
    const shortName = c.name.replace(/\s*\([^)]*\)\s*/g, '').replace(/[^a-zA-Z0-9]/g, '')
    if (shortName !== sanitizedName) {
      context.constantRefsByName[shortName] = ref
    }
  }

  return { constantsGroup, constantInputs, constantsReference }
}

function compileInputs(inputGroups, inputs, context) {
  const groups = []
  const compiledInputs = []
  const refIndexCounters = { values: 1, series: 1, lookup: 1 }

  for (const group of inputGroups) {
    const id = group.id || context.nextIds.inputGroup++
    const mode = group.mode
    const refIndex = refIndexCounters[mode]++
    const prefix = mode === 'values' ? 'V' : mode === 'series' ? 'S' : 'L'
    const ref = `${prefix}${refIndex}`

    const compiledGroup = {
      id,
      name: group.name,
      ref,
      refIndex,
      mode,
      frequency: group.frequency || 'M',
      groupType: 'combined',
      entryMode: group.entryMode || 'constant'
    }

    // Link to key period if specified - copy dates and periods
    if (group.linkedPeriod) {
      const kp = context.keyPeriodsByFlag[group.linkedPeriod]
      if (!kp) throw new Error(`Linked key period not found: ${group.linkedPeriod}`)
      compiledGroup.linkedKeyPeriodId = String(kp.id)

      // Copy key period's dates and duration to input group
      compiledGroup.periods = kp.periods
      compiledGroup.startYear = kp.startYear
      compiledGroup.startMonth = kp.startMonth
      compiledGroup.endYear = kp.endYear
      compiledGroup.endMonth = kp.endMonth

      // For series mode, also set lookup dates
      if (mode === 'series') {
        compiledGroup.lookupStartYear = kp.startYear
        compiledGroup.lookupStartMonth = kp.startMonth
        compiledGroup.lookupEndYear = kp.endYear
        compiledGroup.lookupEndMonth = kp.endMonth
        compiledGroup.entryMode = 'series'
      }
    }

    context.inputGroupsByName[group.name] = compiledGroup
    groups.push(compiledGroup)
  }

  // Compile individual inputs
  for (const input of inputs) {
    const group = context.inputGroupsByName[input.group]
    if (!group) throw new Error(`Input group not found: ${input.group}`)

    const id = input.id || context.nextIds.input++
    const ref = `${group.ref}.${id}`

    compiledInputs.push({
      id,
      groupId: group.id,
      name: input.name,
      ref,
      value: input.value,
      values: input.values,
      unit: input.unit || '',
      entryMode: input.entryMode || 'constant'
    })

    // Build symbol map for inputs
    const sanitizedName = input.name.replace(/[^a-zA-Z0-9]/g, '')
    context.inputRefsByName[sanitizedName] = ref
  }

  return { groups, inputs: compiledInputs }
}

function compileCalculationGroups(calcGroups, context) {
  const groups = []
  const tabs = []

  for (const group of calcGroups) {
    // Ensure tab exists
    let tab = context.tabsByName[group.tab]
    if (!tab) {
      tab = {
        id: context.nextIds.tab++,
        name: group.tab
      }
      context.tabsByName[group.tab] = tab
      tabs.push(tab)
    }

    const id = group.id || context.nextIds.calculationGroup++
    const compiledGroup = {
      id,
      name: group.name,
      tabId: tab.id
    }

    context.calculationGroupsByName[group.name] = compiledGroup
    groups.push(compiledGroup)
  }

  return { calcGroups: groups, tabs }
}

/**
 * Translate symbolic references in a formula to actual refs.
 * Supports: {ConstantName}, {InputName}, {CalcName}
 */
function translateFormula(formula, context) {
  if (!formula) return formula

  // Replace {Name} with actual ref
  return formula.replace(/\{([^}]+)\}/g, (match, name) => {
    // Check constants
    if (context.constantRefsByName[name]) {
      return context.constantRefsByName[name]
    }
    // Check inputs
    if (context.inputRefsByName[name]) {
      return context.inputRefsByName[name]
    }
    // Check calculations (for cross-references)
    if (context.calcRefsByName[name]) {
      return context.calcRefsByName[name]
    }
    // Not found - return original (will cause runtime error, easier to debug)
    console.warn(`Warning: Unknown symbol in formula: ${name}`)
    return match
  })
}

function compileCalculations(calculations, context) {
  // Filter out comment-only entries (no name/formula)
  const realCalcs = calculations.filter(c => c.name && c.formula)

  // First pass: build calc refs by name and track max ID used
  let maxId = 0
  const firstPassCounter = { next: context.nextIds.calculation }
  for (const calc of realCalcs) {
    const id = calc.id || firstPassCounter.next++
    const name = calc.name.replace(/[^a-zA-Z0-9]/g, '') // Sanitize name
    context.calcRefsByName[name] = `R${id}`
    if (id > maxId) maxId = id
  }

  // Second pass: actual compilation (using same ID logic)
  const secondPassCounter = { next: context.nextIds.calculation }
  const compiled = realCalcs.map(calc => {
    const group = context.calculationGroupsByName[calc.group]
    if (!group) throw new Error(`Calculation group not found: ${calc.group}`)

    const id = calc.id || secondPassCounter.next++

    // Translate symbolic refs in formula
    const translatedFormula = translateFormula(calc.formula, context)

    const entry = {
      id,
      groupId: group.id,
      name: calc.name,
      formula: translatedFormula,
      type: calc.type || 'flow'
    }

    // Optional metadata (for recipe, stripped when generating model files)
    if (calc.sign) entry.sign = calc.sign
    if (calc.financialStatement) entry.financialStatement = calc.financialStatement
    if (calc._comment) entry._comment = calc._comment

    return entry
  })

  // Set nextIds.calculation to one past the max ID used, so modules continue from there
  context.nextIds.calculation = maxId + 1

  return compiled
}

/**
 * Build a self-reference map: { output_key: 'R123', ... }
 */
function buildSelfRefMap(outputs, startId) {
  const map = {}
  let id = startId
  for (const out of outputs) {
    map[out.key] = `R${id}`
    id++
  }
  return map
}

/**
 * Substitute placeholders in a formula template.
 *
 * Handles:
 *   $input.X.Suffix  → inputValue + ".Suffix" (e.g., "F2.Start")
 *   $input.X         → inputValue (e.g., "R112", "C1.24")
 *   $self.Y          → R-ref of output Y in this module
 *   $MN.key          → R-ref from cross-module map
 *   M_SELF.N         → this module's own M-ref (for solver)
 */
function substituteFormula(formula, inputs, selfRefMap, crossModuleRefs, moduleIndex) {
  if (!formula) return formula

  let result = formula

  // 1. $input.X.Suffix (with dot suffix like .Start, .End, .M, .Q, .Y)
  result = result.replace(/\$input\.([a-zA-Z_][a-zA-Z0-9_]*)\.(Start|End|M|Q|Y)/g, (match, key, suffix) => {
    const val = inputs[key]
    if (val === undefined) {
      console.warn(`Warning: Unknown module input: ${key} in formula`)
      return match
    }
    return `${val}.${suffix}`
  })

  // 2. $input.X (plain input ref)
  result = result.replace(/\$input\.([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, key) => {
    const val = inputs[key]
    if (val === undefined) {
      console.warn(`Warning: Unknown module input: ${key} in formula`)
      return match
    }
    return String(val)
  })

  // 3. $self.Y (intra-module cross-ref)
  result = result.replace(/\$self\.([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, key) => {
    const ref = selfRefMap[key]
    if (!ref) {
      console.warn(`Warning: Unknown $self ref: ${key}`)
      return match
    }
    return ref
  })

  // 4. $MN.key (cross-module ref)
  result = result.replace(/\$M(\d+)\.([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, modIdx, key) => {
    const lookupKey = `M${modIdx}.${key}`
    const ref = crossModuleRefs[lookupKey]
    if (!ref) {
      console.warn(`Warning: Unknown cross-module ref: ${lookupKey}`)
      return match
    }
    return ref
  })

  // 5. M_SELF.N (solver self-ref)
  result = result.replace(/M_SELF\.(\d+)/g, (match, n) => {
    return `M${moduleIndex}.${n}`
  })

  return result
}

function compileModules(modules, context) {
  const moduleGroups = []
  const moduleCalculations = [] // For backward compat (legacy format)
  const expandedCalculations = [] // New: real formulas go here
  const compiledModules = []
  const mRefMap = {}

  // Cross-module ref map: "M2.gst_amount" -> "R125"
  const crossModuleRefs = {}

  // ========= PASS 1: ID Assignment =========
  // Assign sequential IDs to all module outputs, build ref maps
  const moduleData = [] // { mod, moduleId, groupId, outputs, extraCalcs, selfRefMap, calcIds, startId }

  for (const mod of modules) {
    const moduleId = mod.id || context.nextIds.module++

    // Create a group for this module's calculations
    const groupId = context.nextIds.calculationGroup++
    const tabId = mod.tab ? (context.tabsByName[mod.tab]?.id || 1) : 1

    moduleGroups.push({
      id: groupId,
      tabId,
      name: mod.name,
      _isModuleGroup: true,
      templateId: mod.template
    })

    // Translate symbolic refs in module inputs
    const translatedInputs = {}
    for (const [key, value] of Object.entries(mod.inputs || {})) {
      if (typeof value === 'string') {
        translatedInputs[key] = translateFormula(value, context)
      } else {
        translatedInputs[key] = value
      }
    }

    // Get template outputs with formulas
    let outputs
    try {
      outputs = getTemplateFormulas(mod.template, translatedInputs)
    } catch (e) {
      // Fallback for unknown templates: use old getTemplateOutputs
      console.warn(`Warning: ${e.message}, using placeholder formulas`)
      outputs = getTemplateOutputs(mod.template).map(o => ({
        ...o,
        formula: '0'
      }))
    }

    // Process extraCalculations (custom calcs defined in spec, prepended to outputs)
    const extraCalcs = (mod.extraCalculations || []).map(ec => ({
      key: ec.key,
      name: ec.name || ec.key,
      type: ec.type || 'flow',
      formula: ec.formula,
      description: ec.description
    }))

    // Assign sequential IDs: extraCalcs first, then template outputs
    const allOutputs = [...extraCalcs, ...outputs]
    const startId = context.nextIds.calculation
    context.nextIds.calculation += allOutputs.length

    const selfRefMap = buildSelfRefMap(allOutputs, startId)
    const calcIds = allOutputs.map((_, i) => startId + i)

    // Build cross-module ref map for this module
    for (const out of allOutputs) {
      crossModuleRefs[`M${moduleId}.${out.key}`] = selfRefMap[out.key]
    }

    // Build M-ref map (positional: M1.1, M1.2, etc.)
    for (let i = 0; i < allOutputs.length; i++) {
      mRefMap[`M${moduleId}.${i + 1}`] = `R${calcIds[i]}`
    }

    // Also register R-refs in calc context for formula validation
    for (const calcId of calcIds) {
      context.calcRefsByName[`ModCalc${calcId}`] = `R${calcId}`
    }

    moduleData.push({
      mod,
      moduleId,
      groupId,
      tabId,
      outputs: allOutputs,
      translatedInputs,
      selfRefMap,
      calcIds,
      startId
    })
  }

  // ========= PASS 2: Formula Substitution =========
  for (let mIdx = 0; mIdx < moduleData.length; mIdx++) {
    const { mod, moduleId, groupId, outputs, translatedInputs, selfRefMap, calcIds } = moduleData[mIdx]

    for (let i = 0; i < outputs.length; i++) {
      const out = outputs[i]
      const calcId = calcIds[i]

      // Substitute all placeholders
      let formula = substituteFormula(
        out.formula,
        translatedInputs,
        selfRefMap,
        crossModuleRefs,
        moduleId
      )

      // Translate any remaining {SymbolicName} refs
      formula = translateFormula(formula, context)

      const calc = {
        id: calcId,
        groupId,
        name: `${mod.name}: ${out.name}`,
        formula,
        type: out.type || 'flow',
        _moduleId: `M${moduleId}`,
        _moduleOutputKey: out.key
      }
      if (out.description) calc.description = out.description
      if (out.isSolver) calc.isSolver = true

      expandedCalculations.push(calc)
    }

    compiledModules.push({
      id: moduleId,
      templateId: mod.template,
      name: mod.name,
      inputs: translatedInputs,
      outputs: outputs.map((o, i) => ({
        key: o.key,
        calcId: calcIds[i]
      })),
      calcIds,
      enabled: mod.enabled !== false,
      fullyConverted: true
    })
  }

  return { moduleGroups, moduleCalculations, expandedCalculations, modules: compiledModules, mRefMap }
}

/**
 * Get output definitions for a module template
 */
function getTemplateOutputs(templateId) {
  const templates = {
    debt_manager: [
      { key: 'opening', name: 'Opening Balance', type: 'stock_start' },
      { key: 'drawdown', name: 'Drawdown', type: 'flow' },
      { key: 'interest', name: 'Interest', type: 'flow' },
      { key: 'principal', name: 'Principal Repayment', type: 'flow' },
      { key: 'closing', name: 'Closing Balance', type: 'stock' }
    ],
    depreciation: [
      { key: 'opening', name: 'Opening', type: 'stock_start' },
      { key: 'addition', name: 'Addition', type: 'flow' },
      { key: 'charge', name: 'Depreciation Charge', type: 'flow' },
      { key: 'accumulated', name: 'Accumulated', type: 'stock' },
      { key: 'closing', name: 'Closing NBV', type: 'stock' }
    ],
    tax: [
      { key: 'taxable_income_before_losses', name: 'Taxable Income Before Losses', type: 'flow' },
      { key: 'losses_opening', name: 'Losses Opening', type: 'stock_start' },
      { key: 'losses_generated', name: 'Losses Generated', type: 'flow' },
      { key: 'losses_utilised', name: 'Losses Utilised', type: 'flow' },
      { key: 'losses_closing', name: 'Losses Closing', type: 'stock' },
      { key: 'net_taxable_income', name: 'Net Taxable Income', type: 'flow' },
      { key: 'tax_payable', name: 'Tax Payable', type: 'flow' }
    ],
    working_capital: [
      { key: 'receivables', name: 'Receivables', type: 'stock' },
      { key: 'payables', name: 'Payables', type: 'stock' },
      { key: 'change', name: 'Working Capital Change', type: 'flow' }
    ],
    iterative_debt_sizing: [
      { key: 'opening', name: 'Opening Balance', type: 'stock_start' },
      { key: 'drawdown', name: 'Drawdown', type: 'flow' },
      { key: 'interest', name: 'Interest', type: 'flow' },
      { key: 'principal', name: 'Principal Repayment', type: 'flow' },
      { key: 'closing', name: 'Closing Balance', type: 'stock' },
      { key: 'dscr', name: 'DSCR', type: 'ratio' }
    ],
    dsrf: [
      { key: 'target', name: 'DSRF Target', type: 'stock' },
      { key: 'opening', name: 'Opening Balance', type: 'stock_start' },
      { key: 'funding', name: 'Funding', type: 'flow' },
      { key: 'release', name: 'Release', type: 'flow' },
      { key: 'closing', name: 'Closing Balance', type: 'stock' }
    ],
    mra: [
      { key: 'target', name: 'MRA Target', type: 'stock' },
      { key: 'opening', name: 'Opening Balance', type: 'stock_start' },
      { key: 'funding', name: 'Funding', type: 'flow' },
      { key: 'drawdown', name: 'Drawdown', type: 'flow' },
      { key: 'closing', name: 'Closing Balance', type: 'stock' }
    ],
    equity_bridge: [
      { key: 'opening', name: 'Opening', type: 'stock_start' },
      { key: 'injection', name: 'Injection', type: 'flow' },
      { key: 'distribution', name: 'Distribution', type: 'flow' },
      { key: 'closing', name: 'Closing', type: 'stock' }
    ]
  }

  return templates[templateId] || [
    { key: 'output', name: 'Output', type: 'flow' }
  ]
}

export default compileSpec
