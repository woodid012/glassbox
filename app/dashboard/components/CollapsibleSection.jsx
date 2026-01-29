'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Expand/collapse section with chevron toggle.
 *
 * Props:
 *   title       - Section heading (string)
 *   children    - Collapsed content
 *   defaultOpen - Initial state (boolean, default false)
 *   count       - Optional badge count shown after title
 *   subtitle    - Optional text after title
 *   className   - Additional wrapper classes
 */
export default function CollapsibleSection({ title, children, defaultOpen = false, count, subtitle, className = '' }) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <div className={className}>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center justify-between w-full text-left"
            >
                <div className="flex items-center gap-3">
                    {open ? (
                        <ChevronDown className="w-5 h-5 text-slate-600" />
                    ) : (
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                    )}
                    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                    {subtitle && <span className="text-xs text-slate-600">{subtitle}</span>}
                    {count != null && (
                        <span className="text-xs text-slate-500">({count})</span>
                    )}
                </div>
            </button>
            {open && children}
        </div>
    )
}
