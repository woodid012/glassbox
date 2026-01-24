import { CollapsedSubgroupView } from './SubgroupTable'
import { formatPeriodLabel, formatNumber } from '../utils/inputHelpers'

/**
 * Standard collapsed view component used by ValuesMode, ConstantMode, and SeriesMode.
 * Wraps CollapsedSubgroupView with default period header and cell rendering.
 */
export default function StandardCollapsedView({ group, groupInputs, periods, config }) {
    return (
        <CollapsedSubgroupView
            group={group}
            groupInputs={groupInputs}
            periods={periods}
            config={config}
            renderPeriodHeaders={() =>
                periods.map((p, i) => (
                    <th key={i} className="text-center py-1 px-0 text-[10px] font-medium text-slate-500 min-w-[45px] w-[45px]">
                        {formatPeriodLabel(p.year, p.month, group.frequency)}
                    </th>
                ))
            }
            renderPeriodCells={(periodTotals, type) =>
                periodTotals.map((val, i) => (
                    <td
                        key={i}
                        className={`py-1 px-0.5 text-right text-[11px] min-w-[45px] w-[45px] ${
                            type === 'subgroup'
                                ? 'font-medium text-blue-700 border-r border-blue-100'
                                : 'font-semibold text-slate-700 border-r border-slate-100'
                        }`}
                    >
                        {formatNumber(val, 1)}
                    </td>
                ))
            }
        />
    )
}
