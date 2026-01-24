// Month names for formatting
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatPeriodLabel(year, month, frequency = 'M', config = null) {
    if (frequency === 'Y') return String(year)
    if (frequency === 'FY') {
        // Fiscal year is named by the ending calendar year
        // e.g., FY27 = July 2026 - June 2027 (if fyStartMonth = 7)
        const fyStartMonth = config?.fyStartMonth || 7
        // If current month is before fyStartMonth, we're in the FY that ends this calendar year
        // If current month is >= fyStartMonth, we're in the FY that ends next calendar year
        const fyEndYear = month < fyStartMonth ? year : year + 1
        return `FY${String(fyEndYear).slice(-2)}`
    }
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
// For inputs with spreadMethod='lookup', values are NOT aggregated (they're stock values)
export function getValuesArray(input, periods, frequency, group = null, config = null) {
    let rawValues = input.values || {}
    const monthsPerPeriod = getMonthsPerPeriod(frequency)

    // Determine if this is a stock value (should NOT be aggregated)
    // Priority: 1. explicit input.spreadMethod, 2. mode default, 3. config default
    const isConstantMode = group && group.entryMode === 'constant'
    const isLookupMode = group && (group.entryMode === 'lookup' || group.entryMode === 'lookup2')
    const isValuesMode = group && (group.entryMode === 'values' || !group.entryMode)
    const isSeriesMode = group && group.entryMode === 'series'
    // For Values/Series mode, default to 'spread' (sum when aggregating)
    // For Constant/Lookup mode, default to 'lookup' (take first value)
    const modeDefault = (isConstantMode || isLookupMode) ? 'lookup' : (isValuesMode || isSeriesMode) ? 'spread' : null
    const configDefault = config?.defaultSpreadMethod || 'spread'
    const spreadMethod = input.spreadMethod || modeDefault || configDefault
    const isStockValue = spreadMethod === 'lookup'

    // Get group start info for mapping
    let groupStartYear = group?.startYear ?? config?.startYear ?? 2024
    let groupStartMonth = group?.startMonth ?? config?.startMonth ?? 1
    if (group && !group.startYear && group.startDate) {
        const [y, m] = group.startDate.split('-').map(Number)
        groupStartYear = y
        groupStartMonth = m
    }
    const totalMonths = group?.periods || 12

    // If group is in series mode, generate values from series config
    if (group && group.entryMode === 'series') {
        rawValues = generateSeriesValues(input, totalMonths, groupStartYear, groupStartMonth)
    }

    // If group is in constant mode, generate values from constant config
    if (group && group.entryMode === 'constant') {
        rawValues = generateConstantValues(input, totalMonths, groupStartYear, groupStartMonth)
    }

    // If monthly or raw array, return as-is for backward compatibility
    if (monthsPerPeriod === 1) {
        return Array.isArray(rawValues)
            ? rawValues
            : periods.map((_, i) => rawValues[i] ?? rawValues[String(i)] ?? 0)
    }

    // For FY view, aggregate based on fiscal year boundaries
    if (frequency === 'FY') {
        const fyStartMonth = config?.fyStartMonth || 7

        return periods.map((period) => {
            // period.year is the calendar year when this FY starts
            // period.month is fyStartMonth
            // FY spans from fyStartMonth of period.year to fyStartMonth-1 of period.year+1

            let sum = 0
            let stockValue = null

            // Iterate through all 12 months of this fiscal year
            for (let m = 0; m < 12; m++) {
                // Calculate the calendar year and month for this position in the FY
                let calMonth = fyStartMonth + m
                let calYear = period.year
                if (calMonth > 12) {
                    calMonth -= 12
                    calYear += 1
                }

                // Calculate the month index in rawValues (relative to group start)
                const monthIndex = (calYear - groupStartYear) * 12 + (calMonth - groupStartMonth)

                // Only include if within the data range
                if (monthIndex >= 0 && monthIndex < totalMonths) {
                    const val = parseFloat(rawValues[monthIndex] ?? rawValues[String(monthIndex)] ?? 0) || 0
                    if (isStockValue) {
                        // For stock values, take the first non-zero value in the FY
                        if (stockValue === null && val !== 0) {
                            stockValue = val
                        }
                    } else {
                        sum += val
                    }
                }
            }

            return isStockValue ? (stockValue ?? 0) : sum
        })
    }

    // For stock values (lookup/constant with lookup spread), don't aggregate - return value from first month of period
    if (isStockValue) {
        return periods.map((_, periodIndex) => {
            const startMonthIndex = periodIndex * monthsPerPeriod
            const val = rawValues[startMonthIndex] ?? rawValues[String(startMonthIndex)] ?? 0
            return parseFloat(val) || 0
        })
    }

    // Aggregate monthly values into display periods (for flow values)
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

// Calculate period totals for an array of inputs
export function calculatePeriodTotals(inputs, periods, frequency, group = null, config = null) {
    return periods.map((_, i) => {
        return inputs.reduce((sum, input) => {
            const values = getValuesArray(input, periods, frequency, group, config)
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
    // End date is EXCLUSIVE when explicitly set ("+N" means N periods)
    // End date is INCLUSIVE when "Range End" (includes all periods)
    let startMonthIndex = 0
    let endMonthIndex = totalMonths  // Exclusive end for loop (will use < not <=)

    if (startDate !== 'range') {
        const [year, month] = startDate.split('-').map(Number)
        // Calculate month index from group start
        startMonthIndex = (year - groupStartYear) * 12 + (month - groupStartMonth)
        startMonthIndex = Math.max(0, startMonthIndex)
    }

    if (endDate !== 'range') {
        const [year, month] = endDate.split('-').map(Number)
        endMonthIndex = (year - groupStartYear) * 12 + (month - groupStartMonth)
        endMonthIndex = Math.min(totalMonths, endMonthIndex)
        // End is exclusive: "+0" = 0 periods, "+12" = 12 periods
    }

    // If count is specified, use it to determine end based on series frequency
    if (seriesCount > 0) {
        endMonthIndex = Math.min(startMonthIndex + (seriesCount * monthsPerPeriod), totalMonths)
    }

    // Generate values object (monthly basis)
    const values = {}

    for (let i = startMonthIndex; i < endMonthIndex; i++) {
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
// If keyPeriods is provided and group has linkedKeyPeriodId, uses the key period's dates
// If viewMode is provided, generates periods at that frequency (overrides group.frequency)
export function generatePeriods(group, config, keyPeriods = null, viewMode = null) {
    const periods = []

    // Resolve linked key period dates if applicable
    let startYear, startMonth, totalMonths

    if (keyPeriods && group.linkedKeyPeriodId) {
        // Find the linked key period
        const linkedKeyPeriod = keyPeriods.find(kp =>
            String(kp.id) === String(group.linkedKeyPeriodId)
        )
        if (linkedKeyPeriod) {
            // Use the key period's dates
            startYear = linkedKeyPeriod.startYear ?? config.startYear ?? 2024
            startMonth = linkedKeyPeriod.startMonth ?? config.startMonth ?? 1
            totalMonths = linkedKeyPeriod.periods || 12
        } else {
            // Fallback to group dates
            startYear = group.startYear ?? config.startYear ?? 2024
            startMonth = group.startMonth ?? config.startMonth ?? 1
            totalMonths = group.periods || 12
        }
    } else {
        // No linked key period - use group dates directly
        startYear = group.startYear ?? config.startYear ?? 2024
        startMonth = group.startMonth ?? config.startMonth ?? 1
        // Parse startDate string if startYear/startMonth not set
        if (group.startDate && !group.startYear) {
            const [y, m] = group.startDate.split('-').map(Number)
            startYear = y
            startMonth = m
        }
        totalMonths = group.periods || 12 // periods is always stored as months
    }

    // Use viewMode if provided, otherwise fall back to group.frequency
    const freq = viewMode || group.frequency || 'M'
    const fyStartMonth = config?.fyStartMonth || 7

    // For FY view, align periods to fiscal year boundaries
    if (freq === 'FY') {
        // Find the fiscal year that contains the start date
        // FY starts at fyStartMonth. If startMonth < fyStartMonth, we're in the FY ending this calendar year
        // If startMonth >= fyStartMonth, we're in the FY ending next calendar year
        let fyStartYear = startMonth < fyStartMonth ? startYear - 1 : startYear
        let fyStart = fyStartMonth

        // Calculate how many fiscal years we need
        // End date is startYear + totalMonths
        const endYear = startYear + Math.floor((startMonth - 1 + totalMonths) / 12)
        const endMonth = ((startMonth - 1 + totalMonths) % 12) + 1
        const fyEndYear = endMonth < fyStartMonth ? endYear - 1 : endYear

        const numFYPeriods = fyEndYear - fyStartYear + 1

        for (let i = 0; i < numFYPeriods; i++) {
            // Each FY period starts at fyStartMonth of fyStartYear + i
            periods.push({
                year: fyStartYear + i,
                month: fyStart,
                index: i,
                // Store FY info for label
                fyEndYear: fyStartYear + i + 1
            })
        }
        return periods
    }

    // Standard period generation for M, Q, Y
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

// Get values array for lookup mode (model timeline, no offset, no aggregation)
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
