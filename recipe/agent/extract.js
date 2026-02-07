/**
 * Extract a recipe from existing model files.
 * Reads model-inputs.json, model-calculations.json, model-modules.json
 * and produces a recipe.json with all sections.
 */
import { promises as fs } from 'fs'
import path from 'path'

const GROUP_PREFIX_MAP = {
  constant: 'C',
  values: 'V',
  series: 'S',
  lookup: 'L'
}

/**
 * Infer startAnchor from key period linking fields
 */
function inferStartAnchor(kp, allKeyPeriods) {
  if (!kp.startLinkedToPeriodId || kp.startLinkedToPeriodId === 'default') {
    return 'timeline.start'
  }
  const linkedId = typeof kp.startLinkedToPeriodId === 'string'
    ? parseInt(kp.startLinkedToPeriodId)
    : kp.startLinkedToPeriodId
  if (kp.startLinkToEnd) {
    return `F${linkedId}.End`
  }
  return `F${linkedId}.Start`
}

/**
 * Infer financial statement & category from group name
 */
function inferFinancialContext(calc, groups) {
  const group = groups.find(g => g.id === calc.groupId)
  if (!group) return {}
  const gn = group.name.toLowerCase()
  const result = {}

  // Financial statement
  if (['assets', 'liabilities', 'equity', 'b/s check'].some(s => gn.includes(s))) {
    result.financialStatement = 'bs'
  } else if (['operating cf', 'investing cf', 'financing cf', 'cash position', 'free cash flow'].some(s => gn.includes(s))) {
    result.financialStatement = 'cf'
  } else if (['profitability', 'd&a', 'tax', 'working capital'].some(s => gn.includes(s))) {
    result.financialStatement = 'pnl'
  } else if (['s&u', 'operations debt', 'covenants', 'equity irr', 'dividends', 'sc repayment', 'profit tests'].some(s => gn.includes(s))) {
    result.financialStatement = 'funding'
  }

  // Category
  if (gn.includes('revenue')) result.category = 'revenue'
  else if (gn.includes('opex')) result.category = 'opex'
  else if (gn.includes('d&a') || gn.includes('depreciation')) result.category = 'depreciation'
  else if (gn.includes('tax')) result.category = 'tax'
  else if (gn.includes('debt') || gn.includes('operations debt')) result.category = 'debt'
  else if (gn.includes('assets')) result.category = 'assets'
  else if (gn.includes('liabilities')) result.category = 'liabilities'
  else if (gn.includes('equity')) result.category = 'equity'
  else if (gn.includes('check')) result.category = 'check'
  else if (gn.includes('valuation') || gn.includes('discount')) result.category = 'valuation'
  else if (gn.includes('maintenance')) result.category = 'maintenance'
  else if (gn.includes('technical')) result.category = 'technical'
  else if (gn.includes('cf waterfall') || gn.includes('p&l')) result.category = 'reporting'

  // Sign convention inference
  const cn = calc.name.toLowerCase()
  const formula = calc.formula || ''
  if (result.category === 'revenue' || cn.includes('revenue') || cn.includes('income')) {
    result.sign = 'positive'
  } else if (result.category === 'opex' || cn.includes('expense') || cn.includes('opex')) {
    result.sign = 'negative'
  } else if (cn.includes('repayment') || cn.includes('interest paid') || cn.includes('fee')) {
    result.sign = 'negative'
  } else if (formula.startsWith('-')) {
    result.sign = 'negative'
  }

  return result
}

/**
 * Build input ref string from group and input
 */
function buildInputRef(input, group) {
  const mode = group.groupType === 'constant' ? 'constant'
    : group.entryMode || 'values'
  const prefix = GROUP_PREFIX_MAP[mode] || GROUP_PREFIX_MAP[group.groupType] || 'V'
  const refIndex = group.refIndex || 1
  const inputNum = group.id === 100 ? input.id - 99 : input.id
  return `${prefix}${refIndex}.${inputNum}`
}

/**
 * Build module M-ref prefix from _mRefMap
 */
function inferModuleMRefPrefix(module, mRefMap) {
  if (!mRefMap) return null
  // Find first key matching this module's calc IDs
  const calcIds = module.calcIds || []
  for (const [mRef, rRef] of Object.entries(mRefMap)) {
    const rId = parseInt(rRef.replace('R', ''))
    if (calcIds.includes(rId)) {
      return mRef.split('.')[0] // e.g. "M2"
    }
  }
  return null
}

/**
 * Extract recipe from model data files
 */
export async function extractRecipe(dataDir) {
  const [inputsRaw, calcsRaw, modulesRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, 'model-inputs.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'model-calculations.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'model-modules.json'), 'utf-8')
  ])

  const inputs = JSON.parse(inputsRaw)
  const calcs = JSON.parse(calcsRaw)
  const modules = JSON.parse(modulesRaw)

  const config = inputs.config
  const keyPeriods = inputs.keyPeriods || []
  const indices = inputs.indices || []
  const inputGlassGroups = inputs.inputGlassGroups || []
  const inputGlass = inputs.inputGlass || []
  const calculations = calcs.calculations || []
  const calculationsGroups = calcs.calculationsGroups || []
  const calculationsTabs = calcs.calculationsTabs || []
  const moduleGroups = modules.moduleGroups || []
  const moduleCalculations = modules.moduleCalculations || []
  const modulesList = modules.modules || []
  const mRefMap = modules._mRefMap || {}

  // --- Project ---
  const recipe = {
    project: {
      name: 'BESS Project Finance Model',
      type: 'BESS',
      currency: 'AUD',
      financialYearEnd: 6
    },

    // --- Timeline ---
    timeline: {
      startYear: config.startYear,
      startMonth: config.startMonth,
      endYear: config.endYear,
      endMonth: config.endMonth
    },

    // --- Key Periods ---
    keyPeriods: keyPeriods.map(kp => {
      const entry = {
        id: kp.id,
        name: kp.name,
        generates: `F${kp.id}`
      }

      if (kp.periodsFromRef) {
        entry.periodsFromRef = kp.periodsFromRef
      }
      entry.periods = kp.periods

      entry.startAnchor = inferStartAnchor(kp, keyPeriods)
      if (kp.startLinkOffset && (kp.startLinkOffset.value !== 0 || kp.startLinkOffset.unit !== 'months')) {
        if (kp.startLinkOffset.value !== 0) {
          entry.startOffset = kp.startLinkOffset
        }
      } else if (kp.startLinkedToPeriodId && kp.startLinkToEnd && kp.startLinkOffset?.value === 1) {
        entry.startOffset = { value: 1, unit: 'months' }
      }

      // Computed dates (for reference / verification)
      entry.startYear = kp.startYear
      entry.startMonth = kp.startMonth
      entry.endYear = kp.endYear
      entry.endMonth = kp.endMonth

      // Group structure
      if (kp.isGroup) {
        entry.isGroup = true
        entry.childIds = kp.childIds
      }
      if (kp.parentGroupId) {
        entry.parentGroupId = kp.parentGroupId
      }

      return entry
    }),

    // --- Indices ---
    indices: indices.map(idx => ({
      id: idx.id,
      name: idx.name,
      ref: `I${idx.id}`,
      rate: idx.indexationRate,
      period: idx.indexationPeriod,
      startYear: idx.indexationStartYear,
      startMonth: idx.indexationStartMonth
    })),

    // --- Input Groups ---
    inputGroups: inputGlassGroups.map(group => {
      const mode = group.groupType === 'constant' ? 'constant'
        : group.entryMode || 'values'
      const prefix = GROUP_PREFIX_MAP[mode] || GROUP_PREFIX_MAP[group.groupType] || 'V'
      const refIndex = group.refIndex || 1

      const entry = {
        id: group.id,
        name: group.name,
        ref: `${prefix}${refIndex}`,
        refIndex: group.refIndex,
        mode: mode,
        frequency: group.frequency || 'M'
      }

      if (group.linkedKeyPeriodId) {
        entry.linkedKeyPeriodId = group.linkedKeyPeriodId
      }
      if (group.groupType) entry.groupType = group.groupType
      if (group.entryMode) entry.entryMode = group.entryMode
      if (group.subgroups?.length) entry.subgroups = group.subgroups
      if (group.selectedIndices) entry.selectedIndices = group.selectedIndices
      if (group.selectedInputIds) entry.selectedInputIds = group.selectedInputIds
      if (group.showSelected !== undefined) entry.showSelected = group.showSelected

      // Date range
      entry.startYear = group.startYear
      entry.startMonth = group.startMonth
      entry.endYear = group.endYear
      entry.endMonth = group.endMonth

      if (group.lookupStartYear) {
        entry.lookupStartYear = group.lookupStartYear
        entry.lookupStartMonth = group.lookupStartMonth
        entry.lookupEndYear = group.lookupEndYear
        entry.lookupEndMonth = group.lookupEndMonth
      }

      return entry
    }),

    // --- Inputs ---
    inputs: inputGlass.map(input => {
      const group = inputGlassGroups.find(g => g.id === input.groupId)
      const entry = {
        id: input.id,
        groupId: input.groupId,
        name: input.name,
        ref: group ? buildInputRef(input, group) : undefined
      }

      if (input.subgroupId) entry.subgroupId = input.subgroupId
      if (input.inputId) entry.inputId = input.inputId
      if (input.mode) entry.mode = input.mode
      if (input.value !== undefined) entry.value = input.value
      if (input.values && Object.keys(input.values).length > 0) entry.values = input.values
      if (input.unit) entry.unit = input.unit
      if (input.timePeriod) entry.timePeriod = input.timePeriod
      if (input.escalation) entry.escalation = input.escalation
      if (input.total !== undefined) entry.total = input.total
      if (input.spreadMethod) entry.spreadMethod = input.spreadMethod
      if (input.seriesStartDate) entry.seriesStartDate = input.seriesStartDate
      if (input.seriesEndDate) entry.seriesEndDate = input.seriesEndDate
      if (input.description) entry.description = input.description

      return entry
    }),

    // --- Tabs ---
    tabs: calculationsTabs.map(tab => ({
      id: tab.id,
      name: tab.name
    })),

    // --- Calculation Groups ---
    calculationGroups: calculationsGroups.map(group => {
      const entry = {
        id: group.id,
        tabId: group.tabId,
        name: group.name
      }
      if (group.startYear) entry.startYear = group.startYear
      if (group.startMonth) entry.startMonth = group.startMonth
      if (group.endYear) entry.endYear = group.endYear
      if (group.endMonth) entry.endMonth = group.endMonth
      return entry
    }),

    // --- Calculations (non-module) ---
    calculations: calculations.map(calc => {
      const context = inferFinancialContext(calc, calculationsGroups)
      const entry = {
        id: calc.id,
        groupId: calc.groupId,
        name: calc.name,
        formula: calc.formula
      }
      if (calc.tabId) entry.tabId = calc.tabId
      if (calc.description) entry.description = calc.description
      if (calc.type) entry.type = calc.type
      if (context.sign) entry.sign = context.sign
      if (context.financialStatement) entry.financialStatement = context.financialStatement
      if (context.category) entry.category = context.category

      // Add validation for key check rows
      if (calc.id === 195) {
        entry.validation = { rule: 'allZero', threshold: 0.01 }
      }
      if (calc.id === 69) {
        entry.validation = { rule: 'allZero', threshold: 0.01 }
      }

      return entry
    }),

    // --- Module Groups ---
    moduleGroups: moduleGroups.map(mg => ({
      id: mg.id,
      tabId: mg.tabId,
      name: mg.name,
      templateId: mg._moduleTemplateId
    })),

    // --- Module Calculations ---
    moduleCalculations: moduleCalculations.map(mc => {
      const context = inferFinancialContext(mc, [...calculationsGroups, ...moduleGroups])
      const entry = {
        id: mc.id,
        groupId: mc.groupId,
        name: mc.name,
        formula: mc.formula,
        moduleId: mc._moduleId,
        moduleOutputKey: mc._moduleOutputKey
      }
      if (mc.type) entry.type = mc.type
      if (mc.description) entry.description = mc.description
      if (context.sign) entry.sign = context.sign
      if (context.financialStatement) entry.financialStatement = context.financialStatement
      if (context.category) entry.category = context.category
      return entry
    }),

    // --- Modules ---
    modules: modulesList.map(mod => {
      const mRefPrefix = inferModuleMRefPrefix(mod, mRefMap)
      const entry = {
        id: mod.id,
        templateId: mod.templateId,
        name: mod.name,
        mRefPrefix: mRefPrefix,
        inputs: mod.inputs
      }
      if (mod.description) entry.description = mod.description
      if (mod.category) entry.category = mod.category
      if (mod.outputs?.length) entry.outputs = mod.outputs
      if (mod.calcIds) entry.calcIds = mod.calcIds
      if (mod.enabled !== undefined) entry.enabled = mod.enabled
      if (mod.fullyConverted) entry.fullyConverted = true
      if (mod.partiallyConverted) entry.partiallyConverted = true
      if (mod.solvedAt) entry.solvedAt = mod.solvedAt
      return entry
    }),

    // --- M-Ref Map ---
    mRefMap: mRefMap,

    // --- Validation Rules ---
    validation: {
      balanceSheet: {
        checkRef: 'R195',
        rule: 'allZero',
        threshold: 0.01
      },
      sourcesAndUses: {
        checkRef: 'R69',
        rule: 'allZero',
        threshold: 0.01
      },
      formulaIntegrity: {
        noHardcodedNumbers: true,
        allRefsExist: true,
        noCircularDeps: true
      },
      covenants: [
        { name: 'Min DSCR', ref: 'R9071', rule: 'minValue', threshold: 1.0, period: 'F8' }
      ],
      irr: [
        { name: 'Equity IRR', cashFlowRef: 'R137', expectedRange: [0.08, 0.25] }
      ]
    },

    // --- Best Practice Rules ---
    bestPractices: {
      signConvention: {
        enabled: true,
        rules: [
          { category: 'revenue', expectedSign: 'positive' },
          { category: 'opex', expectedSign: 'negative' },
          { category: 'depreciation', expectedSign: 'negative' }
        ]
      },
      corkscrewPattern: {
        enabled: true,
        requiredFor: ['bs']
      },
      noMixing: {
        enabled: true,
        description: 'No hardcoded business values in formulas'
      },
      units: {
        enabled: true,
        description: 'Every input should have a unit'
      }
    }
  }

  return recipe
}

/**
 * Convert a recipe to spec format with symbolic refs.
 * Replaces C1.X refs with {ConstantName} in formulas.
 */
export function recipeToSpec(recipe) {
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  function fmtDate(year, month) {
    return `${MONTH_NAMES[(month || 1) - 1]} ${year}`
  }

  // Build constant ref -> symbolic name map from inputs
  const constRefToName = {}
  const constants = (recipe.inputs || []).filter(i => i.groupId === 100)
  for (const c of constants) {
    if (c.ref) {
      // Clean name for use as symbolic ref (remove spaces, special chars)
      const symName = c.name.replace(/[^a-zA-Z0-9]/g, '')
      constRefToName[c.ref] = symName
    }
  }

  // Build input ref -> symbolic name map for non-constant inputs
  const inputRefToName = {}
  for (const inp of (recipe.inputs || [])) {
    if (inp.groupId !== 100 && inp.ref) {
      const symName = inp.name.replace(/[^a-zA-Z0-9]/g, '')
      inputRefToName[inp.ref] = symName
    }
  }

  // Replace constant refs in formula with {SymbolicName}
  function symbolizeFormula(formula) {
    if (!formula) return formula
    let result = formula
    // Sort by ref length (longest first) to avoid partial matches
    const entries = Object.entries(constRefToName).sort((a, b) => b[0].length - a[0].length)
    for (const [ref, name] of entries) {
      // Replace whole-word occurrences of the ref
      const escaped = ref.replace('.', '\\.')
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'g'), `{${name}}`)
    }
    return result
  }

  const spec = {
    project: recipe.project,

    timeline: {
      start: fmtDate(recipe.timeline.startYear, recipe.timeline.startMonth),
      end: fmtDate(recipe.timeline.endYear, recipe.timeline.endMonth)
    },

    keyPeriods: recipe.keyPeriods
      .filter(kp => !kp.parentGroupId) // Top-level only for spec simplicity
      .map(kp => {
        const entry = {
          name: kp.name,
          flag: kp.generates || `F${kp.id}`,
          duration: `${kp.periods} months`
        }
        if (kp.startAnchor) {
          if (kp.startAnchor === 'timeline.start') {
            entry.start = 'timeline.start'
          } else {
            entry.start = `after ${kp.startAnchor.replace('.End', '').replace('.Start', '')}`
          }
        }
        if (kp.isGroup && kp.childIds) {
          entry.children = kp.childIds
        }
        return entry
      }),

    indices: (recipe.indices || []).map(idx => ({
      id: idx.id,
      name: idx.name,
      rate: idx.rate,
      startYear: idx.startYear
    })),

    constants: constants.map(c => {
      const entry = {
        name: c.name.replace(/[^a-zA-Z0-9]/g, ''),
        value: c.value
      }
      if (c.unit) entry._comment = c.unit
      return entry
    }),

    inputGroups: (recipe.inputGroups || [])
      .filter(g => g.groupType !== 'constant')
      .map(g => {
        const entry = {
          id: g.id,
          name: g.name,
          mode: g.mode
        }
        if (g.frequency) entry.frequency = g.frequency
        if (g.linkedKeyPeriodId) entry.linkedPeriod = `F${g.linkedKeyPeriodId}`
        return entry
      }),

    inputs: (recipe.inputs || [])
      .filter(i => i.groupId !== 100)
      .map(inp => {
        const group = (recipe.inputGroups || []).find(g => g.id === inp.groupId)
        const entry = {
          id: inp.id,
          name: inp.name,
          group: group?.name || `Group${inp.groupId}`
        }
        if (inp.value !== undefined) entry.value = inp.value
        if (inp.unit) entry.unit = inp.unit
        return entry
      }),

    calculationGroups: (recipe.calculationGroups || []).map(g => {
      const tab = (recipe.tabs || []).find(t => t.id === g.tabId)
      return {
        id: g.id,
        name: g.name,
        tab: tab?.name || `Tab${g.tabId}`
      }
    }),

    calculations: (recipe.calculations || []).map(calc => {
      const group = (recipe.calculationGroups || []).find(g => g.id === calc.groupId)
      const entry = {
        id: calc.id,
        name: calc.name,
        formula: symbolizeFormula(calc.formula),
        group: group?.name || undefined,
        type: calc.type
      }
      return entry
    }),

    modules: (recipe.modules || []).map(mod => ({
      templateId: mod.templateId,
      name: mod.name,
      inputs: mod.inputs,
      ...(mod.enabled === false ? { enabled: false } : {})
    })),

    validation: {
      balanceSheetTolerance: 0.01
    }
  }

  return spec
}

/**
 * CLI entry point
 */
export async function runExtract(dataDir, outputPath, options = {}) {
  const recipe = await extractRecipe(dataDir)

  if (options.format === 'spec') {
    const spec = recipeToSpec(recipe)
    const json = JSON.stringify(spec, null, 2)
    await fs.writeFile(outputPath, json, 'utf-8')
    console.log(`Spec extracted to ${outputPath}`)
    console.log(`  ${spec.keyPeriods.length} key periods`)
    console.log(`  ${spec.constants.length} constants`)
    console.log(`  ${spec.calculations.length} calculations`)
    console.log(`  ${spec.modules.length} modules`)
    return spec
  }

  const json = JSON.stringify(recipe, null, 2)
  await fs.writeFile(outputPath, json, 'utf-8')
  console.log(`Recipe extracted to ${outputPath}`)
  console.log(`  ${recipe.keyPeriods.length} key periods`)
  console.log(`  ${recipe.inputGroups.length} input groups`)
  console.log(`  ${recipe.inputs.length} inputs`)
  console.log(`  ${recipe.calculations.length} calculations`)
  console.log(`  ${recipe.moduleCalculations.length} module calculations`)
  console.log(`  ${recipe.modules.length} modules`)
  return recipe
}
