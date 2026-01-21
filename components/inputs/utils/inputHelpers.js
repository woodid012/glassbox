// Month names for formatting
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatPeriodLabel(year, month, frequency = 'M') {
    if (frequency === 'Y') return String(year)
    if (frequency === 'Q') {
        const q = Math.floor((month - 1) / 3) + 1
        return `Q${q} ${String(year).slice(-2)}`
    }
    return `${MONTH_NAMES[(month || 1) - 1]} ${String(year).slice(-2)}`
}

// Get the number of months per period based on frequency
export function getMonthsPerPeriod(frequency) {
    if (frequency === 'Y' || frequency === 'FY') return 12
    if (frequency === 'Q') return 3
    return 1 // Monthly
}

// Helper to get values array from input, aggregating monthly values to display frequency
// If group is provided and in series mode, generates values from series config
export function getValuesArray(input, periods, frequency, group = null) {
    let rawValues = input.values || {}
    const monthsPerPeriod = getMonthsPerPeriod(frequency)

    // If group is in series mode, generate values from series config
    if (group && group.entryMode === 'series') {
        // Get group start info
        let groupStartYear = group.startYear
        let groupStartMonth = group.startMonth ?? 1
        if (!groupStartYear && group.startDate) {
            const [y, m] = group.startDate.split('-').map(Number)
            groupStartYear = y
            groupStartMonth = m
        }
        groupStartYear = groupStartYear ?? 2024
        const totalMonths = group.periods || 12

        // Generate series values
        rawValues = generateSeriesValues(input, totalMonths, groupStartYear, groupStartMonth)
    }

    // If group is in constant mode, generate values from constant config
    if (group && group.entryMode === 'constant') {
        // Get group start info
        let groupStartYear = group.startYear
        let groupStartMonth = group.startMonth ?? 1
        if (!groupStartYear && group.startDate) {
            const [y, m] = group.startDate.split('-').map(Number)
            groupStartYear = y
            groupStartMonth = m
        }
        groupStartYear = groupStartYear ?? 2024
        const totalMonths = group.periods || 12

        // Generate constant values
        rawValues = generateConstantValues(input, totalMonths, groupStartYear, groupStartMonth)
    }

    // If monthly or raw array, return as-is for backward compatibility
    if (monthsPerPeriod === 1) {
        return Array.isArray(rawValues)
            ? rawValues
            : periods.map((_, i) => rawValues[i] ?? rawValues[String(i)] ?? 0)
    }

    // Aggregate monthly values into display periods
    return periods.map((_, periodIndex) => {
        let sum = 0
        const startMonthIndex = periodIndex * monthsPerPeriod
        for (let m = 0; m < monthsPerPeriod; m++) {
            const monthIndex = startMonthIndex + m
            const val = rawValues[monthIndex] ?? rawValues[String(monthIndex)] ?? 0
            sum += parseFloat(val) || 0
        }
        return sum
    })
}

// Get values array for lookup mode with offset applied
// Values are stored at ALL months within each entry period (repeated, not spread)
// This allows switching intervals: annual->monthly shows same value for each month
export function getLookupValuesArray(input, lookupPeriods, frequency, group, config) {
    const rawValues = input.values || {}
    const monthsPerPeriod = getMonthsPerPeriod(frequency)

    // Calculate model start in total months
    const modelStartYear = config.startYear ?? 2024
    const modelStartMonth = config.startMonth ?? 1
    const modelStartTotal = (modelStartYear * 12) + modelStartMonth

    // Calculate lookup start in total months
    const lookupStartYear = group.lookupStartYear ?? config.startYear ?? 2024
    const lookupStartMonth = group.lookupStartMonth ?? config.startMonth ?? 1
    const lookupStartTotal = (lookupStartYear * 12) + lookupStartMonth

    // Offset: how many months into the stored values array to start reading
    const monthOffset = lookupStartTotal - modelStartTotal

    // Read the value at the first month of each display period
    // Since values are stored at ALL months within entry periods, this works for any interval
    return lookupPeriods.map((_, periodIndex) => {
        const valueIndex = (periodIndex * monthsPerPeriod) + monthOffset
        return parseFloat(rawValues[valueIndex] ?? rawValues[String(valueIndex)] ?? 0) || 0
    })
}

// Spread a value change at display frequency back to monthly values
export function spreadValueToMonthly(currentValues, periodIndex, newValue, frequency, periods) {
    const monthsPerPeriod = getMonthsPerPeriod(frequency)
    const newValues = { ...currentValues }

    if (monthsPerPeriod === 1) {
        // Monthly - direct assignment
        newValues[periodIndex] = newValue
    } else {
        // Spread evenly across months in this period
        const valuePerMonth = newValue / monthsPerPeriod
        const startMonthIndex = periodIndex * monthsPerPeriod
        for (let m = 0; m < monthsPerPeriod; m++) {
            newValues[startMonthIndex + m] = valuePerMonth
        }
    }

    return newValues
}

// Store a value in lookup mode - repeat the same value for ALL months in the period
// This allows switching intervals while keeping values visible (e.g., annual -> monthly shows same value for each month)
export function spreadLookupValueToMonthly(currentValues, periodIndex, newValue, frequency, group, config) {
    const monthsPerPeriod = getMonthsPerPeriod(frequency)
    const newValues = { ...currentValues }

    // Calculate model start in total months
    const modelStartYear = config.startYear ?? 2024
    const modelStartMonth = config.startMonth ?? 1
    const modelStartTotal = (modelStartYear * 12) + modelStartMonth

    // Calculate lookup start in total months
    const lookupStartYear = group.lookupStartYear ?? config.startYear ?? 2024
    const lookupStartMonth = group.lookupStartMonth ?? config.startMonth ?? 1
    const lookupStartTotal = (lookupStartYear * 12) + lookupStartMonth

    // Offset: how many months into the stored values array to start writing
    const monthOffset = lookupStartTotal - modelStartTotal

    // Store the SAME value at ALL months in this period
    // This way switching from annual to monthly shows the value for each month
    const startMonthIndex = (periodIndex * monthsPerPeriod) + monthOffset
    for (let m = 0; m < monthsPerPeriod; m++) {
        newValues[startMonthIndex + m] = newValue
    }

    return newValues
}

// Calculate period totals for an array of inputs
export function calculatePeriodTotals(inputs, periods, frequency, group = null) {
    return periods.map((_, i) => {
        return inputs.reduce((sum, input) => {
            const values = getValuesArray(input, periods, frequency, group)
            return sum + (parseFloat(values[i]) || 0)
        }, 0)
    })
}

// Generate series values array from series configuration
export function generateSeriesValues(input, totalMonths, groupStartYear, groupStartMonth) {
    const annualValue = input.seriesAnnualValue ?? input.value ?? 0
    const seriesFreq = input.seriesFrequency || 'M'
    const seriesCount = input.seriesCount || 0
    const startDate = input.seriesStartDate || 'range'
    const endDate = input.seriesEndDate || 'range'
    const paymentMonth = parseInt(input.seriesPaymentMonth || '1') - 1  // 0-indexed

    // Calculate periods per year based on frequency
    const periodsPerYear = seriesFreq === 'Y' ? 1 : seriesFreq === 'Q' ? 4 : seriesFreq === 'FY' ? 1 : 12
    const monthsPerPeriod = getMonthsPerPeriod(seriesFreq)
    const periodValue = annualValue / periodsPerYear

    // Determine start and end month indices (always work in months)
    let startMonthIndex = 0
    let endMonthIndex = totalMonths - 1

    if (startDate !== 'range') {
        const [year, month] = startDate.split('-').map(Number)
        // Calculate month index from group start
        startMonthIndex = (year - groupStartYear) * 12 + (month - groupStartMonth)
        startMonthIndex = Math.max(0, startMonthIndex)
    }

    if (endDate !== 'range') {
        const [year, month] = endDate.split('-').map(Number)
        endMonthIndex = (year - groupStartYear) * 12 + (month - groupStartMonth)
        endMonthIndex = Math.min(totalMonths - 1, endMonthIndex)
    }

    // If count is specified, use it to determine end based on series frequency
    if (seriesCount > 0) {
        endMonthIndex = Math.min(startMonthIndex + (seriesCount * monthsPerPeriod) - 1, totalMonths - 1)
    }

    // Generate values object (monthly basis)
    const values = {}

    for (let i = startMonthIndex; i <= endMonthIndex; i++) {
        // Calculate the actual calendar month for this period (1-12)
        let currentMonth = groupStartMonth + i
        while (currentMonth > 12) currentMonth -= 12

        // For monthly, every month gets the value
        if (seriesFreq === 'M') {
            values[i] = periodValue
        }
        // For Annual/FY, payment month is the actual calendar month (1=Jan, 12=Dec)
        else if (seriesFreq === 'Y' || seriesFreq === 'FY') {
            if (currentMonth === paymentMonth + 1) {  // paymentMonth is 0-indexed, calendar month is 1-indexed
                values[i] = periodValue
            }
        }
        // For Quarterly, payment month is relative within quarter (0=1st, 1=2nd, 2=3rd month of quarter)
        else if (seriesFreq === 'Q') {
            const monthInQuarter = ((currentMonth - 1) % 3)  // 0, 1, or 2
            if (monthInQuarter === paymentMonth) {
                values[i] = periodValue
            }
        }
        // Other months remain empty (0)
    }

    return values
}

// Generate constant values array from constant configuration
export function generateConstantValues(input, totalMonths, groupStartYear, groupStartMonth) {
    const constantValue = input.value ?? 0
    const spreadMethod = input.spreadMethod || 'lookup'

    // For lookup: repeat value every month
    // For spread: divide value across all months
    const periodValue = spreadMethod === 'spread'
        ? constantValue / totalMonths
        : constantValue

    // Generate values object (monthly basis)
    const values = {}
    for (let i = 0; i < totalMonths; i++) {
        values[i] = periodValue
    }

    return values
}

// Generate period columns for a group
export function generatePeriods(group, config) {
    const periods = []
    // Parse startDate string if startYear/startMonth not set
    let startYear = group.startYear ?? config.startYear ?? 2024
    let startMonth = group.startMonth ?? config.startMonth ?? 1
    if (group.startDate && !group.startYear) {
        const [y, m] = group.startDate.split('-').map(Number)
        startYear = y
        startMonth = m
    }
    const totalMonths = group.periods || 12 // periods is always stored as months
    const freq = group.frequency || 'M'

    const monthsPerPeriod = getMonthsPerPeriod(freq)
    const numDisplayPeriods = Math.ceil(totalMonths / monthsPerPeriod)

    let currentYear = startYear
    let currentMonth = startMonth

    for (let i = 0; i < numDisplayPeriods; i++) {
        periods.push({ year: currentYear, month: currentMonth, index: i })
        currentMonth += monthsPerPeriod
        while (currentMonth > 12) {
            currentMonth -= 12
            currentYear += 1
        }
    }
    return periods
}

// Generate extended periods for lookup mode (model range + 5 extra intervals)
export function generateExtendedPeriods(config, frequency = 'M') {
    const periods = []
    const startYear = config.startYear ?? 2024
    const startMonth = config.startMonth ?? 1
    const endYear = config.endYear ?? startYear + 1
    const endMonth = config.endMonth ?? 12

    // Calculate total months from model start to end
    const totalModelMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
    const monthsPerPeriod = getMonthsPerPeriod(frequency)
    const extraIntervals = 5
    const totalMonths = totalModelMonths + (extraIntervals * monthsPerPeriod)
    const numDisplayPeriods = Math.ceil(totalMonths / monthsPerPeriod)

    let currentYear = startYear
    let currentMonth = startMonth

    for (let i = 0; i < numDisplayPeriods; i++) {
        periods.push({ year: currentYear, month: currentMonth, index: i })
        currentMonth += monthsPerPeriod
        while (currentMonth > 12) {
            currentMonth -= 12
            currentYear += 1
        }
    }
    return periods
}

// Generate periods for lookup mode using custom range
export function generateLookupPeriods(group, config) {
    const periods = []
    const freq = group.frequency || 'M'
    const monthsPerPeriod = getMonthsPerPeriod(freq)

    // Use custom lookup range or fall back to model range
    let startYear = group.lookupStartYear ?? config.startYear ?? 2024
    let startMonth = group.lookupStartMonth ?? config.startMonth ?? 1
    let endYear = group.lookupEndYear ?? config.endYear ?? startYear + 1
    let endMonth = group.lookupEndMonth ?? config.endMonth ?? 12

    // Calculate total months in lookup range
    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
    const numDisplayPeriods = Math.ceil(totalMonths / monthsPerPeriod)

    let currentYear = startYear
    let currentMonth = startMonth

    for (let i = 0; i < numDisplayPeriods; i++) {
        periods.push({ year: currentYear, month: currentMonth, index: i })
        currentMonth += monthsPerPeriod
        while (currentMonth > 12) {
            currentMonth -= 12
            currentYear += 1
        }
    }
    return periods
}

// Generate model timeline periods (model start → model end at specified frequency)
export function generateModelPeriods(config, frequency = 'M') {
    const periods = []
    const startYear = config.startYear ?? 2024
    const startMonth = config.startMonth ?? 1
    const endYear = config.endYear ?? startYear + 1
    const endMonth = config.endMonth ?? 12
    const monthsPerPeriod = getMonthsPerPeriod(frequency)

    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
    const numDisplayPeriods = Math.ceil(totalMonths / monthsPerPeriod)

    let currentYear = startYear
    let currentMonth = startMonth

    for (let i = 0; i < numDisplayPeriods; i++) {
        periods.push({ year: currentYear, month: currentMonth, index: i })
        currentMonth += monthsPerPeriod
        while (currentMonth > 12) {
            currentMonth -= 12
            currentYear += 1
        }
    }
    return periods
}

// Get lookup values at model timeline periods (with offset applied)
export function getLookupValuesForModel(input, modelPeriods, frequency, group, config) {
    const rawValues = input.values || {}
    const monthsPerPeriod = getMonthsPerPeriod(frequency)

    // Calculate model start in total months
    const modelStartYear = config.startYear ?? 2024
    const modelStartMonth = config.startMonth ?? 1
    const modelStartTotal = (modelStartYear * 12) + modelStartMonth

    // Calculate lookup start in total months
    const lookupStartYear = group.lookupStartYear ?? config.startYear ?? 2024
    const lookupStartMonth = group.lookupStartMonth ?? config.startMonth ?? 1
    const lookupStartTotal = (lookupStartYear * 12) + lookupStartMonth

    // Offset: difference between lookup start and model start
    const monthOffset = lookupStartTotal - modelStartTotal

    // Read values at model timeline period indices
    return modelPeriods.map((_, periodIndex) => {
        const valueIndex = (periodIndex * monthsPerPeriod) + monthOffset
        return parseFloat(rawValues[valueIndex] ?? rawValues[String(valueIndex)] ?? 0) || 0
    })
}

// Get values array for lookup2 mode (model timeline, no offset, no aggregation)
// Values are read from the first month of each display period (repeated storage)
export function getLookup2ValuesArray(input, periods, frequency) {
    const rawValues = input.values || {}
    const monthsPerPeriod = getMonthsPerPeriod(frequency)

    // Read the value at the first month of each display period
    // Since values are stored at ALL months within entry periods, this works for any interval
    return periods.map((_, periodIndex) => {
        const valueIndex = periodIndex * monthsPerPeriod
        return parseFloat(rawValues[valueIndex] ?? rawValues[String(valueIndex)] ?? 0) || 0
    })
}

// Store a value in lookup2 mode - repeat the same value for ALL months in the period
// No offset calculation since lookup2 uses model timeline directly
export function spreadLookup2ValueToMonthly(currentValues, periodIndex, newValue, frequency) {
    const monthsPerPeriod = getMonthsPerPeriod(frequency)
    const newValues = { ...currentValues }

    // Store the SAME value at ALL months in this period
    // This way switching from annual to monthly shows the value for each month
    const startMonthIndex = periodIndex * monthsPerPeriod
    for (let m = 0; m < monthsPerPeriod; m++) {
        newValues[startMonthIndex + m] = newValue
    }

    return newValues
}

// Group inputs by subgroup
export function groupInputsBySubgroup(groupInputs, group) {
    const subgroups = group.subgroups || []
    const result = []

    // Inputs without subgroup (at root level)
    const rootInputs = groupInputs.filter(inp => !inp.subgroupId)
    if (rootInputs.length > 0 || subgroups.length === 0) {
        result.push({ id: null, name: null, inputs: rootInputs })
    }

    // Inputs within each subgroup
    subgroups.forEach(sg => {
        const sgInputs = groupInputs.filter(inp => inp.subgroupId === sg.id)
        result.push({ id: sg.id, name: sg.name, inputs: sgInputs })
    })

    return result
}
