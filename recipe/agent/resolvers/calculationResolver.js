/**
 * Calculation Resolver
 * Strips recipe-only annotations from calculations to produce model-calculations.json format.
 */

// Fields that are recipe-only annotations (not in model files)
const RECIPE_ONLY_FIELDS = ['sign', 'financialStatement', 'category', 'validation', 'ref']

/**
 * Strip recipe annotations from a calculation, returning model format.
 */
function stripAnnotations(calc) {
  const entry = {}
  for (const [key, value] of Object.entries(calc)) {
    if (!RECIPE_ONLY_FIELDS.includes(key)) {
      entry[key] = value
    }
  }
  return entry
}

/**
 * Resolve calculations from recipe format to model-calculations.json format.
 */
export function resolveCalculations(recipeCalcs) {
  return recipeCalcs.map(stripAnnotations)
}

/**
 * Resolve calculation groups from recipe format.
 */
export function resolveCalculationGroups(recipeGroups) {
  return recipeGroups.map(group => {
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
  })
}

/**
 * Resolve tabs from recipe format.
 */
export function resolveTabs(recipeTabs) {
  return recipeTabs.map(tab => ({
    id: tab.id,
    name: tab.name
  }))
}
