import { formatNumber } from '../utils/inputHelpers'

/**
 * Total cell component for displaying row totals.
 * Consistent styling across all input modes.
 */
export default function TotalCell({ value, decimals = 2, sticky = false }) {
    const stickyClass = sticky ? 'sticky left-[224px] z-10' : ''
    return (
        <td className={`py-1.5 px-3 text-right font-semibold text-slate-900 w-[96px] min-w-[96px] max-w-[96px] bg-slate-50 border-r border-slate-300 ${stickyClass}`}>
            {value.toLocaleString('en-US', { maximumFractionDigits: decimals })}
        </td>
    )
}
