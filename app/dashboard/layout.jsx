'use client'

import { Suspense } from 'react'
import { DashboardProvider } from './context/DashboardContext'
import DashboardShell from './components/DashboardShell'

function DashboardLoading() {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="text-slate-500">Loading...</div>
        </div>
    )
}

export default function DashboardLayout({ children }) {
    return (
        <Suspense fallback={<DashboardLoading />}>
            <DashboardProvider>
                <DashboardShell>
                    {children}
                </DashboardShell>
            </DashboardProvider>
        </Suspense>
    )
}
