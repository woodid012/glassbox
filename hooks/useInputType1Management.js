/**
 * useInputType1Management Hook
 * Handles CRUD operations for Input Type 1 groups and inputs
 */
import { useCallback } from 'react'

export function useInputType1Management({
    config,
    inputType1,
    setInputType1,
    inputType1Groups,
    setInputType1Groups
}) {
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
    }, [inputType1Groups, setInputType1Groups])

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

    return {
        addInputType1Group,
        updateInputType1Group,
        removeInputType1Group,
        addInputType1,
        updateInputType1,
        removeInputType1
    }
}
