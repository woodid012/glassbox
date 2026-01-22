// Preset Modules for Financial Modeling
// Each module takes inputs and generates multiple output time series

/**
 * Module Template Structure:
 * {
 *   type: 'debt_amortisation',
 *   name: 'Debt Amortisation',
 *   description: 'Calculates loan repayments with interest and principal components',
 *   inputs: [
 *     { key: 'principal', label: 'Principal Amount', type: 'number', required: true },
 *     { key: 'rate', label: 'Annual Interest Rate', type: 'number', required: true },
 *     { key: 'term', label: 'Term (months)', type: 'number', required: true },
 *     { key: 'startPeriod', label: 'Start Period', type: 'period', required: true },
 *     { key: 'type', label: 'Loan Type', type: 'select', options: ['annuity', 'bullet', 'linear'] }
 *   ],
 *   outputs: ['drawdown', 'interest', 'principal_repayment', 'total_repayment', 'balance']
 * }
 */

export const MODULE_TEMPLATES = {
    debt_amortisation: {
        type: 'debt_amortisation',
        name: 'Debt Amortisation',
        description: 'Loan schedule with interest and principal components',
        inputs: [
            { key: 'principal', label: 'Principal Amount', type: 'number', required: true },
            { key: 'annualRate', label: 'Annual Interest Rate (%)', type: 'percentage', required: true },
            { key: 'termMonths', label: 'Term (months)', type: 'number', required: true },
            { key: 'startPeriodIndex', label: 'Drawdown Period', type: 'period', required: true },
            { key: 'loanType', label: 'Loan Type', type: 'select', options: [
                { value: 'annuity', label: 'Annuity (Equal Payments)' },
                { value: 'bullet', label: 'Bullet (Interest Only, Principal at End)' },
                { value: 'linear', label: 'Linear (Equal Principal)' }
            ], required: true },
            { key: 'gracePeriods', label: 'Grace Periods (months)', type: 'number', required: false }
        ],
        outputs: [
            { key: 'drawdown', label: 'Drawdown', type: 'flow' },
            { key: 'interest', label: 'Interest Payment', type: 'flow' },
            { key: 'principal_repayment', label: 'Principal Repayment', type: 'flow' },
            { key: 'total_repayment', label: 'Total Repayment', type: 'flow' },
            { key: 'balance_opening', label: 'Opening Balance', type: 'stock' },
            { key: 'balance_closing', label: 'Closing Balance', type: 'stock' }
        ]
    },
    
    depreciation: {
        type: 'depreciation',
        name: 'Depreciation',
        description: 'Asset depreciation with multiple methods',
        inputs: [
            { key: 'assetValue', label: 'Asset Value', type: 'number', required: true },
            { key: 'residualValue', label: 'Residual Value', type: 'number', required: false },
            { key: 'usefulLifeMonths', label: 'Useful Life (months)', type: 'number', required: true },
            { key: 'startPeriodIndex', label: 'Start Period', type: 'period', required: true },
            { key: 'method', label: 'Method', type: 'select', options: [
                { value: 'straight_line', label: 'Straight Line' },
                { value: 'declining_balance', label: 'Declining Balance' },
                { value: 'sum_of_years', label: 'Sum of Years Digits' }
            ], required: true },
            { key: 'decliningRate', label: 'Declining Balance Rate (%)', type: 'percentage', required: false }
        ],
        outputs: [
            { key: 'depreciation', label: 'Depreciation Expense', type: 'flow' },
            { key: 'accumulated', label: 'Accumulated Depreciation', type: 'stock' },
            { key: 'book_value', label: 'Book Value', type: 'stock' }
        ]
    },
    
    revenue_escalation: {
        type: 'revenue_escalation',
        name: 'Revenue with Escalation',
        description: 'Revenue stream with price escalation and volume adjustments',
        inputs: [
            { key: 'basePrice', label: 'Base Price', type: 'number', required: true },
            { key: 'baseVolume', label: 'Base Volume', type: 'number', required: true },
            { key: 'priceEscalation', label: 'Annual Price Escalation (%)', type: 'percentage', required: false },
            { key: 'volumeGrowth', label: 'Annual Volume Growth (%)', type: 'percentage', required: false },
            { key: 'startPeriodIndex', label: 'Start Period', type: 'period', required: true },
            { key: 'endPeriodIndex', label: 'End Period', type: 'period', required: false },
            { key: 'flagRef', label: 'Active Flag (optional)', type: 'reference', refType: 'flag', required: false }
        ],
        outputs: [
            { key: 'price', label: 'Price', type: 'stock' },
            { key: 'volume', label: 'Volume', type: 'flow' },
            { key: 'revenue', label: 'Revenue', type: 'flow' }
        ]
    },
    
    working_capital: {
        type: 'working_capital',
        name: 'Working Capital',
        description: 'Working capital requirements based on revenue/costs',
        inputs: [
            { key: 'revenueRef', label: 'Revenue Reference', type: 'reference', refType: 'any', required: true },
            { key: 'costRef', label: 'Cost Reference', type: 'reference', refType: 'any', required: false },
            { key: 'receivableDays', label: 'Receivable Days', type: 'number', required: true },
            { key: 'payableDays', label: 'Payable Days', type: 'number', required: false },
            { key: 'inventoryDays', label: 'Inventory Days', type: 'number', required: false }
        ],
        outputs: [
            { key: 'receivables', label: 'Accounts Receivable', type: 'stock' },
            { key: 'payables', label: 'Accounts Payable', type: 'stock' },
            { key: 'inventory', label: 'Inventory', type: 'stock' },
            { key: 'net_working_capital', label: 'Net Working Capital', type: 'stock' },
            { key: 'wc_movement', label: 'Working Capital Movement', type: 'flow' }
        ]
    },
    
    tax_loss_carryforward: {
        type: 'tax_loss_carryforward',
        name: 'Tax Loss Carryforward',
        description: 'Tax calculation with loss carryforward',
        inputs: [
            { key: 'taxableIncomeRef', label: 'Taxable Income Reference', type: 'reference', refType: 'any', required: true },
            { key: 'taxRate', label: 'Tax Rate (%)', type: 'percentage', required: true },
            { key: 'openingLosses', label: 'Opening Tax Losses', type: 'number', required: false },
            { key: 'maxCarryforwardYears', label: 'Max Carryforward Years', type: 'number', required: false }
        ],
        outputs: [
            { key: 'taxable_income', label: 'Taxable Income (Pre-Losses)', type: 'flow' },
            { key: 'losses_utilised', label: 'Tax Losses Utilised', type: 'flow' },
            { key: 'taxable_income_net', label: 'Taxable Income (Post-Losses)', type: 'flow' },
            { key: 'tax_expense', label: 'Tax Expense', type: 'flow' },
            { key: 'loss_pool', label: 'Tax Loss Pool', type: 'stock' }
        ]
    },
    
    capex_schedule: {
        type: 'capex_schedule',
        name: 'Capex Schedule',
        description: 'Capital expenditure with construction period spread',
        inputs: [
            { key: 'totalCapex', label: 'Total Capex', type: 'number', required: true },
            { key: 'startPeriodIndex', label: 'Construction Start', type: 'period', required: true },
            { key: 'constructionMonths', label: 'Construction Period (months)', type: 'number', required: true },
            { key: 'profile', label: 'Spend Profile', type: 'select', options: [
                { value: 'linear', label: 'Linear' },
                { value: 'front_loaded', label: 'Front Loaded (S-Curve)' },
                { value: 'back_loaded', label: 'Back Loaded' }
            ], required: true },
            { key: 'contingency', label: 'Contingency (%)', type: 'percentage', required: false }
        ],
        outputs: [
            { key: 'capex', label: 'Capex Spend', type: 'flow' },
            { key: 'capex_cumulative', label: 'Cumulative Capex', type: 'stock' },
            { key: 'contingency_spend', label: 'Contingency Spend', type: 'flow' }
        ]
    },

    degradation_profile: {
        type: 'degradation_profile',
        name: 'Degradation Profile',
        description: 'Cumulative degradation factor for assets with time-varying decay',
        inputs: [
            {
                key: 'degradationRateRef',
                label: 'Degradation Rate',
                type: 'reference',
                refType: 'any',
                required: true
            },
            {
                key: 'initialValue',
                label: 'Initial Value',
                type: 'number',
                required: false,
                default: 1
            },
            {
                key: 'startPeriodIndex',
                label: 'Start Period',
                type: 'period',
                required: true
            }
        ],
        outputs: [
            { key: 'degradation_factor', label: 'Cumulative Degradation Factor', type: 'stock' },
            { key: 'period_degradation', label: 'Period Degradation Rate', type: 'flow' },
            { key: 'degraded_value', label: 'Degraded Value', type: 'stock' }
        ]
    }
}

// Calculate module outputs
export function calculateModuleOutputs(moduleInstance, arrayLength, context) {
    const template = MODULE_TEMPLATES[moduleInstance.moduleType]
    if (!template) return {}
    
    const inputs = moduleInstance.inputs || {}
    const outputs = {}
    
    // Initialize output arrays
    template.outputs.forEach(output => {
        outputs[output.key] = new Array(arrayLength).fill(0)
    })
    
    switch (moduleInstance.moduleType) {
        case 'debt_amortisation':
            return calculateDebtAmortisation(inputs, arrayLength, context)
        case 'depreciation':
            return calculateDepreciation(inputs, arrayLength)
        case 'revenue_escalation':
            return calculateRevenueEscalation(inputs, arrayLength, context)
        case 'working_capital':
            return calculateWorkingCapital(inputs, arrayLength, context)
        case 'tax_loss_carryforward':
            return calculateTaxLossCarryforward(inputs, arrayLength, context)
        case 'capex_schedule':
            return calculateCapexSchedule(inputs, arrayLength)
        case 'degradation_profile':
            return calculateDegradationProfile(inputs, arrayLength, context)
        default:
            return outputs
    }
}

function calculateDebtAmortisation(inputs, arrayLength, context) {
    const {
        principal = 0,
        annualRate = 0,
        termMonths = 0,
        startPeriodIndex = 0,
        loanType = 'annuity',
        gracePeriods = 0
    } = inputs
    
    const outputs = {
        drawdown: new Array(arrayLength).fill(0),
        interest: new Array(arrayLength).fill(0),
        principal_repayment: new Array(arrayLength).fill(0),
        total_repayment: new Array(arrayLength).fill(0),
        balance_opening: new Array(arrayLength).fill(0),
        balance_closing: new Array(arrayLength).fill(0)
    }
    
    if (principal <= 0 || termMonths <= 0 || startPeriodIndex >= arrayLength) {
        return outputs
    }
    
    const monthlyRate = annualRate / 100 / 12
    const repaymentStart = startPeriodIndex + gracePeriods
    const repaymentPeriods = Math.max(0, termMonths - gracePeriods)
    
    // Drawdown
    outputs.drawdown[startPeriodIndex] = principal
    
    let balance = 0
    
    for (let i = 0; i < arrayLength; i++) {
        // Opening balance
        if (i === startPeriodIndex) {
            outputs.balance_opening[i] = 0
            balance = principal
        } else if (i > startPeriodIndex) {
            outputs.balance_opening[i] = balance
        }
        
        if (balance <= 0) continue
        
        // Interest
        const interestPayment = balance * monthlyRate
        outputs.interest[i] = interestPayment
        
        // Principal repayment
        let principalPayment = 0
        
        if (i >= repaymentStart && i < repaymentStart + repaymentPeriods) {
            const periodsRemaining = repaymentStart + repaymentPeriods - i
            
            if (loanType === 'annuity' && monthlyRate > 0) {
                // PMT calculation
                const pmt = balance * (monthlyRate * Math.pow(1 + monthlyRate, periodsRemaining)) / 
                           (Math.pow(1 + monthlyRate, periodsRemaining) - 1)
                principalPayment = Math.min(balance, pmt - interestPayment)
            } else if (loanType === 'linear') {
                principalPayment = principal / repaymentPeriods
            } else if (loanType === 'bullet' && i === repaymentStart + repaymentPeriods - 1) {
                principalPayment = balance
            }
        }
        
        outputs.principal_repayment[i] = principalPayment
        outputs.total_repayment[i] = interestPayment + principalPayment
        
        // Update balance
        balance -= principalPayment
        outputs.balance_closing[i] = Math.max(0, balance)
    }
    
    return outputs
}

function calculateDepreciation(inputs, arrayLength) {
    const {
        assetValue = 0,
        residualValue = 0,
        usefulLifeMonths = 0,
        startPeriodIndex = 0,
        method = 'straight_line',
        decliningRate = 200 // Default 200% for double declining
    } = inputs
    
    const outputs = {
        depreciation: new Array(arrayLength).fill(0),
        accumulated: new Array(arrayLength).fill(0),
        book_value: new Array(arrayLength).fill(0)
    }
    
    if (assetValue <= 0 || usefulLifeMonths <= 0 || startPeriodIndex >= arrayLength) {
        return outputs
    }
    
    const depreciableAmount = assetValue - residualValue
    let accumulated = 0
    
    for (let i = 0; i < arrayLength; i++) {
        if (i < startPeriodIndex) {
            outputs.book_value[i] = 0
            continue
        }
        
        const periodInLife = i - startPeriodIndex
        if (periodInLife >= usefulLifeMonths) {
            outputs.depreciation[i] = 0
            outputs.accumulated[i] = depreciableAmount
            outputs.book_value[i] = residualValue
            continue
        }
        
        let depExpense = 0
        const bookValueStart = assetValue - accumulated
        
        if (method === 'straight_line') {
            depExpense = depreciableAmount / usefulLifeMonths
        } else if (method === 'declining_balance') {
            const rate = (decliningRate / 100) / 12
            depExpense = Math.min(bookValueStart * rate, bookValueStart - residualValue)
        } else if (method === 'sum_of_years') {
            const sumOfYears = (usefulLifeMonths * (usefulLifeMonths + 1)) / 2
            const remainingLife = usefulLifeMonths - periodInLife
            depExpense = (remainingLife / sumOfYears) * depreciableAmount
        }
        
        depExpense = Math.max(0, Math.min(depExpense, bookValueStart - residualValue))
        
        outputs.depreciation[i] = depExpense
        accumulated += depExpense
        outputs.accumulated[i] = accumulated
        outputs.book_value[i] = assetValue - accumulated
    }
    
    return outputs
}

function calculateRevenueEscalation(inputs, arrayLength, context) {
    const {
        basePrice = 0,
        baseVolume = 0,
        priceEscalation = 0,
        volumeGrowth = 0,
        startPeriodIndex = 0,
        endPeriodIndex = arrayLength - 1,
        flagRef = null
    } = inputs
    
    const outputs = {
        price: new Array(arrayLength).fill(0),
        volume: new Array(arrayLength).fill(0),
        revenue: new Array(arrayLength).fill(0)
    }
    
    const monthlyPriceGrowth = Math.pow(1 + priceEscalation / 100, 1/12)
    const monthlyVolumeGrowth = Math.pow(1 + volumeGrowth / 100, 1/12)
    
    // Get flag array if referenced
    let flagArray = null
    if (flagRef && context[flagRef]) {
        flagArray = context[flagRef]
    }
    
    for (let i = 0; i < arrayLength; i++) {
        if (i < startPeriodIndex || i > endPeriodIndex) continue
        
        const periodsFromStart = i - startPeriodIndex
        
        outputs.price[i] = basePrice * Math.pow(monthlyPriceGrowth, periodsFromStart)
        outputs.volume[i] = baseVolume * Math.pow(monthlyVolumeGrowth, periodsFromStart)
        outputs.revenue[i] = outputs.price[i] * outputs.volume[i]
        
        // Apply flag if present
        if (flagArray && flagArray[i] === 0) {
            outputs.volume[i] = 0
            outputs.revenue[i] = 0
        }
    }
    
    return outputs
}

function calculateWorkingCapital(inputs, arrayLength, context) {
    const {
        revenueRef = null,
        costRef = null,
        receivableDays = 30,
        payableDays = 30,
        inventoryDays = 0
    } = inputs
    
    const outputs = {
        receivables: new Array(arrayLength).fill(0),
        payables: new Array(arrayLength).fill(0),
        inventory: new Array(arrayLength).fill(0),
        net_working_capital: new Array(arrayLength).fill(0),
        wc_movement: new Array(arrayLength).fill(0)
    }
    
    const revenueArray = revenueRef && context[revenueRef] ? context[revenueRef] : new Array(arrayLength).fill(0)
    const costArray = costRef && context[costRef] ? context[costRef] : new Array(arrayLength).fill(0)
    
    let prevNWC = 0
    
    for (let i = 0; i < arrayLength; i++) {
        // Receivables = Revenue * (Days / 30)
        outputs.receivables[i] = revenueArray[i] * (receivableDays / 30)
        
        // Payables = Costs * (Days / 30)
        outputs.payables[i] = Math.abs(costArray[i]) * (payableDays / 30)
        
        // Inventory (simplified)
        outputs.inventory[i] = Math.abs(costArray[i]) * (inventoryDays / 30)
        
        // Net Working Capital
        outputs.net_working_capital[i] = outputs.receivables[i] + outputs.inventory[i] - outputs.payables[i]
        
        // Movement (increase in NWC = cash outflow)
        outputs.wc_movement[i] = outputs.net_working_capital[i] - prevNWC
        prevNWC = outputs.net_working_capital[i]
    }
    
    return outputs
}

function calculateTaxLossCarryforward(inputs, arrayLength, context) {
    const {
        taxableIncomeRef = null,
        taxRate = 30,
        openingLosses = 0,
        maxCarryforwardYears = null
    } = inputs
    
    const outputs = {
        taxable_income: new Array(arrayLength).fill(0),
        losses_utilised: new Array(arrayLength).fill(0),
        taxable_income_net: new Array(arrayLength).fill(0),
        tax_expense: new Array(arrayLength).fill(0),
        loss_pool: new Array(arrayLength).fill(0)
    }
    
    const incomeArray = taxableIncomeRef && context[taxableIncomeRef] 
        ? context[taxableIncomeRef] 
        : new Array(arrayLength).fill(0)
    
    let lossPool = openingLosses
    
    for (let i = 0; i < arrayLength; i++) {
        const income = incomeArray[i]
        outputs.taxable_income[i] = income
        
        if (income > 0 && lossPool > 0) {
            // Use losses
            const lossesUsed = Math.min(income, lossPool)
            outputs.losses_utilised[i] = lossesUsed
            lossPool -= lossesUsed
            outputs.taxable_income_net[i] = income - lossesUsed
        } else if (income < 0) {
            // Add to loss pool
            lossPool += Math.abs(income)
            outputs.taxable_income_net[i] = 0
        } else {
            outputs.taxable_income_net[i] = income
        }
        
        // Tax expense
        outputs.tax_expense[i] = Math.max(0, outputs.taxable_income_net[i]) * (taxRate / 100)
        outputs.loss_pool[i] = lossPool
    }
    
    return outputs
}

function calculateCapexSchedule(inputs, arrayLength) {
    const {
        totalCapex = 0,
        startPeriodIndex = 0,
        constructionMonths = 12,
        profile = 'linear',
        contingency = 0
    } = inputs
    
    const outputs = {
        capex: new Array(arrayLength).fill(0),
        capex_cumulative: new Array(arrayLength).fill(0),
        contingency_spend: new Array(arrayLength).fill(0)
    }
    
    if (totalCapex <= 0 || constructionMonths <= 0 || startPeriodIndex >= arrayLength) {
        return outputs
    }
    
    const baseCapex = totalCapex / (1 + contingency / 100)
    const contingencyAmount = totalCapex - baseCapex
    
    // Generate spend profile
    const profileWeights = []
    for (let i = 0; i < constructionMonths; i++) {
        const t = i / (constructionMonths - 1 || 1)
        if (profile === 'linear') {
            profileWeights.push(1)
        } else if (profile === 'front_loaded') {
            // S-curve (logistic)
            profileWeights.push(1 / (1 + Math.exp(-10 * (t - 0.3))))
        } else if (profile === 'back_loaded') {
            profileWeights.push(1 / (1 + Math.exp(-10 * (t - 0.7))))
        }
    }
    
    // Normalize weights
    const totalWeight = profileWeights.reduce((a, b) => a + b, 0)
    const normalizedWeights = profileWeights.map(w => w / totalWeight)
    
    let cumulative = 0
    
    for (let i = 0; i < arrayLength; i++) {
        if (i < startPeriodIndex || i >= startPeriodIndex + constructionMonths) {
            outputs.capex_cumulative[i] = cumulative
            continue
        }
        
        const periodIndex = i - startPeriodIndex
        const baseSpend = baseCapex * normalizedWeights[periodIndex]
        const contingencySpend = contingencyAmount * normalizedWeights[periodIndex]
        
        outputs.capex[i] = baseSpend + contingencySpend
        outputs.contingency_spend[i] = contingencySpend
        cumulative += outputs.capex[i]
        outputs.capex_cumulative[i] = cumulative
    }
    
    return outputs
}

function calculateDegradationProfile(inputs, arrayLength, context) {
    const {
        degradationRateRef = null,
        initialValue = 100,
        startPeriodIndex = 0
    } = inputs

    const outputs = {
        degradation_factor: new Array(arrayLength).fill(0),
        period_degradation: new Array(arrayLength).fill(0),
        degraded_value: new Array(arrayLength).fill(0)
    }

    // Get degradation rate array from context (expects values like 5 for 5%)
    let degradationRates = context[degradationRateRef] || new Array(arrayLength).fill(0)

    // Get timeline for year detection (monthly periods, apply degradation annually)
    const timeline = context.timeline

    let cumulativeFactor = 1
    let lastYear = null
    let lastYearRate = null // Track previous year's rate to apply at transition

    for (let i = 0; i < arrayLength; i++) {
        if (i < startPeriodIndex) {
            outputs.degradation_factor[i] = 1
            outputs.period_degradation[i] = 0
            outputs.degraded_value[i] = initialValue
        } else {
            const currentYear = timeline?.year?.[i]
            const periodRate = degradationRates[i] || 0

            // Apply degradation at year boundaries using PREVIOUS year's rate
            // This matches CUMPROD_Y behavior: Year 1's rate applies at start of Year 2
            if (lastYear !== null && currentYear !== lastYear && lastYearRate !== null) {
                const rateAsDecimal = lastYearRate / 100 // Convert 5 to 0.05
                cumulativeFactor *= (1 - rateAsDecimal)
                outputs.period_degradation[i] = lastYearRate
            } else {
                outputs.period_degradation[i] = 0
            }

            // Update lastYearRate when entering a new year
            if (currentYear !== lastYear) {
                lastYearRate = periodRate
            }
            lastYear = currentYear

            outputs.degradation_factor[i] = Math.max(0, cumulativeFactor)
            outputs.degraded_value[i] = initialValue * outputs.degradation_factor[i]
        }
    }

    return outputs
}

// Get available module output references for a module instance
// Uses numeric indices: M1.1, M1.2, etc.
export function getModuleOutputRefs(moduleInstance) {
    const template = MODULE_TEMPLATES[moduleInstance.moduleType]
    if (!template) return []

    return template.outputs.map((output, index) => ({
        ref: `M${moduleInstance.id}.${index + 1}`,
        key: output.key,
        label: `${moduleInstance.name}: ${output.label}`,
        type: output.type
    }))
}

// Get output key from numeric index for a module type
export function getOutputKeyByIndex(moduleType, index) {
    const template = MODULE_TEMPLATES[moduleType]
    if (!template || index < 1 || index > template.outputs.length) return null
    return template.outputs[index - 1].key
}

// Get output index from key for a module type
export function getOutputIndexByKey(moduleType, key) {
    const template = MODULE_TEMPLATES[moduleType]
    if (!template) return null
    const index = template.outputs.findIndex(o => o.key === key)
    return index >= 0 ? index + 1 : null
}
