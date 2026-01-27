import React, { useState, useRef, useEffect, forwardRef } from 'react'

// Inline Editable Cell - double-click to edit (Excel-like)
export const InlineCell = forwardRef(function InlineCell({ value, onChange, onNavigate, onPasteMultiple, rowId, colIndex, category, isReadOnly = false }, ref) {
    const inputRef = useRef(null)
    const displayRef = useRef(null)
    const [localValue, setLocalValue] = useState(value)
    const [isEditing, setIsEditing] = useState(false)
    const [isSelected, setIsSelected] = useState(false)

    // Expose focus/select methods via ref
    React.useImperativeHandle(ref, () => ({
        focus: () => {
            setIsEditing(true)
            setTimeout(() => {
                inputRef.current?.focus()
                inputRef.current?.select()
            }, 0)
        },
        select: () => {
            setIsSelected(true)
            displayRef.current?.focus()
        },
    }))

    // Sync local value when external value changes (but not while editing)
    useEffect(() => {
        if (!isEditing) {
            setLocalValue(value)
        }
    }, [value, isEditing])

    const commitValue = () => {
        if (category === 'flag') {
            // Flags must be 0 or 1
            const flagVal = localValue === '1' || localValue === 1 || localValue === 'true' || localValue === true ? 1 : 0
            if (flagVal !== value) {
                onChange(flagVal)
            } else {
                setLocalValue(value)
            }
        } else {
            const numVal = parseFloat(localValue)
            if (!isNaN(numVal) && numVal !== value) {
                onChange(numVal)
            } else if (localValue === '' || isNaN(parseFloat(localValue))) {
                // Reset to original if invalid
                setLocalValue(value)
            }
        }
    }

    const handleBlur = () => {
        setIsEditing(false)
        setIsSelected(false)
        commitValue()
    }

    const handleFocus = (e) => {
        setIsEditing(true)
        e.target.select()
    }

    const handleDoubleClick = (e) => {
        if (isReadOnly) return
        e.preventDefault()
        setIsEditing(true)
        setTimeout(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        }, 0)
    }

    const handleDisplayClick = () => {
        if (isReadOnly) return
        setIsSelected(true)
    }

    const handleDisplayKeyDown = (e) => {
        if (isReadOnly) {
            // Allow navigation even for read-only cells
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                onNavigate?.(e.key.replace('Arrow', '').toLowerCase(), rowId, colIndex)
            } else if (e.key === 'Tab') {
                onNavigate?.('next', rowId, colIndex)
            }
            return
        }
        // Allow typing directly when cell is selected
        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
            setIsEditing(true)
            setLocalValue('')
            setTimeout(() => {
                inputRef.current?.focus()
                if (e.key.length === 1) {
                    inputRef.current.value = e.key
                }
            }, 0)
        } else if (e.key === 'Enter' || e.key === 'F2') {
            setIsEditing(true)
            setTimeout(() => {
                inputRef.current?.focus()
                inputRef.current?.select()
            }, 0)
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            onNavigate?.(e.key.replace('Arrow', '').toLowerCase(), rowId, colIndex)
        } else if (e.key === 'Tab') {
            onNavigate?.('next', rowId, colIndex)
        }
    }

    const handleDisplayPaste = (e) => {
        if (isReadOnly) return
        handlePaste(e)
    }

    const handlePaste = (e) => {
        if (isReadOnly) return

        const pastedText = e.clipboardData.getData('text')
        // Parse tab-separated values (first row only for now)
        const firstRow = pastedText.split('\n')[0] // Take first row if multiple rows pasted
        const values = firstRow.split('\t').map(v => {
            const trimmed = v.trim().replace(/,/g, '') // Remove commas from numbers
            const parsed = parseFloat(trimmed)
            return isNaN(parsed) ? 0 : parsed
        })

        if (values.length > 1 && onPasteMultiple) {
            e.preventDefault()
            onPasteMultiple(values)
        }
        // If single value, let default paste behavior work
    }

    const handleInputKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            commitValue()
            inputRef.current?.blur()
        } else if (e.key === 'Tab') {
            e.preventDefault()
            commitValue()
            onNavigate?.('next', rowId, colIndex)
        } else if (e.key === 'Escape') {
            setLocalValue(value)
            inputRef.current?.blur()
        } else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) {
            e.preventDefault()
            commitValue()
            onNavigate?.('right', rowId, colIndex)
        } else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) {
            e.preventDefault()
            commitValue()
            onNavigate?.('left', rowId, colIndex)
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            commitValue()
            onNavigate?.('down', rowId, colIndex)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            commitValue()
            onNavigate?.('up', rowId, colIndex)
        }
    }

    if (isEditing) {
        const handleInputChange = (e) => {
            const newValue = e.target.value.replace(/,/g, '')
            if (category === 'flag') {
                // Only allow 0, 1, or empty
                if (newValue === '' || newValue === '0' || newValue === '1') {
                    setLocalValue(newValue)
                }
            } else {
                setLocalValue(newValue)
            }
        }

        return (
            <input
                ref={inputRef}
                type="text"
                inputMode={category === 'flag' ? 'numeric' : 'decimal'}
                value={localValue}
                onChange={handleInputChange}
                onBlur={handleBlur}
                onFocus={handleFocus}
                onKeyDown={handleInputKeyDown}
                onPaste={handlePaste}
                className="w-full h-full bg-white px-2 py-1 text-right text-sm text-slate-900 outline-none border-0 ring-2 ring-indigo-500 ring-inset"
                maxLength={category === 'flag' ? 1 : undefined}
            />
        )
    }

    return (
        <div
            ref={displayRef}
            tabIndex={0}
            onDoubleClick={handleDoubleClick}
            onClick={handleDisplayClick}
            onKeyDown={handleDisplayKeyDown}
            onPaste={handleDisplayPaste}
            className={`w-full h-full px-2 py-1 text-right text-sm text-slate-900 outline-none cursor-cell
                ${isReadOnly ? 'bg-slate-200/60' : isSelected ? 'bg-indigo-50 ring-1 ring-indigo-400' : 'hover:bg-slate-100'}
                ${category === 'flag' ? 'flex items-center justify-center' : ''}
                transition-all focus:outline-none`}
        >
            {category === 'flag' ? (
                <span className="text-slate-700">{value === 1 ? '1' : '0'}</span>
            ) : (
                typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : value
            )}
        </div>
    )
})

// Read-only display cell for aggregated views
export function DisplayCell({ value, category, isTimeline = false }) {
    const isNegative = typeof value === 'number' && value < 0
    return (
        <div className={`cell-display text-right tabular-nums ${isNegative ? 'text-red-600' : 'text-slate-900'} text-[11px] px-1 py-0.5 bg-slate-200/60 ${category === 'flag' ? 'flex items-center justify-center' : ''}`}>
            {category === 'flag' ? (
                <span className="text-slate-700">{value === 1 ? '1' : '0'}</span>
            ) : (
                typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 1 }) : value
            )}
        </div>
    )
}

