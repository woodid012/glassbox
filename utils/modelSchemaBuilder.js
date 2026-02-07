/**
 * Model Schema Builder
 *
 * Produces a compact, AI-friendly model descriptor (~3-5KB) that gives
 * everything needed for AI context without reading full JSON files.
 *
 * Includes: project info, key periods, constants (with values), input groups
 * (metadata only), inputs (metadata only, no value arrays), indices,
 * calculations (with formulas), and modules.
 */
import path from 'path'
import { loadModelData } from './loadModelData.js'
import { getGroupRef, getGroupPrefix } from './groupRefResolver.js'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(year, month) {
  if (!year || !month) return null
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/**
 * Build input ref string from input and group.
 * Constants use offset of 99 (IDs start at 100).
 */
function buildInputRef(input, group) {
  const prefix = getGroupPrefix(group)
  const refIndex = group.refIndex || 1
  const inputNum = group.id === 100 ? input.id - 99 : input.id
  return `${prefix}${refIndex}.${inputNum}`
}

/**
 * Build a compact model schema from data files.
 *
 * @param {string} dataDir - Path to the data directory
 * @returns {Promise<Object>} Compact schema object
 */
export async function buildModelSchema(dataDir) {
  const { inputs, calculations: calcs } = await loadModelData(dataDir)

  const config = inputs.config || {}
  const keyPeriods = inputs.keyPeriods || []
  const indices = inputs.indices || []
  const inputGlassGroups = inputs.inputGlassGroups || []
  const inputGlass = inputs.inputGlass || []
  const calculations = calcs.calculations || []
  const calculationsGroups = calcs.calculationsGroups || []
  const calculationsTabs = calcs.calculationsTabs || []
  const modules = calcs.modules || []
  const mRefMap = calcs._mRefMap || {}

  // Build group lookup for name resolution
  const groupById = {}
  for (const g of calculationsGroups) groupById[g.id] = g

  // Build tab lookup
  const tabById = {}
  for (const t of calculationsTabs) tabById[t.id] = t

  // Build input group lookup
  const inputGroupById = {}
  for (const g of inputGlassGroups) inputGroupById[g.id] = g

  const schema = {
    project: {
      name: 'BESS Project Finance Model',
      timeline: `${formatDate(config.startYear, config.startMonth)} - ${formatDate(config.endYear, config.endMonth)}`,
      startYear: config.startYear,
      startMonth: config.startMonth,
      endYear: config.endYear,
      endMonth: config.endMonth,
      periods: computePeriods(config)
    },

    keyPeriods: keyPeriods.map(kp => ({
      id: kp.id,
      flag: `F${kp.id}`,
      name: kp.name,
      months: kp.periods || 0,
      start: formatDate(kp.startYear, kp.startMonth),
      end: formatDate(kp.endYear, kp.endMonth),
      ...(kp.isGroup ? { isGroup: true, childIds: kp.childIds } : {}),
      ...(kp.parentGroupId ? { parentGroupId: kp.parentGroupId } : {})
    })),

    constants: inputGlass
      .filter(inp => inp.groupId === 100)
      .map(inp => ({
        ref: `C1.${inp.id - 99}`,
        name: inp.name,
        value: inp.value,
        ...(inp.unit ? { unit: inp.unit } : {})
      })),

    indices: indices.map(idx => ({
      id: idx.id,
      ref: `I${idx.id}`,
      name: idx.name,
      rate: idx.indexationRate,
      period: idx.indexationPeriod
    })),

    inputGroups: inputGlassGroups
      .filter(g => g.id !== 100) // Constants listed separately
      .map(group => {
        const groupInputs = inputGlass.filter(i => i.groupId === group.id)
        const ref = getGroupRef(group, groupInputs)
        return {
          ref,
          name: group.name,
          mode: group.entryMode || 'values',
          inputCount: groupInputs.length,
          ...(group.linkedKeyPeriodId ? { linkedKeyPeriod: `F${group.linkedKeyPeriodId}` } : {}),
          ...(group.frequency ? { frequency: group.frequency } : {}),
          ...(group.subgroups?.length ? { subgroupCount: group.subgroups.length } : {})
        }
      }),

    inputs: inputGlass
      .filter(inp => inp.groupId !== 100) // Constants listed separately
      .map(inp => {
        const group = inputGroupById[inp.groupId]
        if (!group) return null
        const ref = buildInputRef(inp, group)
        const entry = {
          ref,
          name: inp.name,
          ...(inp.unit ? { unit: inp.unit } : {}),
          mode: inp.mode || inp.entryMode || group.entryMode || 'values'
        }
        // Include value for constant-mode inputs (small scalar)
        if ((entry.mode === 'constant' || entry.mode === 'series') && inp.value !== undefined) {
          entry.value = inp.value
        }
        // For values/series, show period count from the input's values object
        if (inp.values && typeof inp.values === 'object') {
          entry.periods = Object.keys(inp.values).length
        }
        return entry
      })
      .filter(Boolean),

    calculations: calculations
      .filter(calc => !calc._moduleId) // Exclude module calcs (shown under modules)
      .map(calc => {
        const group = groupById[calc.groupId]
        const tab = group ? tabById[group.tabId] : null
        return {
          id: calc.id,
          ref: `R${calc.id}`,
          name: calc.name,
          formula: calc.formula || '0',
          ...(calc.type ? { type: calc.type } : {}),
          ...(group ? { group: group.name } : {}),
          ...(tab ? { tab: tab.name } : {})
        }
      }),

    modules: modules.map((mod, idx) => {
      // Find M-ref prefix from moduleCalculations via _moduleId
      // Modules are 1-indexed: first module = M1, second = M2, etc.
      const moduleCalcs = calculations.filter(c => c._moduleId === `M${idx + 1}`)
      let mRefPrefix = `M${idx + 1}`

      // Also check _mRefMap to confirm
      if (mRefMap[`${mRefPrefix}.1`]) {
        // Good - M-ref map confirms
      } else {
        // Try to find from moduleCalculations _moduleId
        const anyModCalc = calculations.find(c => c._moduleId && c._moduleId.startsWith('M'))
        // Fall back to index-based
      }

      // Build output list with M-ref labels
      const outputs = (mod.outputs || []).map((outputKey, outputIdx) => {
        const mRef = `${mRefPrefix}.${outputIdx + 1}`
        const rRef = mRefMap[mRef] || null
        // Also try finding the matching calc for the R-ref
        const matchCalc = moduleCalcs.find(c => c._moduleOutputKey === outputKey)
        const resolvedRRef = rRef || (matchCalc ? `R${matchCalc.id}` : null)
        return `${mRef} ${outputKey}${resolvedRRef ? ` (${resolvedRRef})` : ''}`
      })

      return {
        id: mRefPrefix,
        templateId: mod.templateId,
        name: mod.name,
        ...(mod.enabled === false ? { enabled: false } : {}),
        outputs
      }
    })
  }

  return schema
}

/**
 * Compute total periods from config.
 */
function computePeriods(config) {
  if (!config.startYear || !config.endYear) return 0
  return (config.endYear - config.startYear) * 12 + (config.endMonth - config.startMonth) + 1
}
