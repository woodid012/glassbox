import EditableCell from './EditableCell'

/**
 * Name cell component with EditableCell for input rows.
 * Handles subgroup indentation, cell selection, and name editing.
 */
export default function NameCell({
    input,
    subgroupId,
    groupId,
    rowIndex,
    isSelected,
    onSelect,
    onShiftSelect,
    onUpdateInput,
    bgOverride,
    sticky = false
}) {
    const hasSubgroup = Boolean(subgroupId)
    const bgClass = bgOverride || (isSelected ? 'bg-blue-100' : 'bg-white')
    const stickyClass = sticky ? 'sticky left-[32px] z-20' : ''

    return (
        <td
            className={`py-0 px-0 w-[192px] min-w-[192px] max-w-[192px] ${bgClass} ${hasSubgroup ? 'pl-4' : ''} ${stickyClass}`}
            onClick={(e) => {
                if (e.shiftKey && onShiftSelect) {
                    onShiftSelect(groupId, rowIndex, -1)
                } else if (onSelect) {
                    onSelect(groupId, rowIndex, -1)
                }
            }}
        >
            <EditableCell
                value={input.name}
                onChange={(val) => onUpdateInput(input.id, 'name', val)}
                className={`font-medium text-slate-700 ${hasSubgroup ? 'pl-2' : ''}`}
            />
        </td>
    )
}
