'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Settings, RotateCcw, Check, Loader2, Camera } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'

const NAV_CONFIG = [
    { id: 'key-periods', label: 'Key Periods', href: '/dashboard/key-periods' },
    { id: 'inputs', label: 'Inputs', href: '/dashboard/inputs' },
    { id: 'modules', label: 'Modules', href: '/dashboard/modules' },
    { id: 'calculations', label: 'Calculations', href: '/dashboard/calculations' },
    { id: 'array-view', label: 'Array View', href: '/dashboard/array-view' },
    { id: 'notes', label: 'Notes', href: '/dashboard/notes' },
]

export default function DashboardNavigation() {
    const pathname = usePathname()
    const [snapshotStatus, setSnapshotStatus] = useState(null)

    const {
        appState,
        setters,
        derived,
        handlers,
        autoSaveState
    } = useDashboard()

    const { showConfig } = appState
    const { setShowConfig } = setters
    const { timeline } = derived
    const { handleRevertToOriginal } = handlers
    const { saveStatus } = autoSaveState

    const handleSnapshot = async () => {
        setSnapshotStatus('saving')
        try {
            const res = await fetch('/api/snapshot', { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                setSnapshotStatus('saved')
                setTimeout(() => setSnapshotStatus(null), 2000)
            } else {
                setSnapshotStatus('error')
                setTimeout(() => setSnapshotStatus(null), 3000)
            }
        } catch (err) {
            setSnapshotStatus('error')
            setTimeout(() => setSnapshotStatus(null), 3000)
        }
    }

    const isActive = (href) => pathname === href

    return (
        <div className="bg-white border-b border-slate-200">
            <div className="max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* Navigation Links */}
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-300">
                        {NAV_CONFIG.map(item => (
                            <Link
                                key={item.id}
                                href={item.href}
                                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                                    isActive(item.href)
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                                }`}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>

                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                        {timeline.periods} periods
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Auto-save Status Indicator */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                        {saveStatus === 'saving' ? (
                            <>
                                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                                <span className="text-xs text-slate-500">Saving...</span>
                            </>
                        ) : saveStatus === 'saved' ? (
                            <>
                                <Check className="w-4 h-4 text-green-600" />
                                <span className="text-xs text-green-600">Saved</span>
                            </>
                        ) : saveStatus === 'error' ? (
                            <>
                                <span className="w-4 h-4 text-red-600">!</span>
                                <span className="text-xs text-red-600">Error</span>
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4 text-slate-400" />
                                <span className="text-xs text-slate-400">Auto-save on</span>
                            </>
                        )}
                    </div>

                    {/* Snapshot Button */}
                    <button
                        onClick={handleSnapshot}
                        disabled={snapshotStatus === 'saving'}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                            snapshotStatus === 'saved'
                                ? 'bg-green-50 border-green-300 text-green-700'
                                : snapshotStatus === 'error'
                                ? 'bg-red-50 border-red-300 text-red-700'
                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                        }`}
                        title="Create manual snapshot backup"
                    >
                        {snapshotStatus === 'saving' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Camera className="w-4 h-4" />
                        )}
                        <span className="text-xs font-medium">
                            {snapshotStatus === 'saving' ? 'Saving...' :
                             snapshotStatus === 'saved' ? 'Saved!' :
                             snapshotStatus === 'error' ? 'Error' : 'Snapshot'}
                        </span>
                    </button>

                    {/* Revert to Original Button */}
                    <button
                        onClick={handleRevertToOriginal}
                        className="p-2 rounded-lg transition-colors bg-amber-600 text-white hover:bg-amber-700"
                        title="Revert to original template (discard all changes)"
                    >
                        <RotateCcw className="w-5 h-5" />
                    </button>

                    {/* Settings Toggle */}
                    <button
                        onClick={() => setShowConfig(!showConfig)}
                        className={`p-2 rounded-lg transition-colors ${
                            showConfig
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-300'
                        }`}
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    )
}
