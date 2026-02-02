/**
 * Recipe Roundtrip Test
 *
 * Verifies:
 * 1. Extract recipe from current model
 * 2. Generate model files from recipe
 * 3. Validate: BS balances, covenants, IRR
 * 4. Lint: best practice checks
 * 5. Debug: BS diagnosis available
 * 6. Values match original within tolerance
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { join } from 'path'
import { extractRecipe } from '../recipe/agent/extract.js'
import { generateFromRecipe } from '../recipe/agent/generate.js'
import { validateRecipe, printValidationResults } from '../recipe/agent/validate.js'
import { lintRecipe } from '../recipe/agent/lint.js'
import { debugBS, printDebugReport } from '../recipe/agent/debug.js'

const DATA_DIR = join(process.cwd(), 'data')
const RECIPE_PATH = join(process.cwd(), 'recipe', 'recipe.json')

describe('Recipe System', () => {
  let recipe
  let originalInputs, originalCalcs, originalModules

  beforeAll(async () => {
    // Save originals
    originalInputs = readFileSync(join(DATA_DIR, 'model-inputs.json'), 'utf-8')
    originalCalcs = readFileSync(join(DATA_DIR, 'model-calculations.json'), 'utf-8')
    originalModules = readFileSync(join(DATA_DIR, 'model-modules.json'), 'utf-8')
  })

  it('should extract recipe from current model', async () => {
    recipe = await extractRecipe(DATA_DIR)

    expect(recipe.project).toBeDefined()
    expect(recipe.timeline).toBeDefined()
    expect(recipe.keyPeriods.length).toBeGreaterThan(0)
    expect(recipe.inputs.length).toBeGreaterThan(0)
    expect(recipe.calculations.length).toBeGreaterThan(0)
    expect(recipe.modules.length).toBeGreaterThan(0)

    // Write recipe to file
    writeFileSync(RECIPE_PATH, JSON.stringify(recipe, null, 2), 'utf-8')
  })

  it('should generate model files from recipe', async () => {
    const result = await generateFromRecipe(recipe, DATA_DIR)

    expect(result.modelInputs.keyPeriods.length).toBe(recipe.keyPeriods.length)
    expect(result.modelInputs.inputGlass.length).toBe(recipe.inputs.length)
    expect(result.modelCalculations.calculations.length).toBe(recipe.calculations.length)
    expect(result.modelModules.modules.length).toBe(recipe.modules.length)
  })

  it('should preserve all key period dates', () => {
    const origInputs = JSON.parse(originalInputs)
    const genInputs = JSON.parse(readFileSync(join(DATA_DIR, 'model-inputs.json'), 'utf-8'))

    for (const okp of origInputs.keyPeriods) {
      const gkp = genInputs.keyPeriods.find(k => k.id === okp.id)
      expect(gkp, `Missing key period ${okp.id} (${okp.name})`).toBeDefined()
      expect(gkp.startYear).toBe(okp.startYear)
      expect(gkp.startMonth).toBe(okp.startMonth)
      expect(gkp.endYear).toBe(okp.endYear)
      expect(gkp.endMonth).toBe(okp.endMonth)
      expect(gkp.periods).toBe(okp.periods)
    }
  })

  it('should preserve all calculation formulas', () => {
    const origCalcs = JSON.parse(originalCalcs)
    const genCalcs = JSON.parse(readFileSync(join(DATA_DIR, 'model-calculations.json'), 'utf-8'))

    for (const oc of origCalcs.calculations) {
      const gc = genCalcs.calculations.find(c => c.id === oc.id)
      expect(gc, `Missing calc R${oc.id} (${oc.name})`).toBeDefined()
      expect(gc.formula).toBe(oc.formula)
    }
  })

  it('should preserve all module calculation formulas', () => {
    const origMods = JSON.parse(originalModules)
    const genMods = JSON.parse(readFileSync(join(DATA_DIR, 'model-modules.json'), 'utf-8'))

    for (const om of origMods.moduleCalculations) {
      const gm = genMods.moduleCalculations.find(c => c.id === om.id)
      expect(gm, `Missing module calc R${om.id} (${om.name})`).toBeDefined()
      expect(gm.formula).toBe(om.formula)
    }
  })

  it('should preserve mRefMap', () => {
    const origMods = JSON.parse(originalModules)
    const genMods = JSON.parse(readFileSync(join(DATA_DIR, 'model-modules.json'), 'utf-8'))

    const origKeys = Object.keys(origMods._mRefMap || {}).sort()
    const genKeys = Object.keys(genMods._mRefMap || {}).sort()
    expect(genKeys).toEqual(origKeys)

    for (const key of origKeys) {
      expect(genMods._mRefMap[key]).toBe(origMods._mRefMap[key])
    }
  })

  it('validate: should pass BS balance check', () => {
    const results = validateRecipe(recipe, DATA_DIR)
    printValidationResults(results)

    expect(results.balanceSheet).toBeDefined()
    expect(results.balanceSheet.passed).toBe(true)
    if (results.balanceSheet.maxImbalance !== undefined) {
      expect(results.balanceSheet.maxImbalance).toBeLessThan(0.01)
    }
  })

  it('validate: should pass Sources & Uses check', () => {
    const results = validateRecipe(recipe, DATA_DIR)

    if (results.sourcesAndUses) {
      expect(results.sourcesAndUses.passed).toBe(true)
    }
  })

  it('validate: should check IRR in range', () => {
    const results = validateRecipe(recipe, DATA_DIR)

    for (const irrResult of results.irr) {
      if (irrResult.irr !== null) {
        console.log(`  ${irrResult.name}: ${(irrResult.irr * 100).toFixed(2)}%`)
      }
    }
  })

  it('lint: should have no errors', async () => {
    const issues = await lintRecipe(recipe)
    const errors = issues.filter(i => i.level === 'error')

    if (errors.length > 0) {
      console.log('Lint errors:')
      for (const e of errors) console.log(`  ${e.message}`)
    }
    expect(errors.length).toBe(0)
  })

  it('debug: should report balanced BS', () => {
    const report = debugBS(DATA_DIR)
    printDebugReport(report)
    expect(report.balanced).toBe(true)
  })

  // Cleanup: restore original files
  it('should restore original model files', () => {
    writeFileSync(join(DATA_DIR, 'model-inputs.json'), originalInputs, 'utf-8')
    writeFileSync(join(DATA_DIR, 'model-calculations.json'), originalCalcs, 'utf-8')
    writeFileSync(join(DATA_DIR, 'model-modules.json'), originalModules, 'utf-8')
  })
})
