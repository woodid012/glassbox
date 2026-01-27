/**
 * useInputGroupManagement Hook
 * Handles CRUD operations for original input groups and input values
 */
import { useCallback } from 'react'

export function useInputGroupManagement({
    config,
    groups,
    setGroups,
    inputs,
    setInputs,
    setCollapsedGroups
}) {
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

    const updateCellValues = useCallback((inputId, updates) => {
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

    return {
        addGroup,
        removeGroup,
        toggleGroupCollapse,
        updateGroup,
        addInput,
        removeInput,
        updateInput,
        updateCellValue,
        updateCellValues
    }
}
