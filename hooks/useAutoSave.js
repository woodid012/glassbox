/**
 * useAutoSave Hook
 * Handles auto-loading and debounced auto-saving of application state
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { serializeState, deserializeState, getDefaultState } from '@/utils/glassInputsState'

// Debounce delay for auto-save (in milliseconds)
const AUTOSAVE_DEBOUNCE_MS = 1500

/**
 * Hook for managing auto-save and auto-load functionality
 * @param {Object} appState - Current application state
 * @param {Function} setAppState - State setter function
 * @returns {Object} Save/reset handlers and status
 */
export function useAutoSave(appState, setAppState) {
    // Track if we've loaded from storage (to prevent overwriting with defaults)
    const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)

    // Auto-save state
    const [isAutoSaving, setIsAutoSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState(null) // timestamp of last save
    const [saveStatus, setSaveStatus] = useState(null) // 'saving' | 'saved' | 'error' | null

    // Ref to track debounce timer
    const saveTimerRef = useRef(null)

    // Auto-load on mount - priority: split files → legacy autosave → original → defaults
    useEffect(() => {
        let mounted = true

        const loadState = async () => {
            try {
                // Try split model-state files first (merges model-inputs, model-calculations, model-ui-state)
                const modelStateResponse = await fetch('/api/model-state')
                if (modelStateResponse.ok) {
                    const modelState = await modelStateResponse.json()
                    if (mounted) {
                        const deserialized = deserializeState(modelState)
                        setAppState(deserialized)
                        setHasLoadedFromStorage(true)
                        // Sync localStorage
                        try {
                            localStorage.setItem('glass-inputs-state-local', JSON.stringify(serializeState(deserialized)))
                        } catch (e) {
                            console.error('Error syncing localStorage:', e)
                        }
                        return
                    }
                }
            } catch (e) {
                console.error('Error loading from model-state:', e)
            }

            try {
                // Fallback: try legacy autosave file
                const autosaveResponse = await fetch('/api/glass-inputs-autosave')
                if (autosaveResponse.ok) {
                    const autosaveState = await autosaveResponse.json()
                    if (mounted) {
                        const deserialized = deserializeState(autosaveState)
                        setAppState(deserialized)
                        setHasLoadedFromStorage(true)
                        try {
                            localStorage.setItem('glass-inputs-state-local', JSON.stringify(serializeState(deserialized)))
                        } catch (e) {
                            console.error('Error syncing localStorage:', e)
                        }
                        return
                    }
                }
            } catch (e) {
                console.error('Error loading from autosave:', e)
            }

            try {
                // If autosave doesn't exist, try original template
                const originalResponse = await fetch('/api/glass-inputs-original')
                if (originalResponse.ok) {
                    const originalState = await originalResponse.json()
                    if (mounted) {
                        const deserialized = deserializeState(originalState)
                        setAppState(deserialized)
                        setHasLoadedFromStorage(true)
                        // Sync localStorage
                        try {
                            localStorage.setItem('glass-inputs-state-local', JSON.stringify(serializeState(deserialized)))
                        } catch (e) {
                            console.error('Error syncing localStorage:', e)
                        }
                        return
                    }
                }
            } catch (e) {
                console.error('Error loading from original:', e)
            }

            // If neither exists, check localStorage as fallback
            if (typeof window !== 'undefined') {
                try {
                    const localData = localStorage.getItem('glass-inputs-state-local')
                    if (localData) {
                        const parsed = JSON.parse(localData)
                        if (mounted) {
                            const deserialized = deserializeState(parsed)
                            setAppState(deserialized)
                            setHasLoadedFromStorage(true)
                            return
                        }
                    }
                } catch (e) {
                    console.error('Error loading from localStorage:', e)
                }
            }

            // If nothing exists, mark as loaded (will use default state)
            if (mounted) {
                setHasLoadedFromStorage(true)
            }
        }

        loadState()

        return () => {
            mounted = false
        }
    }, [setAppState])

    // Debounced auto-save to server on every state change
    useEffect(() => {
        if (!hasLoadedFromStorage) return

        // Clear any existing timer
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current)
        }

        // Set saving status immediately
        setSaveStatus('saving')

        // Save to localStorage immediately (fast)
        try {
            const serialized = serializeState(appState)
            localStorage.setItem('glass-inputs-state-local', JSON.stringify(serialized))
        } catch (e) {
            console.error('Error saving to localStorage:', e)
        }

        // Debounced save to server (split into 3 files)
        saveTimerRef.current = setTimeout(async () => {
            setIsAutoSaving(true)
            try {
                const serialized = serializeState(appState)
                const response = await fetch('/api/model-state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(serialized)
                })

                if (response.ok) {
                    setLastSaved(new Date())
                    setSaveStatus('saved')
                    // Clear status after 2 seconds
                    setTimeout(() => setSaveStatus(null), 2000)
                } else {
                    throw new Error('Failed to autosave')
                }
            } catch (error) {
                console.error('Error auto-saving state:', error)
                setSaveStatus('error')
                setTimeout(() => setSaveStatus(null), 3000)
            } finally {
                setIsAutoSaving(false)
            }
        }, AUTOSAVE_DEBOUNCE_MS)

        // Cleanup timer on unmount or state change
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current)
            }
        }
    }, [appState, hasLoadedFromStorage])

    // Revert to original - deletes autosave and loads original template
    const handleRevertToOriginal = useCallback(async () => {
        if (!window.confirm('Are you sure you want to revert to the original template? All your changes will be lost.')) {
            return
        }

        try {
            // Delete split model-state files
            await fetch('/api/model-state', { method: 'DELETE' })
            // Also delete legacy autosave for clean slate
            await fetch('/api/glass-inputs-autosave', { method: 'DELETE' })

            // Clear localStorage
            if (typeof window !== 'undefined') {
                localStorage.removeItem('glass-inputs-state-local')
            }

            // Try to load original template
            try {
                const originalResponse = await fetch('/api/glass-inputs-original')
                if (originalResponse.ok) {
                    const originalState = await originalResponse.json()
                    const deserialized = deserializeState(originalState)
                    setAppState(deserialized)
                    return
                }
            } catch (e) {
                console.error('Error loading original template:', e)
            }

            // If original template doesn't exist, reset to defaults
            setAppState(getDefaultState())
        } catch (error) {
            console.error('Error reverting state:', error)
            alert('Error reverting to original. Please try again.')
        }
    }, [setAppState])

    return {
        hasLoadedFromStorage,
        isAutoSaving,
        lastSaved,
        saveStatus,
        handleRevertToOriginal
    }
}
