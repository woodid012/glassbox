'use client'

import React, { useState, Suspense } from 'react'
import { Hexagon } from 'lucide-react'
import DashboardContent from './components/DashboardContent'

function DashboardLayout() {
    const [viewMode, setViewMode] = useState('Y')

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Main Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
                <div className="max-w-[1920px] mx-auto px-6 py-3">
                    <div className="flex items-center justify-between">
                        {/* Left: Logo and Title */}
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                <Hexagon className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-slate-900">Glass Inputs</h1>
                                <p className="text-xs text-slate-500">Financial Model Builder</p>
                            </div>
                        </div>

                        {/* Right: View Mode Selector */}
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500">View:</span>
                            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                                {['M', 'Q', 'Y', 'FY'].map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => setViewMode(mode)}
                                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                                            viewMode === mode
                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                                        }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main>
                <DashboardContent
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                />
            </main>
        </div>
    )
}

function DashboardLoading() {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="text-slate-500">Loading...</div>
        </div>
    )
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<DashboardLoading />}>
            <DashboardLayout />
        </Suspense>
    )
}
