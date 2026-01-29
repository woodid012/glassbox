/**
 * Empty state placeholder shown when a section has no data.
 *
 * Props:
 *   icon     - Emoji string or React element for the visual
 *   title    - Primary message (string)
 *   subtitle - Secondary hint (string, optional)
 *   className - Additional wrapper classes (optional)
 */
export default function EmptyState({ icon, title, subtitle, className = '' }) {
    return (
        <div className={`text-center py-12 text-slate-500 ${className}`}>
            {icon && <div className="text-4xl mb-3">{icon}</div>}
            <p className="text-sm">{title}</p>
            {subtitle && <p className="text-xs mt-1">{subtitle}</p>}
        </div>
    )
}
