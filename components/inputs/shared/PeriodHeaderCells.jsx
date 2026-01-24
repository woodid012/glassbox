import { formatPeriodLabel } from '../utils/inputHelpers'

/**
 * Period header cells component for table headers.
 * Renders a series of <th> elements for each period.
 */
export default function PeriodHeaderCells({ periods, frequency, config = null }) {
    return periods.map((p, i) => (
        <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[45px] w-[45px]">
            {formatPeriodLabel(p.year, p.month, frequency, config)}
        </th>
    ))
}
