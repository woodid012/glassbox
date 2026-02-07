'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Check, Loader2, CheckCircle, FileSpreadsheet, Code, Save } from 'lucide-react'
import { useDashboard } from '../context/DashboardContext'

const NAV_CONFIG = [
    { id: 'key-periods', label: 'Key Periods', href: '/dashboard/key-periods' },
    { id: 'inputs', label: 'Inputs', href: '/dashboard/inputs' },
    { id: 'modules', label: 'Modules', href: '/dashboard/modules' },
    { id: 'calculations', label: 'Calculations', href: '/dashboard/calculations' },
    { id: 'flows', label: 'Flows', href: '/dashboard/flows' },
    { id: '_divider' },
    { id: 'outputs', label: 'Outputs', href: '/dashboard/outputs' },
    { id: 'validation', label: 'Validation', href: '/dashboard/validation' },
    { id: 'array-view', label: 'Array View', href: '/dashboard/array-view' },
    { id: '_divider2' },
    { id: 'import', label: 'Import', href: '/dashboard/import' },
]

export default function DashboardNavigation() {
    const pathname = usePathname()
    const [exportStatus, setExportStatus] = useState(null)
    const [manualSaveStatus, setManualSaveStatus] = useState(null)

    const {
        derived,
        handlers,
        autoSaveState,
        appState
    } = useDashboard()

    const { timeline } = derived
    const { saveStatus, hasLoadedFromStorage } = autoSaveState

    const handleManualSave = async () => {
        if (!hasLoadedFromStorage) {
            setManualSaveStatus('error')
            console.error('Manual save blocked: data has not finished loading yet')
            setTimeout(() => setManualSaveStatus(null), 3000)
            return
        }
        // Validate state has meaningful data before saving
        const inputs = appState?.inputGlass || []
        const calcs = appState?.calculations || []
        if (inputs.length === 0 && calcs.length === 0) {
            setManualSaveStatus('error')
            console.error('Manual save blocked: appState appears empty (0 inputs, 0 calculations)')
            setTimeout(() => setManualSaveStatus(null), 3000)
            return
        }
        setManualSaveStatus('saving')
        try {
            const { serializeState } = await import('@/utils/glassInputsState')
            const serialized = serializeState(appState)
            const response = await fetch('/api/model-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serialized)
            })
            if (response.ok) {
                setManualSaveStatus('saved')
                setTimeout(() => setManualSaveStatus(null), 2000)
            } else {
                throw new Error('Save failed')
            }
        } catch (err) {
            console.error('Manual save error:', err)
            setManualSaveStatus('error')
            setTimeout(() => setManualSaveStatus(null), 3000)
        }
    }

    const handleExport = async (format) => {
        setExportStatus(format)
        try {
            const endpoint = format === 'python' ? '/api/export/python' : '/api/export/excel'
            const response = await fetch(endpoint)

            if (!response.ok) {
                throw new Error('Export failed')
            }

            const blob = await response.blob()
            const filename = format === 'python' ? 'glassbox_model.zip' : 'GlassBox_Model.xlsx'

            // Create download link
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            setExportStatus(null)
        } catch (err) {
            console.error('Export error:', err)
            setExportStatus('error')
            setTimeout(() => setExportStatus(null), 3000)
        }
    }

    const isActive = (href) => pathname === href

    return (
        <div className="bg-white border-b border-slate-200">
            <div className="max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* Navigation Links */}
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                        {NAV_CONFIG.map(item =>
                            item.id.startsWith('_divider') ? (
                                <div key={item.id} className="w-px bg-slate-300 mx-1 self-stretch" />
                            ) : (
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
                            )
                        )}
                    </div>

                    {/* Live calculation indicator */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 border border-green-300">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-semibold">Live</span>
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
                                <Check className="w-4 h-4 text-amber-500" />
                                <span className="text-xs text-amber-600 font-medium">Auto-save OFF</span>
                            </>
                        )}
                    </div>

                    {/* Manual Save Button */}
                    <button
                        onClick={handleManualSave}
                        disabled={manualSaveStatus === 'saving'}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                            manualSaveStatus === 'saved'
                                ? 'bg-green-50 border-green-300 text-green-700'
                                : manualSaveStatus === 'error'
                                ? 'bg-red-50 border-red-300 text-red-700'
                                : 'bg-blue-50 border-blue-300 hover:bg-blue-100 text-blue-700'
                        }`}
                        title="Save current state to JSON files"
                    >
                        {manualSaveStatus === 'saving' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        <span className="text-xs font-medium">
                            {manualSaveStatus === 'saving' ? 'Saving...' :
                             manualSaveStatus === 'saved' ? 'Saved!' :
                             manualSaveStatus === 'error' ? 'Error' : 'Save'}
                        </span>
                    </button>

                    {/* Export Buttons */}
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-xs text-slate-500 mr-1">Export:</span>
                        <button
                            onClick={() => handleExport('python')}
                            disabled={exportStatus !== null}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                exportStatus === 'python'
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'hover:bg-slate-200 text-slate-600'
                            }`}
                            title="Export model to Python package"
                        >
                            {exportStatus === 'python' ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <Code className="w-3 h-3" />
                            )}
                            Python
                        </button>
                        <button
                            onClick={() => handleExport('excel')}
                            disabled={exportStatus !== null}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                exportStatus === 'excel'
                                    ? 'bg-green-100 text-green-600'
                                    : 'hover:bg-slate-200 text-slate-600'
                            }`}
                            title="Export model to Excel workbook"
                        >
                            {exportStatus === 'excel' ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <FileSpreadsheet className="w-3 h-3" />
                            )}
                            Excel
                        </button>
                    </div>

                </div>
            </div>
        </div>
    )
}
