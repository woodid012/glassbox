// GST Paid/Received Module
import { resolveModuleInput } from './shared'

export const TEMPLATE = {
    type: 'gst_receivable',
    name: 'GST Paid/Received',
    description: 'GST ledger with configurable receipt delay using CUMSUM pattern',
    inputs: [
        { key: 'gstBaseRef', label: 'GST Base Amount (e.g., Capex)', type: 'reference', refType: 'any', required: true },
        { key: 'activeFlagRef', label: 'Active Period Flag', type: 'reference', refType: 'flag', required: true },
        { key: 'gstRatePct', label: 'GST Rate (%)', type: 'number', required: true, default: 10 },
        { key: 'receiptDelayMonths', label: 'Receipt Delay (months)', type: 'number', required: false, default: 1 },
        { key: 'constructionFlagRef', label: 'Construction Period Flag', type: 'reference', refType: 'flag', required: false },
        { key: 'operationsFlagRef', label: 'Operations Period Flag', type: 'reference', refType: 'flag', required: false }
    ],
    outputs: [
        { key: 'gst_base', label: 'GST Base Amount', type: 'flow' },
        { key: 'gst_amount', label: 'GST Amount', type: 'flow' },
        { key: 'gst_paid', label: 'GST Paid (Outflow)', type: 'flow' },
        { key: 'receivable_opening', label: 'GST Receivable - Opening', type: 'stock_start' },
        { key: 'gst_received', label: 'GST Received (Inflow)', type: 'flow' },
        { key: 'receivable_closing', label: 'GST Receivable - Closing', type: 'stock' },
        { key: 'net_gst_cashflow', label: 'Net GST Cash Flow', type: 'flow' },
        { key: 'gst_received_construction', label: 'GST Received (Construction)', type: 'flow' },
        { key: 'gst_received_operations', label: 'GST Received (Operations)', type: 'flow' }
    ],
    outputFormulas: {
        gst_base: '{gstBaseRef}',
        gst_amount: '{gstBaseRef} × {gstRatePct}/100',
        gst_paid: '-gst_amount × {activeFlagRef}',
        receivable_opening: 'SHIFT(receivable_closing, 1)',
        gst_received: 'SHIFT(CUMSUM(-gst_paid), {receiptDelayMonths}) - SHIFT(CUMSUM(-gst_paid), {receiptDelayMonths}+1)',
        receivable_closing: 'CUMSUM(-gst_paid) - CUMSUM(gst_received)',
        net_gst_cashflow: 'gst_paid + gst_received',
        gst_received_construction: 'gst_received × {constructionFlagRef}',
        gst_received_operations: 'gst_received × {operationsFlagRef}'
    }
}

/**
 * GST Paid/Received using Gold Standard CUMSUM pattern.
 * Tracks GST paid on a base amount with configurable receipt delay.
 *
 * Pattern:
 *   GST Amount = Base * Rate
 *   GST Paid = -GST Amount (outflow during active period)
 *   Cumulative Paid = CUMSUM(GST Paid)
 *   Cumulative Received = SHIFT(Cumulative Paid, delay)
 *   GST Received = Cumulative Received - Prior Cumulative Received
 *   Receivable Closing = Cumulative Paid - Cumulative Received
 *   Receivable Opening = Prior Receivable Closing
 */
export function calculate(inputs, arrayLength, context) {
    const {
        gstBaseRef = null,
        activeFlagRef = null,
        gstRatePct = 10,
        receiptDelayMonths = 1,
        constructionFlagRef = null,
        operationsFlagRef = null
    } = inputs

    // Initialize outputs
    const outputs = {
        gst_base: new Array(arrayLength).fill(0),
        gst_amount: new Array(arrayLength).fill(0),
        gst_paid: new Array(arrayLength).fill(0),
        receivable_opening: new Array(arrayLength).fill(0),
        gst_received: new Array(arrayLength).fill(0),
        receivable_closing: new Array(arrayLength).fill(0),
        net_gst_cashflow: new Array(arrayLength).fill(0),
        gst_received_construction: new Array(arrayLength).fill(0),
        gst_received_operations: new Array(arrayLength).fill(0)
    }

    // Get base amount array
    const baseArray = gstBaseRef && context[gstBaseRef]
        ? context[gstBaseRef]
        : new Array(arrayLength).fill(0)

    // Get active flag array
    const activeFlag = activeFlagRef && context[activeFlagRef]
        ? context[activeFlagRef]
        : new Array(arrayLength).fill(1)

    // GST rate and delay - support both direct values and references using shared resolver
    const gstRate = resolveModuleInput(gstRatePct, context, 10) / 100
    const delay = Math.round(resolveModuleInput(receiptDelayMonths, context, 1))

    // Step 1: Calculate GST amounts and paid for each period
    const gstPaidAmounts = new Array(arrayLength).fill(0)

    for (let i = 0; i < arrayLength; i++) {
        const isActive = activeFlag[i] === 1 || activeFlag[i] === true
        const base = baseArray[i] || 0

        outputs.gst_base[i] = base

        if (isActive && base !== 0) {
            const gstAmount = base * gstRate
            outputs.gst_amount[i] = gstAmount
            outputs.gst_paid[i] = -gstAmount  // Outflow (negative)
            gstPaidAmounts[i] = gstAmount     // Positive for tracking
        }
    }

    // Step 2: Calculate cumulative GST paid (CUMSUM pattern)
    const cumPaid = new Array(arrayLength).fill(0)
    let runningPaid = 0
    for (let i = 0; i < arrayLength; i++) {
        runningPaid += gstPaidAmounts[i]
        cumPaid[i] = runningPaid
    }

    // Step 3: Calculate cumulative received = SHIFT(cumPaid, delay)
    const cumReceived = new Array(arrayLength).fill(0)
    for (let i = delay; i < arrayLength; i++) {
        cumReceived[i] = cumPaid[i - delay]
    }

    // Step 4: Calculate period values from cumulative (Gold Standard pattern)
    for (let i = 0; i < arrayLength; i++) {
        // Received = CumReceived[i] - CumReceived[i-1]
        const priorCumReceived = i > 0 ? cumReceived[i - 1] : 0
        outputs.gst_received[i] = cumReceived[i] - priorCumReceived

        // Receivable Closing = CumPaid - CumReceived
        outputs.receivable_closing[i] = cumPaid[i] - cumReceived[i]

        // Receivable Opening = Prior Receivable Closing (CUMSUM - X pattern)
        const priorCumPaid = i > 0 ? cumPaid[i - 1] : 0
        outputs.receivable_opening[i] = priorCumPaid - priorCumReceived

        // Net GST Cash Flow = GST Paid + GST Received (paid is negative, received is positive)
        outputs.net_gst_cashflow[i] = outputs.gst_paid[i] + outputs.gst_received[i]
    }

    // Split GST received by construction/operations flags
    const constructionFlag = constructionFlagRef && context[constructionFlagRef]
        ? context[constructionFlagRef]
        : null
    const operationsFlag = operationsFlagRef && context[operationsFlagRef]
        ? context[operationsFlagRef]
        : null

    if (constructionFlag || operationsFlag) {
        for (let i = 0; i < arrayLength; i++) {
            if (constructionFlag) {
                outputs.gst_received_construction[i] = outputs.gst_received[i] * (constructionFlag[i] || 0)
            }
            if (operationsFlag) {
                outputs.gst_received_operations[i] = outputs.gst_received[i] * (operationsFlag[i] || 0)
            }
        }
    }

    return outputs
}
