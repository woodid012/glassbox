'use client'

import { createContext, useContext, useState } from 'react'
import { useDashboardState } from '../hooks/useDashboardState'

const DashboardContext = createContext(null)

export function DashboardProvider({ children }) {
    const [viewMode, setViewMode] = useState('Y')
    const [inputsEditMode, setInputsEditMode] = useState(true)

    const dashboardState = useDashboardState(viewMode)

    const value = {
        viewMode,
        setViewMode,
        inputsEditMode,
        setInputsEditMode,
        ...dashboardState
    }

    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    )
}

export function useDashboard() {
    const context = useContext(DashboardContext)
    if (!context) {
        throw new Error('useDashboard must be used within a DashboardProvider')
    }
    return context
}
