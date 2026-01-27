
import { formatValue } from '../utils/valueAggregation.js';

// Optimised version with FASTER caching (no JSON.stringify)
const listFormatCache = new Map();

function getListFormat(locale, minimumFractionDigits, maximumFractionDigits) {
    // Simple cache key: locale + min + max
    // We assume standard options for other properties to keep key simple
    const key = locale + '|' + minimumFractionDigits + '|' + maximumFractionDigits;
    let fmt = listFormatCache.get(key);
    if (!fmt) {
        fmt = new Intl.NumberFormat(locale, { minimumFractionDigits, maximumFractionDigits });
        listFormatCache.set(key, fmt);
    }
    return fmt;
}

function formatValueOptimized(val, options = false) {
    // Fast path for strict boolean options (common case)
    let compact = false;
    let accounting = false;
    let decimals = 2;
    let emptyValue = '–';

    if (options === true) {
        compact = true;
    } else if (typeof options === 'object') {
        if (options.compact !== undefined) compact = options.compact;
        if (options.accounting !== undefined) accounting = options.accounting;
        if (options.decimals !== undefined) decimals = options.decimals;
        if (options.emptyValue !== undefined) emptyValue = options.emptyValue;
    } else if (options === false) {
        // defaults
        emptyValue = ''; // Note: original code defaults emptyValue to '' when options is object defaults, but '-' when options is boolean false? 
        // Actually: 
        // boolean: { compact: options, accounting: false, decimals: 2, emptyValue: '–' }
        // object: { compact: false, accounting: false, decimals: 2, emptyValue: '', ...options }
        // So if options is false -> compact=false, emptyValue='–'
    }

    if (val === 0 || val === null || val === undefined) {
        return emptyValue
    }
    if (typeof val !== 'number' || isNaN(val)) return '–'

    const absVal = Math.abs(val)
    let formatted

    if (compact && absVal >= 1000) {
        // Manual 'k' formatting is faster than Intl for likely use cases here if simple
        // But let's stay consistent
        formatted = getListFormat('en-US', 0, 1).format(absVal / 1000) + 'k'
    } else if (absVal >= 1000) {
        formatted = getListFormat('en-US', 0, 0).format(Math.round(absVal))
    } else if (absVal > 0 && absVal < 1) {
        const magnitude = Math.floor(Math.log10(absVal))
        const sigFigDecimals = Math.max(0, -magnitude + 1)
        formatted = getListFormat('en-US', 0, sigFigDecimals).format(absVal)
    } else {
        formatted = getListFormat('en-US', 0, decimals).format(absVal)
    }

    if (val < 0) {
        return accounting ? `(${formatted})` : `-${formatted}`
    }
    return formatted
}


console.log("Starting Benchmark 2 (Fast Cache Key)...");
const ITERATIONS = 100000;
const testValues = [0, 123, 1234, 0.0056, -5000, 1234567, 0.5];

// Warmup
for (let i = 0; i < 100; i++) {
    testValues.forEach(v => formatValue(v));
    testValues.forEach(v => formatValueOptimized(v));
}

console.time("Original formatValue");
for (let i = 0; i < ITERATIONS; i++) {
    testValues.forEach(v => formatValue(v));
}
console.timeEnd("Original formatValue");

console.time("Optimized formatValue");
for (let i = 0; i < ITERATIONS; i++) {
    testValues.forEach(v => formatValueOptimized(v));
}
console.timeEnd("Optimized formatValue");
