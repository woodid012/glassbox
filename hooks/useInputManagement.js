/**
 * useInputManagement Hook
 * Handles CRUD operations for all input types, key periods, indices, and calculations
 */
import { useCallback, useEffect } from 'react'
import {
    calculatePeriods,
    calculateLinkedStartPeriod,
    calculateLinkedAllPeriods,
    hasCircularDependency,
    recalculateLinkedPeriods,
    normalizePeriodId,
    calculateEndPeriod
} from '@/utils/dateCalculations'

/**
 * Hook for managing all input CRUD operations
 */
export function useInputManagement({
    config,
    keyPeriods,
    setKeyPeriods,
    collapsedKeyPeriodGroups,
    setCollapsedKeyPeriodGroups,
    inputType1,
    setInputType1,
    inputType1Groups,
    setInputType1Groups,
    inputGlass,
    setInputGlass,
    inputGlassGroups,
    setInputGlassGroups,
    indices,
    setIndices,
    calculations,
    setCalculations,
    calculationsGroups,
    setCalculationsGroups,
    groups,
    setGroups,
    inputs,
    setInputs,
    setCollapsedGroups
}) {
    // ==================== Key Periods ====================

    const addKeyPeriod = useCallback(() => {
        const newId = keyPeriods.length > 0
            ? Math.max(...keyPeriods.map(p => p.id), 0) + 1
            : 1

        // Calculate periods to match model timeline
        const modelPeriods = calculatePeriods(
            config.startYear,
            config.startMonth,
            config.endYear,
            config.endMonth,
            config.minFrequency
        )

        setKeyPeriods([...keyPeriods, {
            id: newId,
            name: `Period ${newId}`,
            startYear: config.startYear,
            startMonth: config.startMonth,
            endYear: config.endYear,
            endMonth: config.endMonth,
            periods: modelPeriods,
            // Start link properties
            startLinkedToPeriodId: null,
            startLinkToEnd: false,
            startLinkOffset: null,
            // End link properties
            endLinkedToPeriodId: null,
            endLinkToEnd: true,
            endLinkOffset: null
        }])
    }, [keyPeriods, config.startYear, config.startMonth, config.endYear, config.endMonth, config.minFrequency, setKeyPeriods])

    const updateKeyPeriod = useCallback((periodId, updates) => {
        // Use functional update to avoid stale closure issues with rapid consecutive updates
        setKeyPeriods(prev => {
            let updated = prev.map(p => p.id === periodId ? { ...p, ...updates } : p)

            // If this period is a child and dates changed, recalculate parent group dates
            const period = updated.find(p => p.id === periodId)
            if (period?.parentGroupId && (updates.startYear !== undefined || updates.startMonth !== undefined ||
                updates.endYear !== undefined || updates.endMonth !== undefined)) {
                // Need to recalculate group dates - inline the logic here since recalculateGroupDates may not be available yet
                const group = updated.find(p => p.id === period.parentGroupId)
                if (group && group.isGroup) {
                    const childIds = group.childIds || []
                    const children = childIds.map(id => updated.find(p => p.id === id)).filter(Boolean)

                    if (children.length > 0) {
                        let minStartTotal = Infinity
                        let maxEndTotal = -Infinity
                        let minStartYear, minStartMonth, maxEndYear, maxEndMonth

                        children.forEach(child => {
                            const childStartTotal = child.startYear * 12 + child.startMonth
                            const childEndTotal = child.endYear * 12 + child.endMonth

                            if (childStartTotal < minStartTotal) {
                                minStartTotal = childStartTotal
                                minStartYear = child.startYear
                                minStartMonth = child.startMonth
                            }
                            if (childEndTotal > maxEndTotal) {
                                maxEndTotal = childEndTotal
                                maxEndYear = child.endYear
                                maxEndMonth = child.endMonth
                            }
                        })

                        const frequency = config.minFrequency || 'monthly'
                        const monthsPerPeriod = frequency === 'annual' ? 12 : frequency === 'quarterly' ? 3 : 1
                        const totalMonths = (maxEndYear - minStartYear) * 12 + (maxEndMonth - minStartMonth) + 1
                        const numPeriods = Math.ceil(totalMonths / monthsPerPeriod)

                        updated = updated.map(p => {
                            if (p.id === period.parentGroupId) {
                                return {
                                    ...p,
                                    startYear: minStartYear,
                                    startMonth: minStartMonth,
                                    endYear: maxEndYear,
                                    endMonth: maxEndMonth,
                                    periods: numPeriods
                                }
                            }
                            return p
                        })
                    }
                }
            }

            return updated
        })
    }, [setKeyPeriods, config.minFrequency])

    const removeKeyPeriod = useCallback((periodId) => {
        // Unlink any periods that link to this one (check both old and new property names)
        const updatedPeriods = keyPeriods.map(p => {
            const updates = {}
            // Old property name
            if (p.linkedToPeriodId === periodId) {
                updates.linkedToPeriodId = null
            }
            // New property names
            if (p.startLinkedToPeriodId === periodId) {
                updates.startLinkedToPeriodId = null
                updates.startLinkOffset = null
            }
            if (p.endLinkedToPeriodId === periodId) {
                updates.endLinkedToPeriodId = null
                updates.endLinkOffset = null
            }
            return Object.keys(updates).length > 0 ? { ...p, ...updates } : p
        }).filter(p => p.id !== periodId)

        setKeyPeriods(updatedPeriods)

        // Unlink any Input Type groups that link to this Key Period
        setInputType1Groups(inputType1Groups.map(g =>
            g.linkedKeyPeriodId === periodId ? { ...g, linkedKeyPeriodId: null } : g
        ))
        setInputGlassGroups(inputGlassGroups.map(g =>
            g.linkedKeyPeriodId === periodId ? { ...g, linkedKeyPeriodId: null } : g
        ))
    }, [keyPeriods, inputType1Groups, inputGlassGroups, setKeyPeriods, setInputType1Groups, setInputGlassGroups])

    const reorderKeyPeriods = useCallback((fromIndex, toIndex) => {
        setKeyPeriods(prev => {
            const newPeriods = [...prev]
            const [moved] = newPeriods.splice(fromIndex, 1)
            newPeriods.splice(toIndex, 0, moved)
            return newPeriods
        })
    }, [setKeyPeriods])

    // Convert a period to a group (marks it as collapsible container)
    const convertToGroup = useCallback((periodId) => {
        setKeyPeriods(prev => prev.map(p => {
            if (p.id === periodId) {
                return { ...p, isGroup: true, childIds: p.childIds || [] }
            }
            return p
        }))
    }, [setKeyPeriods])

    // Remove group status from a period (ungroup)
    const ungroupPeriod = useCallback((periodId) => {
        setKeyPeriods(prev => {
            // First, remove parentGroupId from any children
            const updatedPeriods = prev.map(p => {
                if (p.parentGroupId === periodId) {
                    return { ...p, parentGroupId: null }
                }
                return p
            })
            // Then remove group status
            return updatedPeriods.map(p => {
                if (p.id === periodId) {
                    const { isGroup, childIds, ...rest } = p
                    return rest
                }
                return p
            })
        })
    }, [setKeyPeriods])

    // Helper to recalculate group dates from children
    const recalculateGroupDates = useCallback((periods, groupId) => {
        const group = periods.find(p => p.id === groupId)
        if (!group || !group.isGroup) return periods

        const childIds = group.childIds || []
        const children = childIds.map(id => periods.find(p => p.id === id)).filter(Boolean)

        if (children.length === 0) return periods

        // Find min start and max end from children using total months for comparison
        let minStartTotal = Infinity
        let maxEndTotal = -Infinity
        let minStartYear, minStartMonth, maxEndYear, maxEndMonth

        children.forEach(child => {
            const childStartTotal = child.startYear * 12 + child.startMonth
            const childEndTotal = child.endYear * 12 + child.endMonth

            if (childStartTotal < minStartTotal) {
                minStartTotal = childStartTotal
                minStartYear = child.startYear
                minStartMonth = child.startMonth
            }
            if (childEndTotal > maxEndTotal) {
                maxEndTotal = childEndTotal
                maxEndYear = child.endYear
                maxEndMonth = child.endMonth
            }
        })

        // Calculate periods
        const frequency = config.minFrequency || 'monthly'
        const monthsPerPeriod = frequency === 'annual' ? 12 : frequency === 'quarterly' ? 3 : 1
        const totalMonths = (maxEndYear - minStartYear) * 12 + (maxEndMonth - minStartMonth) + 1
        const numPeriods = Math.ceil(totalMonths / monthsPerPeriod)

        return periods.map(p => {
            if (p.id === groupId) {
                return {
                    ...p,
                    startYear: minStartYear,
                    startMonth: minStartMonth,
                    endYear: maxEndYear,
                    endMonth: maxEndMonth,
                    periods: numPeriods,
                    // Clear any links since group dates are derived from children
                    startLinkedToPeriodId: null,
                    startLinkOffset: null,
                    endLinkedToPeriodId: null,
                    endLinkOffset: null
                }
            }
            return p
        })
    }, [config.minFrequency])

    // Add a period to a group
    const addToGroup = useCallback((periodId, groupId, autoLinkToPrevious = false) => {
        setKeyPeriods(prev => {
            const group = prev.find(p => p.id === groupId)
            if (!group || !group.isGroup) return prev

            // Get existing children to find the last one for auto-linking
            const existingChildIds = group.childIds || []
            const lastChildId = existingChildIds.length > 0 ? existingChildIds[existingChildIds.length - 1] : null

            let updated = prev.map(p => {
                if (p.id === groupId) {
                    // Add to group's childIds
                    const newChildIds = [...(p.childIds || [])]
                    if (!newChildIds.includes(periodId)) {
                        newChildIds.push(periodId)
                    }
                    return { ...p, childIds: newChildIds }
                }
                if (p.id === periodId) {
                    const updates = { ...p, parentGroupId: groupId }
                    // Auto-link to previous child's end (+1 month) if requested and there is a previous child
                    if (autoLinkToPrevious && lastChildId) {
                        updates.startLinkedToPeriodId = lastChildId
                        updates.startLinkToEnd = true
                        updates.startLinkOffset = { value: 1, unit: 'months' }
                    }
                    return updates
                }
                return p
            })

            // Recalculate group dates from children
            return recalculateGroupDates(updated, groupId)
        })
    }, [setKeyPeriods, recalculateGroupDates])

    // Remove a period from a group
    const removeFromGroup = useCallback((periodId) => {
        setKeyPeriods(prev => {
            // Find the parent group
            const period = prev.find(p => p.id === periodId)
            if (!period?.parentGroupId) return prev

            const parentGroupId = period.parentGroupId

            let updated = prev.map(p => {
                if (p.id === parentGroupId) {
                    // Remove from group's childIds
                    return {
                        ...p,
                        childIds: (p.childIds || []).filter(id => id !== periodId)
                    }
                }
                if (p.id === periodId) {
                    // Remove parentGroupId
                    const { parentGroupId: _, ...rest } = p
                    return rest
                }
                return p
            })

            // Recalculate group dates from remaining children
            return recalculateGroupDates(updated, parentGroupId)
        })
    }, [setKeyPeriods, recalculateGroupDates])

    // Toggle collapse state for a key period group
    const toggleKeyPeriodGroup = useCallback((groupId) => {
        if (!setCollapsedKeyPeriodGroups) return
        setCollapsedKeyPeriodGroups(prev => {
            const newSet = new Set(prev)
            if (newSet.has(groupId)) {
                newSet.delete(groupId)
            } else {
                newSet.add(groupId)
            }
            return newSet
        })
    }, [setCollapsedKeyPeriodGroups])

    // ==================== Input Type 1 ====================

    const addInputType1Group = useCallback(() => {
        const newId = inputType1Groups.length > 0
            ? Math.max(...inputType1Groups.map(g => g.id), 0) + 1
            : 1
        setInputType1Groups([...inputType1Groups, {
            id: newId,
            name: `Group ${newId}`,
            startYear: config.startYear,
            startMonth: config.startMonth,
            periods: 12,
            linkedKeyPeriodId: null,
            groupType: 'constant'
        }])
    }, [inputType1Groups, config.startYear, config.startMonth, setInputType1Groups])

    const updateInputType1Group = useCallback((groupId, field, value) => {
        let updatedGroups = inputType1Groups.map(g => {
            if (g.id === groupId) {
                const updated = { ...g, [field]: value }

                return updated
            }
            return g
        })

        setInputType1Groups(updatedGroups)
    }, [inputType1Groups, keyPeriods, config, setInputType1Groups])

    const removeInputType1Group = useCallback((groupId) => {
        const firstGroup = inputType1Groups.find(g => g.id !== groupId)
        if (firstGroup) {
            setInputType1(inputType1.map(input =>
                input.groupId === groupId ? { ...input, groupId: firstGroup.id } : input
            ))
        } else {
            setInputType1(inputType1.filter(input => input.groupId !== groupId))
        }
        setInputType1Groups(inputType1Groups.filter(g => g.id !== groupId))
    }, [inputType1Groups, inputType1, setInputType1, setInputType1Groups])

    const addInputType1 = useCallback((groupId) => {
        const newId = inputType1.length > 0
            ? Math.max(...inputType1.map(s => s.id), 0) + 1
            : 1
        setInputType1([...inputType1, {
            id: newId,
            groupId: groupId,
            name: `Input Type 1 ${newId}`,
            values: {}
        }])
    }, [inputType1, setInputType1])

    const updateInputType1 = useCallback((id, field, value) => {
        setInputType1(inputType1.map(s => s.id === id ? { ...s, [field]: value } : s))
    }, [inputType1, setInputType1])

    const removeInputType1 = useCallback((id) => {
        setInputType1(inputType1.filter(s => s.id !== id))
    }, [inputType1, setInputType1])

    // ==================== Input Glass ====================

    const addInputGlassGroup = useCallback(() => {
        const newId = inputGlassGroups.length > 0
            ? Math.max(...inputGlassGroups.map(g => g.id), 0) + 1
            : 1
        setInputGlassGroups([...inputGlassGroups, {
            id: newId,
            name: `Group ${newId}`,
            startYear: config.startYear,
            startMonth: config.startMonth,
            endYear: config.endYear,
            endMonth: config.endMonth,
            periods: 12,
            linkedKeyPeriodId: null,
            frequency: undefined,
            groupType: 'combined',
            // Lookup mode fields
            lookupStartYear: config.startYear,
            lookupStartMonth: config.startMonth,
            lookupEndYear: config.endYear,
            lookupEndMonth: config.endMonth,
            selectedInputIds: {}  // Maps subgroupId (or 'root') to selected inputId
        }])
        return newId
    }, [inputGlassGroups, config.startYear, config.startMonth, config.endYear, config.endMonth, setInputGlassGroups])

    const updateInputGlassGroup = useCallback((groupId, field, value) => {
        // Use functional update to handle rapid consecutive updates correctly
        setInputGlassGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                const updated = { ...g, [field]: value }

                // If switching to lookup mode, initialize lookup range from model range
                if (field === 'entryMode' && value === 'lookup') {
                    if (!updated.lookupStartYear) {
                        updated.lookupStartYear = config.startYear
                        updated.lookupStartMonth = config.startMonth
                    }
                    if (!updated.lookupEndYear) {
                        updated.lookupEndYear = config.endYear
                        updated.lookupEndMonth = config.endMonth
                    }
                    // Initialize selectedInputIds if not set
                    if (!updated.selectedInputIds || Object.keys(updated.selectedInputIds).length === 0) {
                        const groupInputsList = inputGlass.filter(inp => inp.groupId === groupId)
                        const newSelectedInputIds = {}
                        // Group by subgroup and select first of each
                        const subgroups = g.subgroups || []
                        // Root level inputs
                        const rootInputs = groupInputsList.filter(inp => !inp.subgroupId)
                        if (rootInputs.length > 0) {
                            newSelectedInputIds['root'] = rootInputs[0].id
                        }
                        // Subgroup inputs
                        subgroups.forEach(sg => {
                            const sgInputs = groupInputsList.filter(inp => inp.subgroupId === sg.id)
                            if (sgInputs.length > 0) {
                                newSelectedInputIds[sg.id] = sgInputs[0].id
                            }
                        })
                        updated.selectedInputIds = newSelectedInputIds
                    }
                }

                // Note: group.frequency is deprecated - valueFrequency is now per-input

                return updated
            }
            return g
        }))
    }, [inputGlass, config, setInputGlassGroups])

    const removeInputGlassGroup = useCallback((groupId) => {
        const firstGroup = inputGlassGroups.find(g => g.id !== groupId)
        if (firstGroup) {
            setInputGlass(inputGlass.map(input =>
                input.groupId === groupId ? { ...input, groupId: firstGroup.id } : input
            ))
        } else {
            setInputGlass(inputGlass.filter(input => input.groupId !== groupId))
        }
        setInputGlassGroups(inputGlassGroups.filter(g => g.id !== groupId))
    }, [inputGlassGroups, inputGlass, setInputGlass, setInputGlassGroups])

    const addInputGlass = useCallback((groupId, subgroupId = null) => {
        const newId = inputGlass.length > 0
            ? Math.max(...inputGlass.map(s => s.id), 0) + 1
            : 1
        setInputGlass([...inputGlass, {
            id: newId,
            groupId: groupId,
            subgroupId: subgroupId,
            name: `Input ${newId}`,
            entryMode: 'values', // Terminology: 'constant', 'values', 'series'
            values: {},
            formulas: {},
            value: 0,
            valueFrequency: 'Y',
            spreadMethod: 'spread' // Explicit default - no hidden auto-detection
        }])
    }, [inputGlass, setInputGlass])

    const updateInputGlass = useCallback((id, field, value) => {
        setInputGlass(inputGlass.map(s => s.id === id ? { ...s, [field]: value } : s))
    }, [inputGlass, setInputGlass])

    const removeInputGlass = useCallback((id) => {
        setInputGlass(inputGlass.filter(s => s.id !== id))
    }, [inputGlass, setInputGlass])

    // ==================== Input Glass Subgroups ====================

    const addInputGlassSubgroup = useCallback((groupId) => {
        setInputGlassGroups(inputGlassGroups.map(g => {
            if (g.id === groupId) {
                const subgroups = g.subgroups || []
                const newId = subgroups.length > 0
                    ? Math.max(...subgroups.map(sg => sg.id), 0) + 1
                    : 1
                return {
                    ...g,
                    subgroups: [...subgroups, { id: newId, name: `Subgroup ${newId}` }]
                }
            }
            return g
        }))
    }, [inputGlassGroups, setInputGlassGroups])

    const updateInputGlassSubgroup = useCallback((groupId, subgroupId, field, value) => {
        setInputGlassGroups(inputGlassGroups.map(g => {
            if (g.id === groupId) {
                return {
                    ...g,
                    subgroups: (g.subgroups || []).map(sg =>
                        sg.id === subgroupId ? { ...sg, [field]: value } : sg
                    )
                }
            }
            return g
        }))
    }, [inputGlassGroups, setInputGlassGroups])

    const removeInputGlassSubgroup = useCallback((groupId, subgroupId) => {
        // Move inputs from this subgroup to root level
        setInputGlass(inputGlass.map(input =>
            input.groupId === groupId && input.subgroupId === subgroupId
                ? { ...input, subgroupId: null }
                : input
        ))
        // Remove the subgroup
        setInputGlassGroups(inputGlassGroups.map(g => {
            if (g.id === groupId) {
                return {
                    ...g,
                    subgroups: (g.subgroups || []).filter(sg => sg.id !== subgroupId)
                }
            }
            return g
        }))
    }, [inputGlass, inputGlassGroups, setInputGlass, setInputGlassGroups])

    // ==================== Indices ====================

    const addIndex = useCallback(() => {
        const newId = indices.length > 0
            ? Math.max(...indices.map(idx => idx.id), 0) + 1
            : 1
        setIndices([...indices, {
            id: newId,
            name: `Index ${newId}`,
            indexationStartYear: config.startYear,
            indexationStartMonth: config.startMonth,
            indexationRate: 2.5,
            indexationPeriod: 'annual'
        }])
    }, [indices, config.startYear, config.startMonth, setIndices])

    const updateIndex = useCallback((id, field, value) => {
        setIndices(indices.map(idx => idx.id === id ? { ...idx, [field]: value } : idx))
    }, [indices, setIndices])

    const removeIndex = useCallback((id) => {
        setIndices(indices.filter(idx => idx.id !== id))
    }, [indices, setIndices])

    // ==================== Calculations ====================

    const addCalculationsGroup = useCallback(() => {
        // Use 1000+ range for group IDs to avoid collision with calculation IDs
        const newId = calculationsGroups.length > 0
            ? Math.max(...calculationsGroups.map(g => g.id), 999) + 1
            : 1000
        setCalculationsGroups([...calculationsGroups, {
            id: newId,
            name: `Group ${newId - 1000}`,
            startYear: config.startYear,
            startMonth: config.startMonth,
            endYear: config.endYear,
            endMonth: config.endMonth
        }])
    }, [calculationsGroups, config.startYear, config.startMonth, config.endYear, config.endMonth, setCalculationsGroups])

    const updateCalculationsGroup = useCallback((groupId, field, value) => {
        setCalculationsGroups(calculationsGroups.map(g => g.id === groupId ? { ...g, [field]: value } : g))
    }, [calculationsGroups, setCalculationsGroups])

    const removeCalculationsGroup = useCallback((groupId) => {
        const firstGroup = calculationsGroups.find(g => g.id !== groupId)
        if (firstGroup) {
            setCalculations(calculations.map(calc =>
                calc.groupId === groupId ? { ...calc, groupId: firstGroup.id } : calc
            ))
        } else {
            setCalculations(calculations.filter(calc => calc.groupId !== groupId))
        }
        setCalculationsGroups(calculationsGroups.filter(g => g.id !== groupId))
    }, [calculationsGroups, calculations, setCalculations, setCalculationsGroups])

    const addCalculation = useCallback((groupId) => {
        const newId = calculations.length > 0
            ? Math.max(...calculations.map(c => c.id), 0) + 1
            : 1
        setCalculations([...calculations, {
            id: newId,
            groupId: groupId,
            name: `Calculation ${newId}`,
            formula: '',
            constant: 1,
            timePeriod: 'Y',
            flagReferenceId: null,
            createNewFlag: false
        }])
    }, [calculations, setCalculations])

    const updateCalculation = useCallback((id, field, value) => {
        setCalculations(calculations.map(c => c.id === id ? { ...c, [field]: value } : c))
    }, [calculations, setCalculations])

    const removeCalculation = useCallback((id) => {
        setCalculations(calculations.filter(c => c.id !== id))
    }, [calculations, setCalculations])

    const reorderCalculations = useCallback((fromIndex, toIndex, groupId) => {
        setCalculations(prev => {
            // Get calculations in this group, preserving order
            const groupCalcs = prev.filter(c => c.groupId === groupId)
            const otherCalcs = prev.filter(c => c.groupId !== groupId)

            // Reorder within group
            const newGroupCalcs = [...groupCalcs]
            const [moved] = newGroupCalcs.splice(fromIndex, 1)
            newGroupCalcs.splice(toIndex, 0, moved)

            // Return combined array (other groups first, then reordered group)
            return [...otherCalcs, ...newGroupCalcs]
        })
    }, [setCalculations])

    // ==================== Groups (Original Input Groups) ====================

    const addGroup = useCallback(() => {
        const regularGroups = groups.filter(g => !g.isSpecial && typeof g.id === 'number')
        const newId = regularGroups.length > 0
            ? Math.max(...regularGroups.map(g => g.id), 0) + 1
            : 1
        const newOrder = Math.max(...groups.map(g => g.order), 0) + 1
        setGroups([...groups, {
            id: newId,
            name: `Group ${newId}`,
            order: newOrder,
            isSpecial: false
        }])
    }, [groups, setGroups])

    const removeGroup = useCallback((groupId) => {
        const group = groups.find(g => g.id === groupId)
        if (group?.isSpecial) return

        const regularGroups = groups.filter(g => !g.isSpecial)
        if (regularGroups.length <= 1) return

        const firstOtherGroup = groups.find(g => !g.isSpecial && g.id !== groupId)
        if (firstOtherGroup) {
            setInputs(inputs.map(input =>
                input.groupId === groupId ? { ...input, groupId: firstOtherGroup.id } : input
            ))
        }
        setGroups(groups.filter(g => g.id !== groupId))
    }, [groups, inputs, setGroups, setInputs])

    const toggleGroupCollapse = useCallback((groupId) => {
        setCollapsedGroups(prev => {
            const newSet = new Set(prev)
            if (newSet.has(groupId)) {
                newSet.delete(groupId)
            } else {
                newSet.add(groupId)
            }
            return newSet
        })
    }, [setCollapsedGroups])

    const updateGroup = useCallback((groupId, field, value) => {
        setGroups(groups.map(g =>
            g.id === groupId ? { ...g, [field]: value } : g
        ))
    }, [groups, setGroups])

    // ==================== Inputs ====================

    const addInput = useCallback((groupId = null, category = 'value') => {
        const newId = Math.max(...inputs.map(i => i.id), 0) + 1
        let targetGroupId = groupId
        if (!targetGroupId) {
            if (category === 'flag') {
                targetGroupId = 'flags'
            } else if (category === 'indexation') {
                targetGroupId = 'indexation'
            } else {
                const firstRegularGroup = groups.find(g => !g.isSpecial)
                targetGroupId = firstRegularGroup?.id || 1
            }
        }
        setInputs([...inputs, {
            id: newId,
            groupId: targetGroupId,
            name: `Input ${newId}`,
            category: category,
            type: category === 'value' ? 'flow' : undefined,
            defaultValue: 0,
            indexationRate: category === 'indexation' ? 0.025 : 0,
            indexationPeriod: category === 'indexation' ? 'annual' : undefined,
            linkedFlagId: null,
            startYear: config.startYear,
            startMonth: config.startMonth,
            endYear: config.endYear,
            endMonth: config.endMonth,
            values: {},
        }])
    }, [inputs, groups, config.startYear, config.startMonth, config.endYear, config.endMonth, setInputs])

    const removeInput = useCallback((id) => {
        const input = inputs.find(i => i.id === id)
        if (input && (input.id === -1 || input.name === 'Timeline')) return
        setInputs(inputs.filter(i => i.id !== id))
    }, [inputs, setInputs])

    const updateInput = useCallback((id, field, val) => {
        setInputs(inputs.map(i => {
            if (i.id === id) {
                const updated = { ...i, [field]: val }
                if (field === 'category' && val === 'flag') {
                    updated.defaultValue = (updated.defaultValue === 1 || updated.defaultValue === '1') ? 1 : 0
                    updated.groupId = 'flags'
                }
                if (field === 'category' && val === 'indexation') {
                    updated.groupId = 'indexation'
                }
                if (field === 'category' && val === 'value' && (updated.groupId === 'flags' || updated.groupId === 'indexation')) {
                    const firstRegularGroup = groups.find(g => !g.isSpecial)
                    updated.groupId = firstRegularGroup?.id || 1
                }
                if (field === 'defaultValue' && updated.category === 'flag') {
                    updated.defaultValue = (val === 1 || val === '1' || val === true) ? 1 : 0
                }
                return updated
            }
            return i
        }))
    }, [inputs, groups, setInputs])

    const updateCellValue = useCallback((inputId, periodIndex, value) => {
        setInputs(inputs.map(input => {
            if (input.id === inputId) {
                return {
                    ...input,
                    values: {
                        ...input.values,
                        [periodIndex]: value
                    }
                }
            }
            return input
        }))
    }, [inputs, setInputs])

    // Batch update multiple cell values at once (for Excel-style paste)
    const updateCellValues = useCallback((inputId, updates) => {
        // updates = [{periodIndex: 0, value: 100}, {periodIndex: 1, value: 200}, ...]
        setInputs(inputs.map(input => {
            if (input.id === inputId) {
                const newValues = { ...input.values }
                updates.forEach(({ periodIndex, value }) => {
                    newValues[periodIndex] = value
                })
                return { ...input, values: newValues }
            }
            return input
        }))
    }, [inputs, setInputs])

    // ==================== Effects for Linked Updates ====================

    // Recalculate periods linked to "default" (Model) when config changes
    useEffect(() => {
        // Check for periods linked to Model using either old or new property names
        const hasLinkedPeriods = keyPeriods.some(p =>
            p.linkedToPeriodId === 'default' ||
            p.startLinkedToPeriodId === 'default' ||
            p.endLinkedToPeriodId === 'default'
        )

        if (hasLinkedPeriods) {
            // For new-style links, recalculate based on current config
            const updatedPeriods = keyPeriods.map(p => {
                let updates = {}

                // Recalculate start if linked to Model
                if (p.startLinkedToPeriodId === 'default') {
                    const linkToEnd = p.startLinkToEnd || false
                    const offset = p.startLinkOffset || { value: 0, unit: 'months' }
                    let refYear = linkToEnd ? config.endYear : config.startYear
                    let refMonth = linkToEnd ? config.endMonth : config.startMonth

                    let offsetMonths = offset.value || 0
                    if (offset.unit === 'years') offsetMonths *= 12

                    const totalMonths = refYear * 12 + (refMonth - 1) + offsetMonths
                    updates.startYear = Math.floor(totalMonths / 12)
                    updates.startMonth = (totalMonths % 12) + 1
                }

                // Recalculate end if linked to Model
                if (p.endLinkedToPeriodId === 'default') {
                    const linkToEnd = p.endLinkToEnd !== false
                    const offset = p.endLinkOffset || { value: 0, unit: 'months' }
                    let refYear = linkToEnd ? config.endYear : config.startYear
                    let refMonth = linkToEnd ? config.endMonth : config.startMonth

                    let offsetMonths = offset.value || 0
                    if (offset.unit === 'years') offsetMonths *= 12

                    const totalMonths = refYear * 12 + (refMonth - 1) + offsetMonths
                    updates.endYear = Math.floor(totalMonths / 12)
                    updates.endMonth = (totalMonths % 12) + 1
                }

                // Recalculate periods if dates changed
                if ((updates.startYear !== undefined || updates.endYear !== undefined)) {
                    const startY = updates.startYear ?? p.startYear
                    const startM = updates.startMonth ?? p.startMonth
                    const endY = updates.endYear ?? p.endYear
                    const endM = updates.endMonth ?? p.endMonth
                    const totalMonths = (endY - startY) * 12 + (endM - startM) + 1
                    const monthsPerPeriod = config.minFrequency === 'annual' ? 12 : config.minFrequency === 'quarterly' ? 3 : 1
                    updates.periods = Math.ceil(totalMonths / monthsPerPeriod)
                }

                return Object.keys(updates).length > 0 ? { ...p, ...updates } : p
            })

            // Also handle old-style links
            const finalPeriods = recalculateLinkedPeriods('default', updatedPeriods, config)

            if (JSON.stringify(finalPeriods) !== JSON.stringify(keyPeriods)) {
                setKeyPeriods(finalPeriods)
            }
        }
    }, [config.startYear, config.startMonth, config.endYear, config.endMonth])

    return {
        // Key Periods
        addKeyPeriod,
        updateKeyPeriod,
        removeKeyPeriod,
        reorderKeyPeriods,
        convertToGroup,
        ungroupPeriod,
        addToGroup,
        removeFromGroup,
        toggleKeyPeriodGroup,
        // Input Type 1
        addInputType1Group,
        updateInputType1Group,
        removeInputType1Group,
        addInputType1,
        updateInputType1,
        removeInputType1,
        // Input Glass
        addInputGlassGroup,
        updateInputGlassGroup,
        removeInputGlassGroup,
        addInputGlass,
        updateInputGlass,
        removeInputGlass,
        // Input Glass Subgroups
        addInputGlassSubgroup,
        updateInputGlassSubgroup,
        removeInputGlassSubgroup,
        // Indices
        addIndex,
        updateIndex,
        removeIndex,
        // Calculations
        addCalculationsGroup,
        updateCalculationsGroup,
        removeCalculationsGroup,
        addCalculation,
        updateCalculation,
        removeCalculation,
        reorderCalculations,
        // Groups
        addGroup,
        removeGroup,
        toggleGroupCollapse,
        updateGroup,
        // Inputs
        addInput,
        removeInput,
        updateInput,
        updateCellValue,
        updateCellValues
    }
}
