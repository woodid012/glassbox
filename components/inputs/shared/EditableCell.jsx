import React, { useState, useRef, useEffect, memo } from 'react'

// Format number with commas for display (not while editing)
function formatDisplayNumber(val) {
    const num = parseFloat(val)
    if (isNaN(num)) return val
    // Preserve decimal places the user entered
    const str = String(val)
    const decimalIdx = str.indexOf('.')
    const decimals = Math.min(decimalIdx >= 0 ? str.length - decimalIdx - 1 : 0, 20)
    return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: Math.max(decimals, 2)
    })
}

// Editable cell that commits on blur or Enter
const EditableCell = memo(function EditableCell({ value, onChange, type = 'text', className = '', isSelected, onSelect, onShiftSelect, onPasteMultiCell }) {
    const [localValue, setLocalValue] = useState(value ?? '')
    const [isFocused, setIsFocused] = useState(false)
    const inputRef = useRef(null)

    useEffect(() => {
        setLocalValue(value ?? '')
    }, [value])

    const handleCommit = () => {
        if (type === 'number') {
            const num = parseFloat(localValue) || 0
            if (num !== value) onChange(num)
        } else {
            if (localValue !== value) onChange(localValue)
        }
    }

    // For number type: show formatted value when not focused, raw value when editing
    const displayValue = (type === 'number' && !isFocused && localValue !== '')
        ? formatDisplayNumber(localValue)
        : localValue

    return (
        <input
            ref={inputRef}
            type={isFocused ? type : 'text'}
            value={displayValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
                setIsFocused(false)
                handleCommit()
            }}
            onClick={(e) => {
                if (e.shiftKey && onShiftSelect) {
                    onShiftSelect()
                } else if (onSelect) {
                    onSelect()
                }
            }}
            onPaste={(e) => {
                if (!onPasteMultiCell) return
                const text = (e.clipboardData || window.clipboardData)?.getData('text/plain')
                if (text && (text.includes('\t') || text.includes('\n'))) {
                    e.preventDefault()
                    onPasteMultiCell(text)
                }
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.target.blur()
                } else if (e.key === 'Tab') {
                    handleCommit()
                }
            }}
            className={`w-full border-0 bg-transparent px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                type === 'number' ? 'text-right text-[11px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : 'text-sm'
            } ${isSelected ? 'bg-blue-100' : ''} ${className}`}
        />
    )
}, (prev, next) => {
    // Only re-render when value, isSelected, or className changes
    return prev.value === next.value &&
           prev.isSelected === next.isSelected &&
           prev.className === next.className &&
           prev.type === next.type &&
           prev.onPasteMultiCell === next.onPasteMultiCell
})

export default EditableCell
