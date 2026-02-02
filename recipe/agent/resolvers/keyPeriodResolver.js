/**
 * Key Period Resolver
 * Converts recipe keyPeriods (with startAnchor) to model-inputs.json format
 * (with startLinkedToPeriodId, startLinkToEnd, startLinkOffset, computed dates).
 */

/**
 * Parse startAnchor into linking fields.
 * "timeline.start" -> no link
 * "F1.End" -> link to period 1, linkToEnd=true
 * "F3.Start" -> link to period 3, linkToEnd=false
 */
function parseAnchor(anchor) {
  if (!anchor || anchor === 'timeline.start') {
    return { linkedId: 'default', linkToEnd: false }
  }
  const match = anchor.match(/^F(\d+)\.(Start|End)$/)
  if (match) {
    return {
      linkedId: parseInt(match[1]),
      linkToEnd: match[2] === 'End'
    }
  }
  // Just F{id} means start of that period
  const simpleMatch = anchor.match(/^F(\d+)$/)
  if (simpleMatch) {
    return { linkedId: parseInt(simpleMatch[1]), linkToEnd: false }
  }
  return { linkedId: 'default', linkToEnd: false }
}

/**
 * Resolve key periods from recipe format to model format.
 * Also computes start/end dates based on anchoring.
 */
export function resolveKeyPeriods(recipeKeyPeriods, timeline, constantsLookup = {}) {
  // Build a map for resolving anchors
  const resolvedMap = new Map()

  // First pass: resolve periods that reference constants
  const periods = recipeKeyPeriods.map(kp => {
    let periodCount = kp.periods
    if (kp.periodsFromRef && constantsLookup[kp.periodsFromRef] !== undefined) {
      // periodsFromRef like "C1.27" -> look up constant value, multiply by 12 for months
      const refVal = constantsLookup[kp.periodsFromRef]
      periodCount = Math.round(refVal * 12) // years to months
    }
    return { ...kp, resolvedPeriods: periodCount }
  })

  // Second pass: resolve dates (topological order - parents before children)
  const resolved = []
  const pending = [...periods]
  const maxIterations = pending.length * 2

  let iter = 0
  while (pending.length > 0 && iter < maxIterations) {
    iter++
    const idx = pending.findIndex(kp => {
      const { linkedId } = parseAnchor(kp.startAnchor)
      return linkedId === 'default' || linkedId === null || resolvedMap.has(linkedId)
    })
    if (idx === -1) break

    const kp = pending.splice(idx, 1)[0]
    const { linkedId, linkToEnd } = parseAnchor(kp.startAnchor)
    const offset = kp.startOffset?.value || 0

    let startYear, startMonth
    if (linkedId === 'default' || linkedId === null) {
      startYear = timeline.startYear
      startMonth = timeline.startMonth
    } else {
      const linked = resolvedMap.get(linkedId)
      if (linkToEnd) {
        startYear = linked.endYear
        startMonth = linked.endMonth
      } else {
        startYear = linked.startYear
        startMonth = linked.startMonth
      }
    }

    // Apply offset
    if (offset > 0) {
      startMonth += offset
      while (startMonth > 12) { startMonth -= 12; startYear++ }
    }

    // Compute end date from periods
    const periodCount = kp.resolvedPeriods || kp.periods
    let endMonth = startMonth + periodCount - 1
    let endYear = startYear
    while (endMonth > 12) { endMonth -= 12; endYear++ }

    const modelKp = {
      id: kp.id,
      name: kp.name,
      periods: periodCount,
      linkedToPeriodId: null,
      linkOffset: { value: 0, unit: 'days' },
      linkToStart: !linkToEnd && (linkedId === 'default' || linkedId === null),
      linkToAll: false,
      startYear,
      startMonth,
      endYear,
      endMonth,
      startLinkedToPeriodId: linkedId === 'default' ? 'default'
        : (linkedId === null ? null : linkedId),
      startLinkToEnd: linkToEnd,
      startLinkOffset: kp.startOffset || { value: 0, unit: 'months' }
    }

    // Preserve periodsFromRef
    if (kp.periodsFromRef) modelKp.periodsFromRef = kp.periodsFromRef

    // Group structure
    if (kp.isGroup) {
      modelKp.isGroup = true
      modelKp.childIds = kp.childIds
    }
    if (kp.parentGroupId) {
      modelKp.parentGroupId = kp.parentGroupId
    }

    // Use recipe-provided dates if present (override computed)
    if (kp.startYear) modelKp.startYear = kp.startYear
    if (kp.startMonth) modelKp.startMonth = kp.startMonth
    if (kp.endYear) modelKp.endYear = kp.endYear
    if (kp.endMonth) modelKp.endMonth = kp.endMonth

    resolvedMap.set(kp.id, modelKp)
    resolved.push(modelKp)
  }

  // Add any remaining unresolved (shouldn't happen)
  for (const kp of pending) {
    console.warn(`Warning: Could not resolve key period ${kp.id} (${kp.name})`)
    resolved.push({
      id: kp.id,
      name: kp.name,
      periods: kp.periods || 0,
      startYear: kp.startYear || timeline.startYear,
      startMonth: kp.startMonth || timeline.startMonth,
      endYear: kp.endYear || timeline.startYear,
      endMonth: kp.endMonth || timeline.startMonth
    })
  }

  return resolved
}
