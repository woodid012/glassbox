'use client'

import { useState, useEffect, useRef } from 'react'

/**
 * Input that only commits on blur or Enter (prevents recalc on every keystroke)
 * Shared between calculations and modules pages
 */
export function DeferredInput({
    value,
    onChange,
    type = 'text',
    className = '',
    placeholder = '',
    ...props
}) {
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
            {...props}
            type={type}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleCommit}
            placeholder={placeholder}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.target.blur()
                }
                props.onKeyDown?.(e)
            }}
            className={className}
        />
    )
}

export default DeferredInput
