/**
 * Compact JSON utilities for token-optimized exports
 */

// Compression threshold - use RLE only if output is at least 30% smaller
const RLE_COMPRESSION_THRESHOLD = 0.7

/**
 * Round a number to specified decimal places
 */
function round(num, decimals = 2) {
    if (typeof num !== 'number' || isNaN(num)) return 0
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

/**
 * Encode an array using run-length encoding for repeated values
 * [840, 840, 840, 210] → [{ v: 840, r: 3 }, 210]
 * Single values stay as-is, repeated values become {v, r}
 */
function runLengthEncode(arr, decimals = 2) {
    if (!arr || arr.length === 0) return []

    const result = []
    let i = 0

    while (i < arr.length) {
        const val = round(arr[i], decimals)
        let count = 1

        // Count consecutive identical values
        while (i + count < arr.length && round(arr[i + count], decimals) === val) {
            count++
        }

        if (count >= 3) {
            // Worth encoding as run
            result.push({ v: val, r: count })
        } else {
            // Push individual values
            for (let j = 0; j < count; j++) {
                result.push(val)
            }
        }

        i += count
    }

    return result
}

/**
 * Decode run-length encoded array back to regular array
 */
function runLengthDecode(encoded) {
    if (!encoded || encoded.length === 0) return []

    const result = []
    for (const item of encoded) {
        if (typeof item === 'object' && item.v !== undefined && item.r !== undefined) {
            for (let i = 0; i < item.r; i++) {
                result.push(item.v)
            }
        } else {
            result.push(item)
        }
    }
    return result
}

/**
 * Encode a binary flag array as sparse (only store indices of 1s)
 * [0, 0, 1, 1, 0, 0, 0, 1] → { ones: [2, 3, 7], len: 8 }
 */
function sparseEncodeFlags(arr) {
    if (!arr || arr.length === 0) return { ones: [], len: 0 }

    const ones = []
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === 1 || arr[i] === '1' || arr[i] === true) {
            ones.push(i)
        }
    }

    return { ones, len: arr.length }
}

/**
 * Decode sparse flag array back to regular array
 */
function sparseDecodeFlags(sparse) {
    if (!sparse || !sparse.len) return []

    const result = new Array(sparse.len).fill(0)
    for (const idx of (sparse.ones || [])) {
        result[idx] = 1
    }
    return result
}

/**
 * Choose best encoding for an array based on its contents
 * Returns { encoding: 'rle'|'sparse'|'raw', data: ... }
 */
function compactEncode(arr, type = 'flow', decimals = 2) {
    if (!arr || arr.length === 0) return { encoding: 'raw', data: [] }

    // For flags, use sparse encoding if mostly zeros
    if (type === 'flag') {
        const onesCount = arr.filter(v => v === 1 || v === '1' || v === true).length
        if (onesCount < arr.length / 2) {
            return { encoding: 'sparse', data: sparseEncodeFlags(arr) }
        }
    }

    // Try run-length encoding
    const rle = runLengthEncode(arr, decimals)

    // Calculate token savings (rough estimate: each number ~2-8 chars)
    const rawTokens = arr.length * 4  // avg 4 chars per number
    const rleTokens = rle.reduce((sum, item) => {
        if (typeof item === 'object') {
            return sum + 12  // {v:X,r:N} ~12 chars
        }
        return sum + 4
    }, 0)

    if (rleTokens < rawTokens * RLE_COMPRESSION_THRESHOLD) {
        return { encoding: 'rle', data: rle }
    }

    // Fall back to raw with rounding
    return { encoding: 'raw', data: arr.map(v => round(v, decimals)) }
}

/**
 * Decode a compactly encoded array
 */
function compactDecode(encoded) {
    if (!encoded) return []

    switch (encoded.encoding) {
        case 'sparse':
            return sparseDecodeFlags(encoded.data)
        case 'rle':
            return runLengthDecode(encoded.data)
        case 'raw':
        default:
            return encoded.data || []
    }
}

/**
 * Create a compact version of the debug export data
 */
export function compactifyDebugData(data) {
    const compact = {
        v: 2,  // version for decoder
        t: data.exportedAt,
        timeline: data.timeline,  // keep as-is, it's already small
        // Remove 'years' - it's just startYear to endYear
        inputs: {},
        calculations: {}
    }

    // Compact inputs
    for (const [ref, input] of Object.entries(data.inputs || {})) {
        const encoded = compactEncode(input.yearly, input.type)
        compact.inputs[ref] = {
            n: input.name,
            y: encoded.data
        }
        // Only add encoding marker if not raw
        if (encoded.encoding !== 'raw') {
            compact.inputs[ref].e = encoded.encoding
        }
        // Only add type if not 'flow' (the default)
        if (input.type && input.type !== 'flow') {
            compact.inputs[ref].t = input.type
        }
    }

    // Compact calculations
    for (const [ref, calc] of Object.entries(data.calculations || {})) {
        const encoded = compactEncode(calc.yearly, calc.type)
        compact.calculations[ref] = {
            n: calc.name,
            f: calc.formula,
            y: encoded.data
        }
        if (encoded.encoding !== 'raw') {
            compact.calculations[ref].e = encoded.encoding
        }
        if (calc.type && calc.type !== 'flow') {
            compact.calculations[ref].t = calc.type
        }
    }

    return compact
}

/**
 * Expand a compact debug data back to full format
 */
export function expandDebugData(compact) {
    if (!compact.v || compact.v < 2) {
        // Already in old format
        return compact
    }

    const expanded = {
        exportedAt: compact.t,
        timeline: compact.timeline,
        years: [],  // Regenerate from timeline
        inputs: {},
        calculations: {}
    }

    // Regenerate years array
    for (let y = compact.timeline.startYear; y <= compact.timeline.endYear; y++) {
        expanded.years.push(y)
    }

    // Expand inputs
    for (const [ref, input] of Object.entries(compact.inputs || {})) {
        const decoded = compactDecode({ encoding: input.e || 'raw', data: input.y })
        expanded.inputs[ref] = {
            name: input.n,
            type: input.t || 'flow',
            yearly: decoded
        }
    }

    // Expand calculations
    for (const [ref, calc] of Object.entries(compact.calculations || {})) {
        const decoded = compactDecode({ encoding: calc.e || 'raw', data: calc.y })
        expanded.calculations[ref] = {
            name: calc.n,
            formula: calc.f,
            type: calc.t || 'flow',
            yearly: decoded
        }
    }

    return expanded
}

// Export individual functions for testing
export { round, runLengthEncode, runLengthDecode, sparseEncodeFlags, sparseDecodeFlags, compactEncode, compactDecode }
