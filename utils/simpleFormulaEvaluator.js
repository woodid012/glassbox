// Simple Formula Evaluator
// Basic formula parsing and evaluation for glass inputs

export function isFormula(value) {
    if (typeof value !== 'string') return false
    return value.startsWith('=')
}

export function extractFormula(value) {
    if (!isFormula(value)) return null
    // Return formula without the leading '='
    return value.substring(1).trim() || null
}

export function extractReferences(formula) {
    if (!formula || typeof formula !== 'string') return []
    
    const refs = new Set()
    
    // Match patterns like V1, F1, I1, C1 (case insensitive)
    const matches = formula.match(/[VFIC]\d+/gi) || []
    matches.forEach(ref => refs.add(ref.toUpperCase()))
    
    return Array.from(refs)
}

export function evaluateSimpleFormula(formula, context, periodIndex) {
    if (!formula || typeof formula !== 'string') return 0
    
    try {
        // Remove leading = if present
        let expr = formula.startsWith('=') ? formula.substring(1) : formula
        expr = expr.toUpperCase()
        
        // Replace references with values
        const refs = extractReferences(expr)
        refs.forEach(ref => {
            const arr = context[ref]
            const value = arr ? (arr[periodIndex] || 0) : 0
            expr = expr.replace(new RegExp(ref, 'gi'), String(value))
        })
        
        // Evaluate
        const result = Function(`"use strict"; return (${expr})`)()
        return typeof result === 'number' && !isNaN(result) ? result : 0
    } catch (err) {
        console.error('Formula evaluation error:', formula, err)
        return 0
    }
}

export function validateFormula(formula, availableRefs) {
    const errors = []
    
    if (!formula || typeof formula !== 'string') {
        return { valid: true, errors: [] }
    }
    
    const refs = extractReferences(formula)
    refs.forEach(ref => {
        if (!availableRefs.includes(ref)) {
            errors.push(`Unknown reference: ${ref}`)
        }
    })
    
    return { valid: errors.length === 0, errors }
}
