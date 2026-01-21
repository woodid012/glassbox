import React, { useState, useRef, useEffect } from 'react'

// Editable cell that commits on blur or Enter
export default function EditableCell({ value, onChange, type = 'text', className = '', isSelected, onSelect, onShiftSelect }) {
    const [localValue, setLocalValue] = useState(value ?? '')
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

    return (
        <input
            ref={inputRef}
            type={type}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleCommit}
            onClick={(e) => {
                if (e.shiftKey && onShiftSelect) {
                    onShiftSelect()
                } else if (onSelect) {
                    onSelect()
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
}
