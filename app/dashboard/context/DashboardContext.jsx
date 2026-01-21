'use client'

import { createContext, useContext, useState } from 'react'
import { useDashboardState } from '../hooks/useDashboardState'

const DashboardContext = createContext(null)

export function DashboardProvider({ children }) {
    const [viewMode, setViewMode] = useState('Y')

    const dashboardState = useDashboardState(viewMode)

    const value = {
        viewMode,
        setViewMode,
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
