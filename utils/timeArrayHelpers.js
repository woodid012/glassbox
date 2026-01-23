// Time Array Helpers
// Utility functions for working with time series arrays
// Period-based system: uses year/month integers instead of Date objects

/**
 * Create a timeline from year/month range
 * @param {number} startYear - Start year (e.g., 2024)
 * @param {number} startMonth - Start month (1-12)
 * @param {number} endYear - End year
 * @param {number} endMonth - End month (1-12)
 * @param {string} frequency - 'monthly', 'quarterly', or 'annual'
 * @param {number} fyStartMonth - Fiscal year start month (1-12), default 7 (July)
 * @returns {Object} Timeline object with periods, index, year, month arrays
 */
export function createTimeline(startYear, startMonth, endYear, endMonth, frequency = 'monthly', fyStartMonth = 7) {
    // Calculate total months in range
    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1

    // Determine step size based on frequency
    const getStepMonths = () => {
        switch (frequency) {
            case 'annual': return 12
            case 'quarterly': return 3
            case 'monthly':
            default: return 1
        }
    }
    const stepMonths = getStepMonths()

    // Align start to period boundary if needed
    let alignedStartYear = startYear
    let alignedStartMonth = startMonth

    if (frequency === 'quarterly') {
        // Align to start of quarter (Jan, Apr, Jul, Oct)
        alignedStartMonth = Math.floor((startMonth - 1) / 3) * 3 + 1
    } else if (frequency === 'annual') {
        // Align to start of year (January)
        alignedStartMonth = 1
    }

    // Generate period arrays
    const periodCount = Math.ceil(totalMonths / stepMonths)
    const index = []
    const years = []
    const months = []
    const quarters = []
    const fyears = []

    let currentYear = alignedStartYear
    let currentMonth = alignedStartMonth

    for (let i = 0; i < periodCount; i++) {
        // Check if we've gone past the end date
        const currentTotalMonths = (currentYear - startYear) * 12 + (currentMonth - startMonth)
        if (currentTotalMonths > totalMonths) break

        index.push(i)
        years.push(currentYear)
        months.push(currentMonth)
        quarters.push(Math.floor((currentMonth - 1) / 3) + 1)
        fyears.push(currentMonth >= fyStartMonth ? currentYear + 1 : currentYear)

        // Advance to next period
        currentMonth += stepMonths
        while (currentMonth > 12) {
            currentMonth -= 12
            currentYear += 1
        }
    }

    return {
        periods: index.length,
        index: index,
        frequency: frequency,
        startYear: alignedStartYear,
        startMonth: alignedStartMonth,
        year: years,
        month: months,
        quarter: quarters,
        fyear: fyears
    }
}

/**
 * Get the period index for a given year/month
 * @param {Object} timeline - Timeline object
 * @param {number} targetYear - Target year
 * @param {number} targetMonth - Target month (1-12)
 * @returns {number} Period index, or -1 if not found
 */
export function getMonthIndex(timeline, targetYear, targetMonth) {
    for (let i = 0; i < timeline.periods; i++) {
        if (timeline.year[i] === targetYear && timeline.month[i] === targetMonth) {
            return i
        }
    }
    return -1
}

export function createArray(length, defaultValue = 0) {
    return new Array(length).fill(defaultValue)
}

export function sumArray(arr) {
    if (!arr) return 0
    return arr.reduce((a, b) => a + b, 0)
}

export function avgArray(arr) {
    if (!arr || arr.length === 0) return 0
    return sumArray(arr) / arr.length
}

export function multiplyArrays(arr1, arr2) {
    if (!arr1 || !arr2) return []
    return arr1.map((v, i) => v * (arr2[i] || 0))
}

export function addArrays(arr1, arr2) {
    if (!arr1 || !arr2) return []
    return arr1.map((v, i) => v + (arr2[i] || 0))
}

export function scaleArray(arr, factor) {
    if (!arr) return []
    return arr.map(v => v * factor)
}

export function lagArray(arr, periods) {
    if (!arr) return []
    const result = new Array(arr.length).fill(0)
    for (let i = periods; i < arr.length; i++) {
        result[i] = arr[i - periods]
    }
    return result
}

export function leadArray(arr, periods) {
    if (!arr) return []
    const result = new Array(arr.length).fill(0)
    for (let i = 0; i < arr.length - periods; i++) {
        result[i] = arr[i + periods]
    }
    return result
}

export function cumulativeSum(arr) {
    if (!arr) return []
    let sum = 0
    return arr.map(v => {
        sum += v
        return sum
    })
}

/**
 * Format a year/month as a display string
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {string} format - 'short' or 'long'
 * @returns {string} Formatted date string
 */
export function formatPeriod(year, month, format = 'short') {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthName = monthNames[month - 1]

    if (format === 'short') {
        const shortYear = String(year).slice(-2)
        return `${monthName} ${shortYear}`
    }
    return `${monthName} ${year}`
}

export function formatNumber(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return '-'
    return val.toLocaleString('en-US', { 
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals 
    })
}

export function formatCompact(val) {
    if (val === null || val === undefined || isNaN(val)) return '-'
    const absVal = Math.abs(val)
    if (absVal >= 1e9) return (val / 1e9).toFixed(1) + 'B'
    if (absVal >= 1e6) return (val / 1e6).toFixed(1) + 'M'
    if (absVal >= 1e3) return (val / 1e3).toFixed(1) + 'k'
    return val.toFixed(2)
}
