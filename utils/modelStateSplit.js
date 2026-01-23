/**
 * Model State Split/Merge Utilities
 *
 * Splits the unified app state into 3 files:
 * - model-inputs.json: Time series data, key periods, input values
 * - model-calculations.json: Pure structure (formulas, modules)
 * - model-ui-state.json: UI preferences (view mode, collapsed sections)
 */

// Keys that belong to each file type
const INPUT_KEYS = [
    'config',
    'keyPeriods',
    'indices',
    'inputGlassGroups',
    'inputGlass',
    'inputType1',
    'inputType1Groups',
    'inputType2',
    'inputType2Groups',
    'groups',
    'inputs',
    'metadata',
    'funding',
    'operations',
    'timeline'
]

const CALCULATION_KEYS = [
    'calculationsTabs',
    'calculationsGroups',
    'calculations',
    'modules',
    'moduleTemplates'
]

const UI_STATE_KEYS = [
    'viewMode',
    'activeTab',
    'showConfig',
    'showKeyPeriods',
    'showInputs',
    'showIndices',
    'showNominal',
    'showTimeseries',
    'showCalculations',
    'showInputType1',
    'showInputType2',
    'collapsedInputType1Groups',
    'collapsedInputType2Groups',
    'collapsedInputGlassGroups',
    'collapsedKeyPeriodGroups',
    'collapsedCalculationsGroups',
    'collapsedGroups'
]

/**
 * Split unified state into 3 separate objects
 * @param {Object} state - The unified app state
 * @returns {{ inputs: Object, calculations: Object, uiState: Object }}
 */
export function splitState(state) {
    const inputs = {}
    const calculations = {
        _description: 'Model structure - formulas and relationships only'
    }
    const uiState = {}

    // Extract input data
    for (const key of INPUT_KEYS) {
        if (state[key] !== undefined) {
            inputs[key] = state[key]
        }
    }

    // Extract calculation structure
    for (const key of CALCULATION_KEYS) {
        if (state[key] !== undefined) {
            calculations[key] = state[key]
        }
    }

    // Extract UI state
    for (const key of UI_STATE_KEYS) {
        if (state[key] !== undefined) {
            uiState[key] = state[key]
        }
    }

    return { inputs, calculations, uiState }
}

/**
 * Merge 3 separate state objects into unified state
 * @param {Object} inputs - Input data
 * @param {Object} calculations - Calculation structure
 * @param {Object} uiState - UI state
 * @returns {Object} - Unified app state
 */
export function mergeState(inputs = {}, calculations = {}, uiState = {}) {
    // Remove internal description field from calculations
    const { _description, ...calcData } = calculations

    return {
        ...inputs,
        ...calcData,
        ...uiState
    }
}

/**
 * Get default values for each state section
 */
export function getDefaultInputs() {
    return {
        config: {
            minFrequency: 'monthly',
            startYear: 2024,
            startMonth: 1,
            endYear: 2028,
            endMonth: 12
        },
        keyPeriods: [],
        indices: [],
        inputGlassGroups: [],
        inputGlass: [],
        inputType1: [],
        inputType1Groups: [],
        inputType2: [],
        inputType2Groups: [],
        groups: [],
        inputs: []
    }
}

export function getDefaultCalculations() {
    return {
        _description: 'Model structure - formulas and relationships only',
        calculationsTabs: [],
        calculationsGroups: [],
        calculations: [],
        modules: [],
        moduleTemplates: []
    }
}

export function getDefaultUiState() {
    return {
        viewMode: 'Y',
        activeTab: 'glassinputs',
        showConfig: true,
        showKeyPeriods: true,
        showInputs: true,
        showIndices: true,
        showNominal: true,
        showTimeseries: true,
        showCalculations: true,
        showInputType1: true,
        showInputType2: true,
        collapsedInputType1Groups: [],
        collapsedInputType2Groups: [],
        collapsedInputGlassGroups: [],
        collapsedKeyPeriodGroups: [],
        collapsedCalculationsGroups: [],
        collapsedGroups: []
    }
}

// Export key lists for use in API routes
export { INPUT_KEYS, CALCULATION_KEYS, UI_STATE_KEYS }
