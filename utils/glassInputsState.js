/**
 * Glass Inputs State Management Utilities
 * Handles default state creation, serialization, and deserialization
 * Uses period-based system with year/month integers instead of date strings
 */

/**
 * Creates the default application state for GlassInputs
 * @returns {Object} Default state object
 */
export function getDefaultState() {
    const defaultStartYear = 2024
    const defaultStartMonth = 1
    const defaultEndYear = 2028
    const defaultEndMonth = 12

    return {
        config: {
            startYear: defaultStartYear,
            startMonth: defaultStartMonth,
            endYear: defaultEndYear,
            endMonth: defaultEndMonth,
            minFrequency: 'monthly', // monthly, quarterly, annual
            fyStartMonth: 7, // Fiscal year start month (1-12), default July
            defaultSpreadMethod: 'lookup' // 'lookup' (stock - same value each period) or 'spread' (flow - sum across periods)
        },
        viewMode: 'Y', // M, Q, Y, FY
        showConfig: true,
        showKeyPeriods: true,
        showInputs: true,
        showIndices: true,
        showNominal: true,
        showTimeseries: true,
        showCalculations: true,
        showInputType1: true,
        keyPeriods: [],
        inputType1: [],
        indices: [{
            id: 1,
            name: 'CPI',
            indexationStartYear: defaultStartYear,
            indexationStartMonth: defaultStartMonth,
            indexationRate: 2.5,
            indexationPeriod: 'annual'
        }],
        inputType1Groups: [],
        inputGlassGroups: [
            {
                id: 'timing',
                name: 'Timing',
                startYear: defaultStartYear,
                startMonth: defaultStartMonth,
                endYear: defaultEndYear,
                endMonth: defaultEndMonth,
                groupType: 'timing', // Special type for T1, T2 references
                isDefault: true
            }
        ],
        inputGlass: [
            {
                id: 'hours-in-year',
                groupId: 'timing',
                name: 'Hours in Year',
                entryMode: 'constant',
                value: 8760,
                spreadMethod: 'lookup', // Stock - repeats value
                flowConverter: true, // Special: converts calculations to flow when used
                isDefault: true,
                values: {}
            },
            {
                id: 'months-in-year',
                groupId: 'timing',
                name: 'Months in Year',
                entryMode: 'constant',
                value: 12,
                spreadMethod: 'lookup',
                flowConverter: true,
                isDefault: true,
                values: {}
            },
            {
                id: 'days-in-year',
                groupId: 'timing',
                name: 'Days in Year',
                entryMode: 'constant',
                value: 365,
                spreadMethod: 'lookup',
                flowConverter: true,
                isDefault: true,
                values: {}
            },
            {
                id: 'quarters-in-year',
                groupId: 'timing',
                name: 'Quarters in Year',
                entryMode: 'constant',
                value: 4,
                spreadMethod: 'lookup',
                flowConverter: true,
                isDefault: true,
                values: {}
            }
        ],
        collapsedInputType1Groups: new Set(),
        collapsedInputGlassGroups: new Set(),
        collapsedKeyPeriodGroups: new Set(),
        // Modules: reusable calculation blocks (M1, M2, etc.)
        modules: [],
        // Available module templates (pre-built)
        moduleTemplates: [
            {
                id: 'iterative_debt_sizing',
                name: 'Iterative Debt Sizing (DSCR Sculpted)',
                description: 'Binary search to find optimal debt with DSCR-sculpted repayments',
                category: 'financing',
                inputs: [
                    { key: 'cfadsRef', label: 'CFADS Reference', type: 'reference', default: '' },
                    { key: 'debtFlagRef', label: 'Debt Service Flag', type: 'reference', default: '' },
                    { key: 'totalCapex', label: 'Total Capex ($M)', type: 'number', default: 100 },
                    { key: 'maxGearingPct', label: 'Max Gearing (%)', type: 'number', default: 65 },
                    { key: 'interestRatePct', label: 'Interest Rate (%)', type: 'number', default: 5 },
                    { key: 'tenorYears', label: 'Debt Tenor (years)', type: 'number', default: 18 },
                    { key: 'targetDSCR', label: 'Target DSCR', type: 'number', default: 1.4 },
                    { key: 'debtPeriod', label: 'Debt Service Period', type: 'select', options: [
                        { value: 'M', label: 'Monthly' },
                        { value: 'Q', label: 'Quarterly' },
                        { value: 'Y', label: 'Yearly' }
                    ], default: 'Q' },
                    { key: 'idcRef', label: 'IDC Reference (optional)', type: 'reference', default: '' },
                    { key: 'tolerance', label: 'Tolerance ($M)', type: 'number', default: 0.1 },
                    { key: 'maxIterations', label: 'Max Iterations', type: 'number', default: 50 }
                ],
                outputs: ['sized_debt', 'opening_balance', 'interest_payment', 'principal_payment', 'debt_service', 'closing_balance', 'period_dscr', 'cumulative_principal']
            }
        ],
        calculations: [
            {
                id: 1,
                tabId: 1,
                groupId: 1,
                name: 'Total Capex',
                formula: 'V1.1 + V1.2',
                description: 'Example: Sum of sub-items'
            },
            {
                id: 2,
                tabId: 1,
                groupId: 1,
                name: 'Indexed Revenue',
                formula: 'S1 * I1',
                description: 'Example: Series multiplied by indexation'
            },
            {
                id: 3,
                tabId: 1,
                groupId: 1,
                name: 'Flagged Opex',
                formula: 'S1.1 * F1',
                description: 'Example: Sub-item active only when flag is 1'
            },
            {
                id: 4,
                tabId: 1,
                groupId: 1,
                name: 'Net Cashflow',
                formula: 'R2 - R1',
                description: 'Example: Chain calculations together'
            }
        ],
        calculationsTabs: [
            { id: 1, name: 'Sheet 1' }
        ],
        calculationsGroups: [{
            id: 1,
            tabId: 1,
            name: 'Calculations'
        }],
        collapsedCalculationsGroups: new Set(),
        groups: [
            { id: 'flags', name: 'Flags', order: 0, isSpecial: true },
            { id: 'indexation', name: 'Indexation', order: 0.5, isSpecial: true },
            { id: 1, name: 'Group 1', order: 1, isSpecial: false }
        ],
        collapsedGroups: new Set(),
        inputs: [
            // Default Timeline flag - spans entire model period
            {
                id: -1,
                groupId: 'flags',
                name: 'Timeline',
                category: 'flag',
                defaultValue: 0,
                indexationRate: 0,
                linkedFlagId: null,
                startYear: defaultStartYear,
                startMonth: defaultStartMonth,
                endYear: defaultEndYear,
                endMonth: defaultEndMonth,
                values: {}
            },
            // Default Indexation - starts at 1, compounds at 2.5% per annum
            {
                id: -2,
                groupId: 'indexation',
                name: 'Default Indexation',
                category: 'indexation',
                defaultValue: 1,
                indexationRate: 0.025, // 2.5% per annum
                indexationPeriod: 'annual', // 'annual' or 'monthly'
                linkedFlagId: null,
                startYear: defaultStartYear,
                startMonth: defaultStartMonth,
                endYear: defaultEndYear,
                endMonth: defaultEndMonth,
                values: {}
            },
            // Value inputs
            {
                id: 1,
                groupId: 1,
                name: 'Revenue Base',
                category: 'value', // 'value', 'flag', 'indexation'
                type: 'flow', // 'stock' or 'flow'
                defaultValue: 1000,
                indexationRate: 0, // annual rate as decimal (e.g., 0.025 for 2.5%)
                linkedFlagId: null, // ID of flag input to link to (for value inputs)
                startYear: defaultStartYear, // Only used for flags/indexation
                startMonth: defaultStartMonth,
                endYear: defaultEndYear,
                endMonth: defaultEndMonth,
                values: {}, // sparse object: { periodIndex: value }
                patternLength: null,
                patternInputId: null
            },
            {
                id: 2,
                groupId: 1,
                name: 'Fixed Opex',
                category: 'value',
                type: 'flow',
                defaultValue: 50,
                indexationRate: 0,
                linkedFlagId: null,
                startYear: defaultStartYear,
                startMonth: defaultStartMonth,
                endYear: defaultEndYear,
                endMonth: defaultEndMonth,
                values: {}
            },
            {
                id: 3,
                groupId: 1,
                name: 'Market Price',
                category: 'value',
                type: 'stock',
                defaultValue: 85,
                indexationRate: 0,
                linkedFlagId: null,
                startYear: defaultStartYear,
                startMonth: defaultStartMonth,
                endYear: defaultEndYear,
                endMonth: defaultEndMonth,
                values: {},
                patternLength: null,
                patternInputId: null
            }
        ]
    }
}

/**
 * Serializes state for storage (converts Sets to Arrays)
 * @param {Object} state - Application state
 * @returns {Object} Serialized state safe for JSON storage
 */
export function serializeState(state) {
    return {
        ...state,
        collapsedInputType1Groups: Array.from(state.collapsedInputType1Groups),
        collapsedInputGlassGroups: Array.from(state.collapsedInputGlassGroups),
        collapsedKeyPeriodGroups: Array.from(state.collapsedKeyPeriodGroups || new Set()),
        collapsedCalculationsGroups: Array.from(state.collapsedCalculationsGroups),
        collapsedGroups: Array.from(state.collapsedGroups)
    }
}

/**
 * Recalculate linked key period dates based on their link configurations
 * Uses the new format fields: startLinkedToPeriodId, startLinkOffset, startLinkToEnd, etc.
 * @param {Array} keyPeriods - Array of key period objects
 * @param {Object} config - Config with startYear, startMonth, endYear, endMonth, minFrequency
 * @returns {Array} Key periods with recalculated dates
 */
function recalculateKeyPeriodDates(keyPeriods, config) {
    if (!keyPeriods || keyPeriods.length === 0) return keyPeriods

    const periods = keyPeriods.map(p => ({ ...p }))
    const frequency = config.minFrequency || 'monthly'
    const monthsPerPeriod = frequency === 'annual' ? 12 : frequency === 'quarterly' ? 3 : 1

    // Helper to add months
    const addMonths = (year, month, monthsToAdd) => {
        const totalMonths = year * 12 + (month - 1) + monthsToAdd
        return {
            year: Math.floor(totalMonths / 12),
            month: (totalMonths % 12) + 1
        }
    }

    // Helper to calculate end from start and periods
    const calculateEnd = (startYear, startMonth, numPeriods) => {
        const totalMonthsToAdd = (numPeriods - 1) * monthsPerPeriod + (monthsPerPeriod - 1)
        return addMonths(startYear, startMonth, totalMonthsToAdd)
    }

    // Helper to calculate periods from start to end
    const calculatePeriods = (startYear, startMonth, endYear, endMonth) => {
        const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
        return Math.ceil(totalMonths / monthsPerPeriod)
    }

    // Helper to normalize period ID
    const normalizePeriodId = (periodId) => {
        if (periodId === 'default' || periodId === null || periodId === undefined) return periodId
        const numId = typeof periodId === 'string' ? parseInt(periodId, 10) : periodId
        return isNaN(numId) ? periodId : numId
    }

    // Helper to get reference date from a period
    const getRefDate = (linkedId, linkToEnd) => {
        const normalizedId = normalizePeriodId(linkedId)
        if (normalizedId === 'default') {
            return linkToEnd
                ? { year: config.endYear, month: config.endMonth }
                : { year: config.startYear, month: config.startMonth }
        }
        const linkedPeriod = periods.find(p => p.id === normalizedId)
        if (!linkedPeriod) return null
        return linkToEnd
            ? { year: linkedPeriod.endYear, month: linkedPeriod.endMonth }
            : { year: linkedPeriod.startYear, month: linkedPeriod.startMonth }
    }

    // Multiple passes to handle chained dependencies
    let changed = true
    let iterations = 0
    const maxIterations = 20 // Prevent infinite loops

    while (changed && iterations < maxIterations) {
        changed = false
        iterations++

        for (const period of periods) {
            let newStartYear = period.startYear
            let newStartMonth = period.startMonth
            let newEndYear = period.endYear
            let newEndMonth = period.endMonth

            // Recalculate start if linked
            if (period.startLinkedToPeriodId) {
                const linkToEnd = period.startLinkToEnd !== false // Default to end if not specified
                const ref = getRefDate(period.startLinkedToPeriodId, linkToEnd)
                if (ref) {
                    let offsetMonths = period.startLinkOffset?.value || 0
                    if (period.startLinkOffset?.unit === 'years') offsetMonths *= 12
                    const newStart = addMonths(ref.year, ref.month, offsetMonths)
                    newStartYear = newStart.year
                    newStartMonth = newStart.month
                }
            }

            // Recalculate end if linked
            if (period.endLinkedToPeriodId) {
                const linkToEnd = period.endLinkToEnd !== false
                const ref = getRefDate(period.endLinkedToPeriodId, linkToEnd)
                if (ref) {
                    let offsetMonths = period.endLinkOffset?.value || 0
                    if (period.endLinkOffset?.unit === 'years') offsetMonths *= 12
                    const newEnd = addMonths(ref.year, ref.month, offsetMonths)
                    newEndYear = newEnd.year
                    newEndMonth = newEnd.month
                }
            } else if (period.startLinkedToPeriodId) {
                // If only start is linked, calculate end from periods
                const endResult = calculateEnd(newStartYear, newStartMonth, period.periods || 1)
                newEndYear = endResult.year
                newEndMonth = endResult.month
            }

            // Check if anything changed
            if (newStartYear !== period.startYear || newStartMonth !== period.startMonth ||
                newEndYear !== period.endYear || newEndMonth !== period.endMonth) {
                period.startYear = newStartYear
                period.startMonth = newStartMonth
                period.endYear = newEndYear
                period.endMonth = newEndMonth
                period.periods = calculatePeriods(newStartYear, newStartMonth, newEndYear, newEndMonth)
                changed = true
            }
        }
    }

    return periods
}

/**
 * Deserializes saved state (converts Arrays back to Sets)
 * @param {Object} savedState - Saved state from storage
 * @returns {Object} Hydrated state with Sets
 */
export function deserializeState(savedState) {
    const defaultState = getDefaultState()
    let loaded = { ...defaultState, ...savedState }

    // Always use default moduleTemplates (don't preserve old saved templates)
    loaded.moduleTemplates = defaultState.moduleTemplates

    // Ensure modules have outputs populated from their templates
    if (loaded.modules && loaded.moduleTemplates) {
        loaded.modules = loaded.modules.map(module => {
            if (!module.outputs) {
                const template = loaded.moduleTemplates.find(t => t.id === module.templateId)
                if (template && template.outputs) {
                    return { ...module, outputs: template.outputs }
                }
            }
            return module
        })
    }

    // Convert arrays back to Sets
    if (Array.isArray(loaded.collapsedInputType1Groups)) {
        loaded.collapsedInputType1Groups = new Set(loaded.collapsedInputType1Groups)
    }
    if (Array.isArray(loaded.collapsedInputGlassGroups)) {
        loaded.collapsedInputGlassGroups = new Set(loaded.collapsedInputGlassGroups)
    }
    if (Array.isArray(loaded.collapsedKeyPeriodGroups)) {
        loaded.collapsedKeyPeriodGroups = new Set(loaded.collapsedKeyPeriodGroups)
    } else if (!loaded.collapsedKeyPeriodGroups) {
        loaded.collapsedKeyPeriodGroups = new Set()
    }
    if (Array.isArray(loaded.collapsedCalculationsGroups)) {
        loaded.collapsedCalculationsGroups = new Set(loaded.collapsedCalculationsGroups)
    }
    if (Array.isArray(loaded.collapsedGroups)) {
        loaded.collapsedGroups = new Set(loaded.collapsedGroups)
    }

    // Migration: Add groupType to existing groups if missing
    if (loaded.inputType1Groups) {
        loaded.inputType1Groups = loaded.inputType1Groups.map(group => ({
            ...group,
            groupType: group.groupType || 'constant'
        }))
    }
    if (loaded.inputGlassGroups) {
        loaded.inputGlassGroups = loaded.inputGlassGroups.map(group => ({
            ...group,
            groupType: group.groupType || 'combined'
        }))
    }

    // Recalculate linked key period dates to ensure consistency
    if (loaded.keyPeriods && loaded.keyPeriods.length > 0 && loaded.config) {
        loaded.keyPeriods = recalculateKeyPeriodDates(loaded.keyPeriods, loaded.config)
    }

    return loaded
}
