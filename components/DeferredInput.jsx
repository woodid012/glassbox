'use client'

import { useState, useEffect, useRef } from 'react'

/**
 * Input that only commits on blur or Enter (prevents recalc on every keystroke)
 * Shared between calculations and modules pages
 */
export function DeferredInput({
    value,
    onChange,
    displayValue,
    type = 'text',
    className = '',
    placeholder = '',
    ...props
}) {
    const [localValue, setLocalValue] = useState(value ?? '')
    const [focused, setFocused] = useState(false)
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

    const showValue = (!focused && displayValue != null) ? displayValue : localValue

    return (
        <input
            ref={inputRef}
            {...props}
            type={type}
            value={showValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); handleCommit() }}
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
