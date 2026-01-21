// Theme configuration for glassinputs page
// Centralized styling constants for consistency and easy maintenance

export const theme = {
    // Text colors
    text: {
        primary: 'text-slate-900',
        secondary: 'text-slate-600',
        muted: 'text-slate-500',
        onDark: 'text-white',
    },

    // Background colors
    bg: {
        page: 'bg-white',
        section: 'bg-white',
        sectionHeader: 'bg-slate-50',
        input: 'bg-white',
        inputAlt: 'bg-slate-50',
        hover: 'hover:bg-slate-50',
        hoverAlt: 'hover:bg-slate-100',
    },

    // Border colors
    border: {
        default: 'border-slate-300',
        light: 'border-slate-200',
        focus: 'focus:border-indigo-500',
    },

    // Button variants
    button: {
        primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
        danger: 'text-red-400 hover:text-red-300 hover:bg-red-600/20',
    },

    // Common component classes
    input: {
        base: 'bg-white border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none',
        large: 'bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none',
        number: 'bg-white border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900 text-right focus:border-indigo-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
    },

    // Grid and layout
    grid: {
        cols12: 'grid grid-cols-12 gap-2',
    },

    // Common spacing
    spacing: {
        sectionPadding: 'px-6 py-4',
        contentPadding: 'p-6',
    },
}

// Helper function to combine theme classes
export const cn = (...classes) => classes.filter(Boolean).join(' ')
