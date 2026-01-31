/**
 * Model State Split/Merge Utilities
 *
 * Splits the unified app state into 4 files:
 * - model-inputs.json: Time series data, key periods, input values
 * - model-calculations.json: Core calculations (formulas, groups, tabs)
 * - model-modules.json: Module definitions, module groups, module calculations, M-ref map
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
    'calculations'
]

const MODULE_KEYS = [
    'modules',
    'moduleGroups',
    'moduleCalculations',
    '_mRefMap'
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
 * Split unified state into 4 separate objects
 * @param {Object} state - The unified app state
 * @returns {{ inputs: Object, calculations: Object, modules: Object, uiState: Object }}
 */
export function splitState(state) {
    const inputs = {}
    const calculations = {
        _description: 'Model structure - formulas and relationships only'
    }
    const modules = {}
    const uiState = {}

    // Extract input data
    for (const key of INPUT_KEYS) {
        if (state[key] !== undefined) {
            inputs[key] = state[key]
        }
    }

    // Identify module group IDs (groups with _isModuleGroup: true)
    const allGroups = state.calculationsGroups || []
    const moduleGroupIds = new Set(
        allGroups.filter(g => g._isModuleGroup).map(g => g.id)
    )

    // Split calculationsGroups: non-module groups go to calculations, module groups go to modules
    calculations.calculationsGroups = allGroups.filter(g => !g._isModuleGroup)
    modules.moduleGroups = allGroups.filter(g => g._isModuleGroup)

    // Split calculations: module calcs (groupId in moduleGroupIds) go to modules
    const allCalcs = state.calculations || []
    calculations.calculations = allCalcs.filter(c => !moduleGroupIds.has(c.groupId))
    modules.moduleCalculations = allCalcs.filter(c => moduleGroupIds.has(c.groupId))

    // Tabs stay in calculations
    if (state.calculationsTabs !== undefined) {
        calculations.calculationsTabs = state.calculationsTabs
    }

    // _constantsReference stays in calculations if present
    if (state._constantsReference !== undefined) {
        calculations._constantsReference = state._constantsReference
    }

    // Module-specific keys
    if (state.modules !== undefined) {
        modules.modules = state.modules
    }
    if (state._mRefMap !== undefined) {
        modules._mRefMap = state._mRefMap
    }
    // moduleTemplates is legacy but keep it if present
    if (state.moduleTemplates !== undefined) {
        modules.moduleTemplates = state.moduleTemplates
    }

    // Extract UI state
    for (const key of UI_STATE_KEYS) {
        if (state[key] !== undefined) {
            uiState[key] = state[key]
        }
    }

    return { inputs, calculations, modules, uiState }
}

/**
 * Merge 4 separate state objects into unified state
 * @param {Object} inputs - Input data
 * @param {Object} calculations - Core calculation structure
 * @param {Object} modulesData - Module definitions, groups, calculations, M-ref map
 * @param {Object} uiState - UI state
 * @returns {Object} - Unified app state
 */
export function mergeState(inputs = {}, calculations = {}, modulesData = {}, uiState = {}) {
    // Remove internal description field from calculations
    const { _description, ...calcData } = calculations

    // Merge module groups back into calculationsGroups
    const coreGroups = calcData.calculationsGroups || []
    const moduleGroups = modulesData.moduleGroups || []
    calcData.calculationsGroups = [...coreGroups, ...moduleGroups]

    // Merge module calculations back into calculations
    const coreCalcs = calcData.calculations || []
    const moduleCalcs = modulesData.moduleCalculations || []
    calcData.calculations = [...coreCalcs, ...moduleCalcs]

    // Spread module-level keys (modules array, _mRefMap, moduleTemplates)
    if (modulesData.modules !== undefined) {
        calcData.modules = modulesData.modules
    }
    if (modulesData._mRefMap !== undefined) {
        calcData._mRefMap = modulesData._mRefMap
    }
    if (modulesData.moduleTemplates !== undefined) {
        calcData.moduleTemplates = modulesData.moduleTemplates
    }

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
        calculations: []
    }
}

export function getDefaultModules() {
    return {
        modules: [],
        moduleGroups: [],
        moduleCalculations: [],
        _mRefMap: {}
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
export { INPUT_KEYS, CALCULATION_KEYS, MODULE_KEYS, UI_STATE_KEYS }
