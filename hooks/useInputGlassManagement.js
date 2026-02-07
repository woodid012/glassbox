/**
 * useInputGlassManagement Hook
 * Handles CRUD operations for Input Glass groups, inputs, and subgroups
 */
import { useCallback } from 'react'
import { generateRefName } from '@/utils/refNameResolver'

export function useInputGlassManagement({
    config,
    inputGlass,
    setInputGlass,
    inputGlassGroups,
    setInputGlassGroups
}) {
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
            lookupStartYear: config.startYear,
            lookupStartMonth: config.startMonth,
            lookupEndYear: config.endYear,
            lookupEndMonth: config.endMonth,
            selectedInputIds: {}
        }])
        return newId
    }, [inputGlassGroups, config.startYear, config.startMonth, config.endYear, config.endMonth, setInputGlassGroups])

    const updateInputGlassGroup = useCallback((groupId, field, value) => {
        setInputGlassGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                const updated = { ...g, [field]: value }

                if (field === 'entryMode' && value === 'lookup') {
                    if (!updated.lookupStartYear) {
                        updated.lookupStartYear = config.startYear
                        updated.lookupStartMonth = config.startMonth
                    }
                    if (!updated.lookupEndYear) {
                        updated.lookupEndYear = config.endYear
                        updated.lookupEndMonth = config.endMonth
                    }
                    if (!updated.selectedInputIds || Object.keys(updated.selectedInputIds).length === 0) {
                        const groupInputsList = inputGlass.filter(inp => inp.groupId === groupId)
                        const newSelectedInputIds = {}
                        const subgroups = g.subgroups || []
                        const rootInputs = groupInputsList.filter(inp => !inp.subgroupId)
                        if (rootInputs.length > 0) {
                            newSelectedInputIds['root'] = rootInputs[0].id
                        }
                        subgroups.forEach(sg => {
                            const sgInputs = groupInputsList.filter(inp => inp.subgroupId === sg.id)
                            if (sgInputs.length > 0) {
                                newSelectedInputIds[sg.id] = sgInputs[0].id
                            }
                        })
                        updated.selectedInputIds = newSelectedInputIds
                    }
                }

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
        const name = `Input ${newId}`
        const existingNames = new Set(inputGlass.map(i => i.refName).filter(Boolean))
        const refName = generateRefName(name, existingNames)
        setInputGlass([...inputGlass, {
            id: newId,
            groupId: groupId,
            subgroupId: subgroupId,
            name,
            refName,
            entryMode: 'values',
            values: {},
            formulas: {},
            value: 0,
            valueFrequency: 'Y',
            spreadMethod: 'spread'
        }])
    }, [inputGlass, setInputGlass])

    const updateInputGlass = useCallback((id, field, value) => {
        setInputGlass(inputGlass.map(s => s.id === id ? { ...s, [field]: value } : s))
    }, [inputGlass, setInputGlass])

    const removeInputGlass = useCallback((id) => {
        setInputGlass(inputGlass.filter(s => s.id !== id))
    }, [inputGlass, setInputGlass])

    // Subgroup operations
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
        setInputGlass(inputGlass.map(input =>
            input.groupId === groupId && input.subgroupId === subgroupId
                ? { ...input, subgroupId: null }
                : input
        ))
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

    return {
        addInputGlassGroup,
        updateInputGlassGroup,
        removeInputGlassGroup,
        addInputGlass,
        updateInputGlass,
        removeInputGlass,
        addInputGlassSubgroup,
        updateInputGlassSubgroup,
        removeInputGlassSubgroup
    }
}
