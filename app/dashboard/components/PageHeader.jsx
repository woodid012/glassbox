/**
 * Standardized page header for card-embedded dashboard pages.
 *
 * Props:
 *   title    - Page title (string)
 *   subtitle - Short description (string, optional)
 *   children - Right-aligned action buttons (optional)
 */
export default function PageHeader({ title, subtitle, children }) {
    return (
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                    {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
                </div>
                {children}
            </div>
        </div>
    )
}
