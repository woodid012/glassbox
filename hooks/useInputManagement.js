/**
 * useInputManagement Hook
 * Orchestrator that composes domain-specific hooks for all input CRUD operations.
 *
 * Domain hooks:
 * - useKeyPeriodManagement: Key periods, grouping, linked period recalculation
 * - useInputType1Management: Input Type 1 groups and inputs
 * - useInputGlassManagement: Input Glass groups, inputs, and subgroups
 * - useIndexManagement: Indexation entries
 * - useCalculationManagement: Calculations and calculation groups
 * - useInputGroupManagement: Original input groups and input values
 */
import { useKeyPeriodManagement } from './useKeyPeriodManagement'
import { useInputType1Management } from './useInputType1Management'
import { useInputGlassManagement } from './useInputGlassManagement'
import { useIndexManagement } from './useIndexManagement'
import { useCalculationManagement } from './useCalculationManagement'
import { useInputGroupManagement } from './useInputGroupManagement'

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
    const keyPeriodOps = useKeyPeriodManagement({
        config, keyPeriods, setKeyPeriods,
        collapsedKeyPeriodGroups, setCollapsedKeyPeriodGroups,
        inputType1Groups, setInputType1Groups,
        inputGlassGroups, setInputGlassGroups,
        inputGlass
    })

    const inputType1Ops = useInputType1Management({
        config, inputType1, setInputType1,
        inputType1Groups, setInputType1Groups
    })

    const inputGlassOps = useInputGlassManagement({
        config, inputGlass, setInputGlass,
        inputGlassGroups, setInputGlassGroups
    })

    const indexOps = useIndexManagement({
        config, indices, setIndices
    })

    const calculationOps = useCalculationManagement({
        config, calculations, setCalculations,
        calculationsGroups, setCalculationsGroups
    })

    const inputGroupOps = useInputGroupManagement({
        config, groups, setGroups,
        inputs, setInputs, setCollapsedGroups
    })

    return {
        ...keyPeriodOps,
        ...inputType1Ops,
        ...inputGlassOps,
        ...indexOps,
        ...calculationOps,
        ...inputGroupOps
    }
}
