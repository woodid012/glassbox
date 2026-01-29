/**
 * Model Review Analysis Engine
 *
 * Matches current model state against a blueprint of expected components.
 * Pure JS, no API calls. Returns completeness status and gap analysis.
 */

/**
 * Match a calculation against an expected item using ref or name pattern
 */
function matchCalc(expected, calculations) {
    // Try exact ref match first (most reliable)
    if (expected.matchRef) {
        const refId = parseInt(expected.matchRef.replace('R', ''), 10)
        const calc = calculations.find(c => c.id === refId)
        if (calc) {
            return { matched: true, calc, matchType: 'ref' }
        }
    }

    // Fall back to name pattern matching
    if (expected.matchPattern) {
        for (const pattern of expected.matchPattern) {
            const regex = new RegExp(pattern, 'i')
            const calc = calculations.find(c => regex.test(c.name))
            if (calc) {
                return { matched: true, calc, matchType: 'pattern' }
            }
        }
    }

    return { matched: false, calc: null, matchType: null }
}

/**
 * Analyze section completeness
 */
function analyzeSection(section, calculations) {
    const groups = section.groups.map(group => {
        const items = group.expectedCalcs.map(expected => {
            const result = matchCalc(expected, calculations)
            return {
                label: expected.label,
                matchRef: expected.matchRef,
                matched: result.matched,
                matchType: result.matchType,
                calcId: result.calc?.id || null,
                calcName: result.calc?.name || null,
                formula: result.calc?.formula || null
            }
        })

        const matched = items.filter(i => i.matched).length
        const total = items.length

        return {
            name: group.name,
            items,
            matched,
            total,
            completionPct: total > 0 ? Math.round((matched / total) * 100) : 100
        }
    })

    const totalItems = groups.reduce((sum, g) => sum + g.total, 0)
    const totalMatched = groups.reduce((sum, g) => sum + g.matched, 0)

    return {
        id: section.id,
        name: section.name,
        tabId: section.tabId,
        groups,
        totalItems,
        totalMatched,
        completionPct: totalItems > 0 ? Math.round((totalMatched / totalItems) * 100) : 100
    }
}

/**
 * Analyze module completeness
 */
function analyzeModules(expectedModules, modules) {
    const items = expectedModules.map(expected => {
        const mod = modules.find(m => m.templateId === expected.templateId)
        return {
            templateId: expected.templateId,
            label: expected.label,
            required: expected.required,
            present: !!mod,
            enabled: mod ? (mod.enabled !== false) : false,
            moduleName: mod?.name || null
        }
    })

    const requiredItems = items.filter(i => i.required)
    const requiredPresent = requiredItems.filter(i => i.present).length
    const totalPresent = items.filter(i => i.present).length

    return {
        items,
        totalExpected: items.length,
        totalPresent,
        requiredTotal: requiredItems.length,
        requiredPresent,
        completionPct: items.length > 0 ? Math.round((totalPresent / items.length) * 100) : 100
    }
}

/**
 * Analyze expected inputs (key periods and constants)
 */
function analyzeInputs(expectedInputs, inputs) {
    const keyPeriods = inputs?.keyPeriods || []
    const constants = inputs?.inputGlass?.filter(ig =>
        ig.groupId === 100 || inputs?.inputGlassGroups?.find(g => g.id === ig.groupId)?.name?.toLowerCase()?.includes('constant')
    ) || []
    // Also check inputGlass items in the constants group
    const allConstants = inputs?.inputGlass?.filter(ig => ig.groupId === 100) || constants

    const keyPeriodResults = (expectedInputs.keyPeriods || []).map(expected => {
        let found = null
        for (const pattern of expected.matchPattern) {
            const regex = new RegExp(pattern, 'i')
            found = keyPeriods.find(kp => regex.test(kp.name))
            if (found) break
        }
        return {
            label: expected.label,
            matched: !!found,
            matchedName: found?.name || null,
            matchedId: found?.id || null
        }
    })

    const constantResults = (expectedInputs.constants || []).map(expected => {
        let found = null
        for (const pattern of expected.matchPattern) {
            const regex = new RegExp(pattern, 'i')
            found = allConstants.find(c => regex.test(c.name))
            if (found) break
        }
        return {
            label: expected.label,
            matched: !!found,
            matchedName: found?.name || null,
            matchedId: found?.id || null
        }
    })

    const kpMatched = keyPeriodResults.filter(r => r.matched).length
    const cMatched = constantResults.filter(r => r.matched).length
    const total = keyPeriodResults.length + constantResults.length
    const matched = kpMatched + cMatched

    return {
        keyPeriods: keyPeriodResults,
        constants: constantResults,
        totalExpected: total,
        totalMatched: matched,
        completionPct: total > 0 ? Math.round((matched / total) * 100) : 100
    }
}

/**
 * Analyze integrity checks
 */
function analyzeIntegrity(integrityChecks, calculationResults) {
    if (!calculationResults) {
        return integrityChecks.map(check => ({
            ...check,
            status: 'unknown',
            message: 'No calculation results available'
        }))
    }

    return integrityChecks.map(check => {
        const arr = calculationResults[check.checkRef] || []
        if (arr.length === 0) {
            return {
                ...check,
                status: 'missing',
                message: `${check.checkRef} not found in results`
            }
        }

        let maxDeviation = 0
        let failCount = 0
        let worstPeriod = 0

        for (let i = 0; i < arr.length; i++) {
            const val = Math.abs(arr[i] || 0)
            if (val > check.tolerance) failCount++
            if (val > Math.abs(maxDeviation)) {
                maxDeviation = arr[i] || 0
                worstPeriod = i
            }
        }

        return {
            ...check,
            status: failCount === 0 ? 'pass' : 'fail',
            maxDeviation,
            worstPeriod,
            failCount,
            totalPeriods: arr.length,
            message: failCount === 0
                ? 'All periods pass'
                : `${failCount}/${arr.length} periods fail (max deviation: ${maxDeviation.toFixed(4)} at period ${worstPeriod + 1})`
        }
    })
}

/**
 * Main analysis function
 */
export function analyzeModelCompleteness(blueprint, calculations, modules, inputs, calculationResults) {
    const calcs = calculations || []
    const mods = modules || []

    // Analyze each section
    const sections = (blueprint.sections || []).map(section =>
        analyzeSection(section, calcs)
    )

    // Analyze modules
    const moduleAnalysis = analyzeModules(blueprint.expectedModules || [], mods)

    // Analyze inputs
    const inputAnalysis = analyzeInputs(blueprint.expectedInputs || {}, inputs)

    // Analyze integrity
    const integrity = analyzeIntegrity(blueprint.integrityChecks || [], calculationResults)

    // Overall stats
    const calcTotal = sections.reduce((sum, s) => sum + s.totalItems, 0)
    const calcMatched = sections.reduce((sum, s) => sum + s.totalMatched, 0)

    const allTotal = calcTotal + moduleAnalysis.totalExpected + inputAnalysis.totalExpected
    const allMatched = calcMatched + moduleAnalysis.totalPresent + inputAnalysis.totalMatched

    return {
        overall: {
            total: allTotal,
            matched: allMatched,
            missing: allTotal - allMatched,
            completionPct: allTotal > 0 ? Math.round((allMatched / allTotal) * 100) : 100
        },
        calculations: {
            total: calcTotal,
            matched: calcMatched,
            completionPct: calcTotal > 0 ? Math.round((calcMatched / calcTotal) * 100) : 100
        },
        sections,
        modules: moduleAnalysis,
        inputs: inputAnalysis,
        integrity
    }
}

/**
 * Generate a markdown report from analysis results
 */
export function generateMarkdownReport(analysis, modelName) {
    const lines = []
    const now = new Date().toISOString().replace('T', ' ').split('.')[0]

    lines.push(`# Model Review Report`)
    lines.push(``)
    lines.push(`**Model:** ${modelName || 'GlassBox Project Finance Model'}`)
    lines.push(`**Generated:** ${now}`)
    lines.push(`**Overall Completeness:** ${analysis.overall.completionPct}% (${analysis.overall.matched}/${analysis.overall.total})`)
    lines.push(``)

    // Summary
    lines.push(`## Summary`)
    lines.push(``)
    lines.push(`| Area | Matched | Total | Status |`)
    lines.push(`|------|---------|-------|--------|`)
    lines.push(`| Calculations | ${analysis.calculations.matched} | ${analysis.calculations.total} | ${analysis.calculations.completionPct}% |`)
    lines.push(`| Modules | ${analysis.modules.totalPresent} | ${analysis.modules.totalExpected} | ${analysis.modules.completionPct}% |`)
    lines.push(`| Inputs | ${analysis.inputs.totalMatched} | ${analysis.inputs.totalExpected} | ${analysis.inputs.completionPct}% |`)
    lines.push(``)

    // Integrity
    lines.push(`## Integrity Checks`)
    lines.push(``)
    for (const check of analysis.integrity) {
        const icon = check.status === 'pass' ? 'PASS' : check.status === 'fail' ? 'FAIL' : '???'
        lines.push(`- **${check.label}** [${icon}]: ${check.message}`)
    }
    lines.push(``)

    // Sections
    lines.push(`## Calculation Sections`)
    lines.push(``)
    for (const section of analysis.sections) {
        lines.push(`### ${section.name} (${section.completionPct}%)`)
        lines.push(``)
        for (const group of section.groups) {
            lines.push(`**${group.name}** — ${group.matched}/${group.total}`)
            lines.push(``)
            for (const item of group.items) {
                const icon = item.matched ? '[x]' : '[ ]'
                const detail = item.matched
                    ? `${item.matchRef || ''} → R${item.calcId} "${item.calcName}" (${item.matchType})`
                    : `${item.matchRef || ''} — MISSING`
                lines.push(`- ${icon} ${item.label}: ${detail}`)
            }
            lines.push(``)
        }
    }

    // Modules
    lines.push(`## Modules`)
    lines.push(``)
    for (const mod of analysis.modules.items) {
        const icon = mod.present ? '[x]' : '[ ]'
        const status = mod.present
            ? (mod.enabled ? 'Active' : 'Disabled')
            : (mod.required ? 'MISSING (Required)' : 'MISSING (Optional)')
        lines.push(`- ${icon} ${mod.label} (${mod.templateId}): ${status}`)
    }
    lines.push(``)

    // Inputs
    lines.push(`## Key Inputs`)
    lines.push(``)
    lines.push(`### Key Periods`)
    for (const kp of analysis.inputs.keyPeriods) {
        const icon = kp.matched ? '[x]' : '[ ]'
        lines.push(`- ${icon} ${kp.label}${kp.matched ? ` → "${kp.matchedName}" (id: ${kp.matchedId})` : ' — MISSING'}`)
    }
    lines.push(``)
    lines.push(`### Constants`)
    for (const c of analysis.inputs.constants) {
        const icon = c.matched ? '[x]' : '[ ]'
        lines.push(`- ${icon} ${c.label}${c.matched ? ` → "${c.matchedName}" (id: ${c.matchedId})` : ' — MISSING'}`)
    }
    lines.push(``)

    // Missing items summary
    const missing = []
    for (const section of analysis.sections) {
        for (const group of section.groups) {
            for (const item of group.items) {
                if (!item.matched) {
                    missing.push({ area: `${section.name} > ${group.name}`, label: item.label, ref: item.matchRef })
                }
            }
        }
    }
    for (const mod of analysis.modules.items) {
        if (!mod.present) {
            missing.push({ area: 'Modules', label: mod.label, ref: mod.templateId })
        }
    }

    if (missing.length > 0) {
        lines.push(`## Missing Items (Priority List)`)
        lines.push(``)
        lines.push(`| # | Area | Item | Expected Ref |`)
        lines.push(`|---|------|------|-------------|`)
        missing.forEach((m, i) => {
            lines.push(`| ${i + 1} | ${m.area} | ${m.label} | ${m.ref || '-'} |`)
        })
        lines.push(``)
    }

    lines.push(`---`)
    lines.push(`*Report generated by GlassBox Model Review. For deeper analysis, invoke the project-finance-validator agent.*`)

    return lines.join('\n')
}
