/**
 * useCalculationManagement Hook
 * Handles CRUD operations for calculations and calculation groups
 */
import { useCallback } from 'react'

export function useCalculationManagement({
    config,
    calculations,
    setCalculations,
    calculationsGroups,
    setCalculationsGroups
}) {
    const addCalculationsGroup = useCallback(() => {
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
            const groupCalcs = prev.filter(c => c.groupId === groupId)
            const otherCalcs = prev.filter(c => c.groupId !== groupId)

            const newGroupCalcs = [...groupCalcs]
            const [moved] = newGroupCalcs.splice(fromIndex, 1)
            newGroupCalcs.splice(toIndex, 0, moved)

            return [...otherCalcs, ...newGroupCalcs]
        })
    }, [setCalculations])

    return {
        addCalculationsGroup,
        updateCalculationsGroup,
        removeCalculationsGroup,
        addCalculation,
        updateCalculation,
        removeCalculation,
        reorderCalculations
    }
}
