#!/usr/bin/env node
/**
 * AI Build Pipeline
 *
 * Runs the full spec -> model pipeline with validation.
 * Designed to be called repeatedly in an AI iteration loop.
 *
 * Usage:
 *   node recipe/agent/ai-build.js <spec.json>
 *   node recipe/agent/ai-build.js <spec.json> --json   (structured output)
 *
 * Steps:
 *   1. compile: spec -> recipe.json
 *   2. generate: recipe -> model files
 *   3. validate: run engine + BS/covenant/IRR checks
 *   4. lint: best practice checks
 *
 * Returns structured pass/fail with details.
 */
import path from 'path'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.resolve(__dirname, '../../data')
const RECIPE_PATH = path.resolve(__dirname, '../recipe.json')

const specArg = process.argv[2]
const jsonOutput = process.argv.includes('--json')

if (!specArg || specArg.startsWith('--')) {
    console.error('Usage: node recipe/agent/ai-build.js <spec.json> [--json]')
    process.exit(1)
}

const specPath = path.isAbsolute(specArg)
    ? specArg
    : path.resolve(process.cwd(), specArg)

async function run() {
    const result = {
        passed: true,
        steps: {
            compile: { passed: false, error: null },
            generate: { passed: false, error: null },
            validate: { passed: false, details: null },
            lint: { passed: false, issues: null }
        }
    }

    // Step 1: Compile spec to recipe
    try {
        if (!jsonOutput) console.log('=== Step 1: Compile spec ===')
        const specContent = await fs.readFile(specPath, 'utf-8')
        const spec = JSON.parse(specContent)

        const { compileSpec } = await import('../spec/compile.js')
        const recipe = compileSpec(spec)
        await fs.writeFile(RECIPE_PATH, JSON.stringify(recipe, null, 2))

        result.steps.compile.passed = true
        result.steps.compile.stats = {
            keyPeriods: recipe.keyPeriods.length,
            inputs: recipe.inputs.length,
            calculations: recipe.calculations.length,
            modules: recipe.modules.length
        }
        if (!jsonOutput) console.log(`  Compiled: ${recipe.calculations.length} calcs, ${recipe.modules.length} modules`)
    } catch (err) {
        result.steps.compile.error = err.message
        result.passed = false
        return finalize(result)
    }

    // Step 2: Generate model files
    try {
        if (!jsonOutput) console.log('\n=== Step 2: Generate model files ===')
        const { runGenerate } = await import('./generate.js')
        await runGenerate(RECIPE_PATH, DATA_DIR)
        result.steps.generate.passed = true
        if (!jsonOutput) console.log('  Generated successfully')
    } catch (err) {
        result.steps.generate.error = err.message
        result.passed = false
        return finalize(result)
    }

    // Step 3: Validate
    try {
        if (!jsonOutput) console.log('\n=== Step 3: Validate ===')
        const recipeContent = await fs.readFile(RECIPE_PATH, 'utf-8')
        const recipe = JSON.parse(recipeContent)

        const { validateRecipe } = await import('./validate.js')
        const validation = validateRecipe(recipe, DATA_DIR)

        result.steps.validate.passed = validation.passed
        result.steps.validate.details = {
            balanceSheet: validation.balanceSheet,
            sourcesAndUses: validation.sourcesAndUses,
            covenants: validation.covenants,
            irr: validation.irr,
            formulaIntegrity: validation.formulaIntegrity
        }

        if (!validation.passed) result.passed = false

        if (!jsonOutput) {
            const { printValidationResults } = await import('./validate.js')
            printValidationResults(validation)
        }
    } catch (err) {
        result.steps.validate.error = err.message
        result.passed = false
    }

    // Step 4: Lint
    try {
        if (!jsonOutput) console.log('\n=== Step 4: Lint ===')
        const recipeContent = await fs.readFile(RECIPE_PATH, 'utf-8')
        const recipe = JSON.parse(recipeContent)

        const { lintRecipe } = await import('./lint.js')
        const issues = await lintRecipe(recipe)

        const errors = issues.filter(i => i.level === 'error')
        const warnings = issues.filter(i => i.level === 'warning')

        result.steps.lint.passed = errors.length === 0
        result.steps.lint.issues = {
            errors: errors.length,
            warnings: warnings.length,
            details: issues.slice(0, 20) // Cap at 20 for readability
        }

        if (errors.length > 0) result.passed = false

        if (!jsonOutput) {
            console.log(`  ${errors.length} errors, ${warnings.length} warnings`)
            for (const e of errors.slice(0, 10)) console.log(`    [ERROR] ${e.message}`)
            for (const w of warnings.slice(0, 10)) console.log(`    [WARN]  ${w.message}`)
        }
    } catch (err) {
        result.steps.lint.error = err.message
    }

    return finalize(result)
}

function finalize(result) {
    if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2))
    } else {
        console.log(`\n=== ${result.passed ? 'BUILD PASSED' : 'BUILD FAILED'} ===`)
    }
    process.exit(result.passed ? 0 : 1)
}

run().catch(err => {
    if (jsonOutput) {
        console.log(JSON.stringify({ passed: false, error: err.message }))
    } else {
        console.error('Fatal error:', err.message)
    }
    process.exit(1)
})
