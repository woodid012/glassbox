/**
 * Module Resolver
 * Converts recipe modules to model-modules.json format.
 */

// Fields that are recipe-only annotations
const RECIPE_ONLY_FIELDS = ['sign', 'financialStatement', 'category', 'validation', 'ref', 'moduleId', 'moduleOutputKey']

/**
 * Strip recipe annotations from a module calculation.
 */
function stripModuleCalcAnnotations(mc) {
  const entry = {}
  for (const [key, value] of Object.entries(mc)) {
    if (RECIPE_ONLY_FIELDS.includes(key)) continue
    // Rename recipe fields back to model fields
    if (key === 'moduleId') {
      entry._moduleId = value
    } else if (key === 'moduleOutputKey') {
      entry._moduleOutputKey = value
    } else {
      entry[key] = value
    }
  }
  return entry
}

/**
 * Resolve module groups from recipe format.
 */
export function resolveModuleGroups(recipeModuleGroups) {
  return recipeModuleGroups.map(mg => ({
    id: mg.id,
    tabId: mg.tabId,
    name: mg.name,
    _isModuleGroup: true,
    _moduleTemplateId: mg.templateId
  }))
}

/**
 * Resolve module calculations from recipe format.
 */
export function resolveModuleCalculations(recipeModuleCalcs) {
  return recipeModuleCalcs.map(mc => {
    const entry = {
      id: mc.id,
      groupId: mc.groupId,
      name: mc.name,
      formula: mc.formula
    }
    if (mc.type) entry.type = mc.type
    if (mc.description) entry.description = mc.description
    if (mc.moduleId) entry._moduleId = mc.moduleId
    if (mc.moduleOutputKey) entry._moduleOutputKey = mc.moduleOutputKey
    return entry
  })
}

/**
 * Resolve modules from recipe format.
 */
export function resolveModules(recipeModules) {
  return recipeModules.map(mod => {
    const entry = {
      id: mod.id,
      templateId: mod.templateId,
      name: mod.name,
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
  })
}
