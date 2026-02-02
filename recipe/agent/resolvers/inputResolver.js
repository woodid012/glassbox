/**
 * Input Resolver
 * Converts recipe inputs/inputGroups to model-inputs.json format.
 */

/**
 * Resolve input groups from recipe format to model format.
 */
export function resolveInputGroups(recipeGroups) {
  return recipeGroups.map(group => {
    const entry = {
      id: group.id,
      refIndex: group.refIndex,
      name: group.name,
      periods: group.periods || 0,
      frequency: group.frequency || 'M',
      groupType: group.groupType || 'combined'
    }

    if (group.linkedKeyPeriodId !== undefined) {
      entry.linkedKeyPeriodId = group.linkedKeyPeriodId
    }
    if (group.entryMode) entry.entryMode = group.entryMode

    // Dates
    if (group.startYear) entry.startYear = group.startYear
    if (group.startMonth) entry.startMonth = group.startMonth
    if (group.endYear) entry.endYear = group.endYear
    if (group.endMonth) entry.endMonth = group.endMonth

    // Lookup fields
    if (group.lookupStartYear) {
      entry.lookupStartYear = group.lookupStartYear
      entry.lookupStartMonth = group.lookupStartMonth
      entry.lookupEndYear = group.lookupEndYear
      entry.lookupEndMonth = group.lookupEndMonth
    }

    // Subgroups
    if (group.subgroups?.length) entry.subgroups = group.subgroups
    else if (group.groupType === 'constant') entry.subgroups = group.subgroups || []

    // Selection state
    if (group.selectedIndices) entry.selectedIndices = group.selectedIndices
    if (group.selectedInputIds) entry.selectedInputIds = group.selectedInputIds
    if (group.showSelected !== undefined) entry.showSelected = group.showSelected

    return entry
  })
}

/**
 * Resolve inputs from recipe format to model format (inputGlass).
 */
export function resolveInputs(recipeInputs) {
  return recipeInputs.map(input => {
    const entry = {
      id: input.id,
      groupId: input.groupId,
      name: input.name
    }

    if (input.subgroupId) entry.subgroupId = input.subgroupId
    if (input.inputId) entry.inputId = input.inputId
    if (input.mode) entry.mode = input.mode
    if (input.value !== undefined) entry.value = input.value
    if (input.values) entry.values = input.values
    if (input.formulas) entry.formulas = input.formulas
    else if (input.mode === 'values' || input.mode === 'constant') entry.formulas = {}
    if (input.unit) entry.unit = input.unit
    if (input.total !== undefined) entry.total = input.total
    if (input.timePeriod) entry.timePeriod = input.timePeriod
    if (input.escalation) entry.escalation = input.escalation
    if (input.spreadMethod) entry.spreadMethod = input.spreadMethod
    if (input.seriesStartDate) entry.seriesStartDate = input.seriesStartDate
    if (input.seriesEndDate) entry.seriesEndDate = input.seriesEndDate
    if (input.description) entry.description = input.description

    return entry
  })
}

/**
 * Resolve indices from recipe format to model format.
 */
export function resolveIndices(recipeIndices) {
  return recipeIndices.map(idx => ({
    id: idx.id,
    name: idx.name,
    indexationRate: idx.rate,
    indexationPeriod: idx.period,
    indexationStartYear: idx.startYear,
    indexationStartMonth: idx.startMonth
  }))
}
