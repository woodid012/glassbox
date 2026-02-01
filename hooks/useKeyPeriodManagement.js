/**
 * useKeyPeriodManagement Hook
 * Handles CRUD operations for key periods, grouping, and linked period recalculation
 */
import { useCallback, useEffect } from 'react'
import {
    calculatePeriods,
    calculateEndPeriod,
    recalculateLinkedPeriods
} from '@/utils/dateCalculations'

export function useKeyPeriodManagement({
    config,
    keyPeriods,
    setKeyPeriods,
    collapsedKeyPeriodGroups,
    setCollapsedKeyPeriodGroups,
    inputType1Groups,
    setInputType1Groups,
    inputGlassGroups,
    setInputGlassGroups,
    inputGlass
}) {
    const addKeyPeriod = useCallback(() => {
        const newId = keyPeriods.length > 0
            ? Math.max(...keyPeriods.map(p => p.id), 0) + 1
            : 1

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
            startLinkedToPeriodId: null,
            startLinkToEnd: false,
            startLinkOffset: null,
            endLinkedToPeriodId: null,
            endLinkToEnd: true,
            endLinkOffset: null
        }])
    }, [keyPeriods, config.startYear, config.startMonth, config.endYear, config.endMonth, config.minFrequency, setKeyPeriods])

    const updateKeyPeriod = useCallback((periodId, updates) => {
        setKeyPeriods(prev => {
            let updated = prev.map(p => p.id === periodId ? { ...p, ...updates } : p)

            const period = updated.find(p => p.id === periodId)
            if (period?.parentGroupId && (updates.startYear !== undefined || updates.startMonth !== undefined ||
                updates.endYear !== undefined || updates.endMonth !== undefined)) {
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
        const updatedPeriods = keyPeriods.map(p => {
            const updates = {}
            if (p.linkedToPeriodId === periodId) {
                updates.linkedToPeriodId = null
            }
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

    const convertToGroup = useCallback((periodId) => {
        setKeyPeriods(prev => prev.map(p => {
            if (p.id === periodId) {
                return { ...p, isGroup: true, childIds: p.childIds || [] }
            }
            return p
        }))
    }, [setKeyPeriods])

    const ungroupPeriod = useCallback((periodId) => {
        setKeyPeriods(prev => {
            const updatedPeriods = prev.map(p => {
                if (p.parentGroupId === periodId) {
                    return { ...p, parentGroupId: null }
                }
                return p
            })
            return updatedPeriods.map(p => {
                if (p.id === periodId) {
                    const { isGroup, childIds, ...rest } = p
                    return rest
                }
                return p
            })
        })
    }, [setKeyPeriods])

    const recalculateGroupDates = useCallback((periods, groupId) => {
        const group = periods.find(p => p.id === groupId)
        if (!group || !group.isGroup) return periods

        const childIds = group.childIds || []
        const children = childIds.map(id => periods.find(p => p.id === id)).filter(Boolean)

        if (children.length === 0) return periods

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

        return periods.map(p => {
            if (p.id === groupId) {
                return {
                    ...p,
                    startYear: minStartYear,
                    startMonth: minStartMonth,
                    endYear: maxEndYear,
                    endMonth: maxEndMonth,
                    periods: numPeriods,
                    startLinkedToPeriodId: null,
                    startLinkOffset: null,
                    endLinkedToPeriodId: null,
                    endLinkOffset: null
                }
            }
            return p
        })
    }, [config.minFrequency])

    const addToGroup = useCallback((periodId, groupId, autoLinkToPrevious = false) => {
        setKeyPeriods(prev => {
            const group = prev.find(p => p.id === groupId)
            if (!group || !group.isGroup) return prev

            const existingChildIds = group.childIds || []
            const lastChildId = existingChildIds.length > 0 ? existingChildIds[existingChildIds.length - 1] : null

            let updated = prev.map(p => {
                if (p.id === groupId) {
                    const newChildIds = [...(p.childIds || [])]
                    if (!newChildIds.includes(periodId)) {
                        newChildIds.push(periodId)
                    }
                    return { ...p, childIds: newChildIds }
                }
                if (p.id === periodId) {
                    const updates = { ...p, parentGroupId: groupId }
                    if (autoLinkToPrevious && lastChildId) {
                        updates.startLinkedToPeriodId = lastChildId
                        updates.startLinkToEnd = true
                        updates.startLinkOffset = { value: 1, unit: 'months' }
                    }
                    return updates
                }
                return p
            })

            return recalculateGroupDates(updated, groupId)
        })
    }, [setKeyPeriods, recalculateGroupDates])

    const removeFromGroup = useCallback((periodId) => {
        setKeyPeriods(prev => {
            const period = prev.find(p => p.id === periodId)
            if (!period?.parentGroupId) return prev

            const parentGroupId = period.parentGroupId

            let updated = prev.map(p => {
                if (p.id === parentGroupId) {
                    return {
                        ...p,
                        childIds: (p.childIds || []).filter(id => id !== periodId)
                    }
                }
                if (p.id === periodId) {
                    const { parentGroupId: _, ...rest } = p
                    return rest
                }
                return p
            })

            return recalculateGroupDates(updated, parentGroupId)
        })
    }, [setKeyPeriods, recalculateGroupDates])

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

    // Reactive sync: when a constant changes, update key periods with periodsFromRef
    useEffect(() => {
        if (!inputGlass) return

        const periodsWithRef = keyPeriods.filter(p => p.periodsFromRef)
        if (periodsWithRef.length === 0) return

        let needsUpdate = false
        let updatedPeriods = [...keyPeriods]

        for (const period of periodsWithRef) {
            const ref = period.periodsFromRef
            const match = ref.match(/^C1\.(\d+)$/)
            if (!match) continue

            const inputId = parseInt(match[1]) + 99
            const constant = inputGlass.find(inp => inp.id === inputId && inp.groupId === 100)
            if (!constant || typeof constant.value !== 'number') continue

            const newPeriods = Math.round(constant.value * 12)
            if (newPeriods === period.periods) continue

            needsUpdate = true
            const endDate = calculateEndPeriod(period.startYear, period.startMonth, newPeriods)
            updatedPeriods = updatedPeriods.map(p =>
                p.id === period.id
                    ? { ...p, periods: newPeriods, endYear: endDate.year, endMonth: endDate.month }
                    : p
            )
        }

        if (needsUpdate) {
            // Cascade to periods that link to affected periods
            for (const period of periodsWithRef) {
                updatedPeriods = recalculateLinkedPeriods(period.id, updatedPeriods, config)
            }
            setKeyPeriods(updatedPeriods)
        }
    }, [inputGlass, keyPeriods, config, setKeyPeriods])

    // Recalculate periods linked to "default" (Model) when config changes
    useEffect(() => {
        const hasLinkedPeriods = keyPeriods.some(p =>
            p.linkedToPeriodId === 'default' ||
            p.startLinkedToPeriodId === 'default' ||
            p.endLinkedToPeriodId === 'default'
        )

        if (hasLinkedPeriods) {
            const updatedPeriods = keyPeriods.map(p => {
                let updates = {}

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

            const finalPeriods = recalculateLinkedPeriods('default', updatedPeriods, config)

            if (JSON.stringify(finalPeriods) !== JSON.stringify(keyPeriods)) {
                setKeyPeriods(finalPeriods)
            }
        }
    }, [config.startYear, config.startMonth, config.endYear, config.endMonth])

    return {
        addKeyPeriod,
        updateKeyPeriod,
        removeKeyPeriod,
        reorderKeyPeriods,
        convertToGroup,
        ungroupPeriod,
        addToGroup,
        removeFromGroup,
        toggleKeyPeriodGroup
    }
}
