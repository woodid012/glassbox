/**
 * useIndexManagement Hook
 * Handles CRUD operations for indexation entries
 */
import { useCallback } from 'react'

export function useIndexManagement({
    config,
    indices,
    setIndices
}) {
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

    return {
        addIndex,
        updateIndex,
        removeIndex
    }
}
