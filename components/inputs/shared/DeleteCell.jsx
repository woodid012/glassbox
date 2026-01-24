import { Trash2 } from 'lucide-react'

/**
 * Delete button cell component used across all input modes.
 * Renders a trash icon button that triggers the onDelete callback.
 */
export default function DeleteCell({ onDelete, bgColor = 'bg-white', sticky = false }) {
    const stickyClass = sticky ? 'sticky left-0 z-30' : ''
    return (
        <td className={`py-0 px-1 w-[32px] min-w-[32px] max-w-[32px] ${bgColor} ${stickyClass}`}>
            <button onClick={onDelete} className="p-1 text-slate-300 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </td>
    )
}
