import React from 'react'
import { theme, cn } from './theme'

export default function InputField({
    type = 'text',
    value,
    onChange,
    className = '',
    variant = 'base',
    ...props
}) {
    const inputClass = theme.input[variant] || theme.input.base

    return (
        <input
            type={type}
            value={value}
            onChange={onChange}
            className={cn(inputClass, className)}
            {...props}
        />
    )
}

// Specialized input components
export function NumberInput({ value, onChange, className = '', ...props }) {
    return (
        <InputField
            type="number"
            value={value}
            onChange={onChange}
            variant="number"
            className={className}
            {...props}
        />
    )
}

// Legacy DateInput - kept for backwards compatibility
export function DateInput({ value, onChange, className = '', ...props }) {
    return (
        <InputField
            type="date"
            value={value}
            onChange={onChange}
            variant="large"
            className={className}
            {...props}
        />
    )
}

// Year/Month selector component
// Using numbers for dropdown display (user preference), text display kept elsewhere
const MONTHS = [
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4' },
    { value: 5, label: '5' },
    { value: 6, label: '6' },
    { value: 7, label: '7' },
    { value: 8, label: '8' },
    { value: 9, label: '9' },
    { value: 10, label: '10' },
    { value: 11, label: '11' },
    { value: 12, label: '12' }
]

export function YearMonthInput({
    year,
    month,
    onYearChange,
    onMonthChange,
    onChange,
    minYear = 2000,
    maxYear = 2100,
    className = '',
    disabled = false,
    compact = false,
    ...props
}) {
    // Generate year options
    const years = []
    for (let y = minYear; y <= maxYear; y++) {
        years.push(y)
    }

    const handleYearChange = (e) => {
        const newYear = parseInt(e.target.value, 10)
        if (onYearChange) onYearChange(newYear)
        if (onChange) onChange({ year: newYear, month })
    }

    const handleMonthChange = (e) => {
        const newMonth = parseInt(e.target.value, 10)
        if (onMonthChange) onMonthChange(newMonth)
        if (onChange) onChange({ year, month: newMonth })
    }

    if (compact) {
        return (
            <div className={cn('flex gap-0.5', className)} {...props}>
                <select
                    value={month || 1}
                    onChange={handleMonthChange}
                    disabled={disabled}
                    className={cn(
                        'border border-slate-200 rounded px-0.5 py-0.5 text-[11px] text-slate-900 w-10',
                        disabled && 'bg-slate-100 cursor-not-allowed text-slate-500'
                    )}
                >
                    {MONTHS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                </select>
                <select
                    value={year || 2024}
                    onChange={handleYearChange}
                    disabled={disabled}
                    className={cn(
                        'border border-slate-200 rounded px-0.5 py-0.5 text-[11px] text-slate-900 w-14',
                        disabled && 'bg-slate-100 cursor-not-allowed text-slate-500'
                    )}
                >
                    {years.map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </div>
        )
    }

    return (
        <div className={cn('flex gap-1', className)} {...props}>
            <select
                value={month || 1}
                onChange={handleMonthChange}
                disabled={disabled}
                className={cn(
                    theme.input.base,
                    'w-16 px-1',
                    disabled && 'bg-slate-100 cursor-not-allowed'
                )}
            >
                {MONTHS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                ))}
            </select>
            <select
                value={year || 2024}
                onChange={handleYearChange}
                disabled={disabled}
                className={cn(
                    theme.input.base,
                    'w-20 px-1',
                    disabled && 'bg-slate-100 cursor-not-allowed'
                )}
            >
                {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                ))}
            </select>
        </div>
    )
}

export function SelectInput({ value, onChange, children, className = '', ...props }) {
    return (
        <select
            value={value}
            onChange={onChange}
            className={cn(theme.input.base, className)}
            {...props}
        >
            {children}
        </select>
    )
}
