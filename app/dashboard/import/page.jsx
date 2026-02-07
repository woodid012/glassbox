'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    Upload, FileSpreadsheet, Check, X, AlertTriangle,
    Loader2, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react'

const MATCH_STATUS_CONFIG = {
    exact: { label: 'Exact', color: 'bg-green-100 text-green-700', icon: Check },
    good: { label: 'Good', color: 'bg-emerald-100 text-emerald-700', icon: Check },
    partial: { label: 'Partial', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
    mismatch: { label: 'Mismatch', color: 'bg-red-100 text-red-700', icon: X },
    new: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: null },
    kept: { label: 'Template', color: 'bg-slate-100 text-slate-600', icon: null },
}

export default function ImportPage() {
    const [recipes, setRecipes] = useState([])
    const [selectedRecipe, setSelectedRecipe] = useState('')
    const [file, setFile] = useState(null)
    const [dragOver, setDragOver] = useState(false)
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [applying, setApplying] = useState(false)
    const [applied, setApplied] = useState(false)
    const [showDetails, setShowDetails] = useState(false)

    // Load available recipes
    useEffect(() => {
        fetch('/api/recipes')
            .then(r => r.json())
            .then(data => {
                setRecipes(data.recipes || [])
                if (data.recipes?.length > 0) {
                    setSelectedRecipe(data.recipes[0].fingerprint)
                }
            })
            .catch(() => { /* ignore */ })
    }, [])

    const handleDrop = useCallback((e) => {
        e.preventDefault()
        setDragOver(false)
        const droppedFile = e.dataTransfer?.files?.[0]
        if (droppedFile && /\.(xlsx?|xlsb|xlsm)$/i.test(droppedFile.name)) {
            setFile(droppedFile)
            setResult(null)
            setError(null)
            setApplied(false)
        }
    }, [])

    const handleFileSelect = useCallback((e) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            setFile(selectedFile)
            setResult(null)
            setError(null)
            setApplied(false)
        }
    }, [])

    const handleImport = async () => {
        if (!file) return
        setImporting(true)
        setError(null)
        setResult(null)

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('recipe', selectedRecipe)
            formData.append('mode', selectedRecipe ? 'import' : 'extract')

            const response = await fetch('/api/excel-import', {
                method: 'POST',
                body: formData
            })

            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.error || 'Import failed')
            }

            setResult(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setImporting(false)
        }
    }

    const handleApply = async () => {
        // Find whichever updated inputs file was produced
        const updatedInputs = result?.files?.['model-inputs-updated.json']
            || result?.files?.['model-inputs-imported.json']
        if (!updatedInputs) return
        setApplying(true)

        try {
            const response = await fetch('/api/excel-import', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: updatedInputs })
            })

            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.error || 'Apply failed')
            }

            setApplied(true)
        } catch (err) {
            setError(err.message)
        } finally {
            setApplying(false)
        }
    }

    const matchReport = result?.files?.['match-report.json'] || result?.files?.['import-report.json']
    const hasUpdatedInputs = !!(result?.files?.['model-inputs-updated.json'] || result?.files?.['model-inputs-imported.json'])

    // Compute match summary - handle both pipeline (matches) and import (mappings) formats
    const matchItems = matchReport?.matches || matchReport?.input_matches || matchReport?.mappings || []
    const matchSummary = matchItems.length > 0
        ? {
            total: matchItems.length,
            exact: matchItems.filter(m => m.status === 'exact').length,
            good: matchItems.filter(m => m.status === 'good').length,
            partial: matchItems.filter(m => m.status === 'partial').length,
            mismatch: matchItems.filter(m => m.status === 'mismatch').length,
        }
        : null

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Excel Import</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Upload an Excel financial model to extract inputs and populate Glassbox
                </p>
            </div>

            {/* Recipe Selector */}
            {recipes.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                        Extraction Recipe
                    </label>
                    <select
                        value={selectedRecipe}
                        onChange={(e) => setSelectedRecipe(e.target.value)}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="">Auto-detect (no recipe)</option>
                        {recipes.map(r => (
                            <option key={r.fingerprint} value={r.fingerprint}>
                                {r.name} ({r.type}{r.sheets ? `, ${r.sheets} sheets` : ''})
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                        Recipes define how to map Excel cells to Glassbox inputs
                    </p>
                </div>
            )}

            {/* File Upload Zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragOver
                        ? 'border-indigo-400 bg-indigo-50'
                        : file
                            ? 'border-green-300 bg-green-50'
                            : 'border-slate-300 bg-slate-50 hover:border-slate-400'
                }`}
            >
                {file ? (
                    <div className="flex items-center justify-center gap-3">
                        <FileSpreadsheet className="w-8 h-8 text-green-600" />
                        <div className="text-left">
                            <p className="font-medium text-slate-900">{file.name}</p>
                            <p className="text-xs text-slate-500">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                        </div>
                        <button
                            onClick={() => { setFile(null); setResult(null); setApplied(false) }}
                            className="ml-4 p-1 hover:bg-slate-200 rounded"
                        >
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>
                ) : (
                    <div>
                        <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                        <p className="text-slate-600 font-medium">Drop an Excel file here</p>
                        <p className="text-xs text-slate-400 mt-1">or</p>
                        <label className="inline-block mt-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 cursor-pointer">
                            Browse Files
                            <input
                                type="file"
                                accept=".xlsx,.xls,.xlsb,.xlsm"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                        </label>
                        <p className="text-xs text-slate-400 mt-2">
                            Supports .xlsx, .xls, .xlsb, .xlsm
                        </p>
                    </div>
                )}
            </div>

            {/* Import Button */}
            {file && !result && (
                <button
                    onClick={handleImport}
                    disabled={importing}
                    className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {importing ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Extracting inputs...
                        </>
                    ) : (
                        <>
                            <FileSpreadsheet className="w-4 h-4" />
                            Extract Inputs
                        </>
                    )}
                </button>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-medium text-red-800">Import Error</p>
                        <p className="text-sm text-red-600 mt-1">{error}</p>
                    </div>
                </div>
            )}

            {/* Match Results */}
            {matchSummary && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                        <h2 className="font-semibold text-slate-900">Match Results</h2>
                        <div className="flex gap-4 mt-2">
                            <span className="text-sm">
                                <span className="font-medium text-green-700">{matchSummary.exact + matchSummary.good}</span> matched
                            </span>
                            <span className="text-sm">
                                <span className="font-medium text-amber-700">{matchSummary.partial}</span> partial
                            </span>
                            <span className="text-sm">
                                <span className="font-medium text-red-700">{matchSummary.mismatch}</span> mismatch
                            </span>
                            <span className="text-sm text-slate-500">{matchSummary.total} total</span>
                        </div>
                    </div>

                    {/* Toggle details */}
                    <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="w-full px-4 py-2 flex items-center justify-between text-sm text-slate-600 hover:bg-slate-50"
                    >
                        <span>{showDetails ? 'Hide' : 'Show'} detailed matches</span>
                        {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showDetails && (
                        <div className="max-h-96 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="text-left px-4 py-2 text-slate-600">Input</th>
                                        <th className="text-left px-4 py-2 text-slate-600">Status</th>
                                        <th className="text-left px-4 py-2 text-slate-600">Excel Source</th>
                                        <th className="text-right px-4 py-2 text-slate-600">Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matchItems.map((match, idx) => {
                                        const config = MATCH_STATUS_CONFIG[match.status] || MATCH_STATUS_CONFIG.new
                                        const Icon = config.icon
                                        return (
                                            <tr key={idx} className="border-t border-slate-100">
                                                <td className="px-4 py-2 font-medium text-slate-900">
                                                    {match.name || match.ref || `Input ${idx + 1}`}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
                                                        {Icon && <Icon className="w-3 h-3" />}
                                                        {config.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-slate-500 text-xs">
                                                    {match.source || '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono text-xs">
                                                    {match.value !== undefined ? String(match.value) : '-'}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Raw output (if no match report) */}
            {result && !matchReport && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <h2 className="font-semibold text-slate-900 mb-2">Extraction Output</h2>
                    <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto max-h-64">
                        {result.stdout || JSON.stringify(result.files, null, 2)}
                    </pre>
                </div>
            )}

            {/* Apply Button */}
            {hasUpdatedInputs && !applied && (
                <button
                    onClick={handleApply}
                    disabled={applying}
                    className="w-full py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {applying ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Applying inputs...
                        </>
                    ) : (
                        <>
                            <Check className="w-4 h-4" />
                            Apply to Model
                        </>
                    )}
                </button>
            )}

            {/* Applied success */}
            {applied && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-600" />
                    <div>
                        <p className="font-medium text-green-800">Inputs Applied</p>
                        <p className="text-sm text-green-600 mt-1">
                            Model inputs updated. Refresh the dashboard to see changes.
                        </p>
                    </div>
                    <button
                        onClick={() => window.location.href = '/dashboard/inputs'}
                        className="ml-auto px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 flex items-center gap-1"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Go to Inputs
                    </button>
                </div>
            )}
        </div>
    )
}
