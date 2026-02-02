/**
 * Generate model files from a recipe.
 * Reads recipe.json and produces:
 *   - data/model-inputs.json
 *   - data/model-calculations.json
 *   - data/model-modules.json
 */
import { promises as fs } from 'fs'
import path from 'path'
import { resolveKeyPeriods } from './resolvers/keyPeriodResolver.js'
import { resolveInputGroups, resolveInputs, resolveIndices } from './resolvers/inputResolver.js'
import { resolveCalculations, resolveCalculationGroups, resolveTabs } from './resolvers/calculationResolver.js'
import { resolveModuleGroups, resolveModuleCalculations, resolveModules } from './resolvers/moduleResolver.js'

/**
 * Build a constants lookup from recipe inputs (for periodsFromRef resolution).
 * Maps "C1.19" -> 65, etc.
 */
function buildConstantsLookup(recipeInputs) {
  const lookup = {}
  for (const input of recipeInputs) {
    if (input.ref && input.ref.startsWith('C') && input.value !== undefined) {
      lookup[input.ref] = input.value
    }
  }
  return lookup
}

/**
 * Generate all three model files from a recipe.
 */
export async function generateFromRecipe(recipe, dataDir, options = {}) {
  const { dryRun = false } = options
  const constantsLookup = buildConstantsLookup(recipe.inputs || [])

  // --- 1. Resolve Key Periods ---
  const keyPeriods = resolveKeyPeriods(
    recipe.keyPeriods || [],
    recipe.timeline,
    constantsLookup
  )

  // --- 2. Resolve Inputs ---
  const inputGlassGroups = resolveInputGroups(recipe.inputGroups || [])
  const inputGlass = resolveInputs(recipe.inputs || [])
  const indices = resolveIndices(recipe.indices || [])

  // --- 3. Build model-inputs.json ---
  const modelInputs = {
    config: {
      minFrequency: 'monthly',
      startYear: recipe.timeline.startYear,
      startMonth: recipe.timeline.startMonth,
      endYear: recipe.timeline.endYear,
      endMonth: recipe.timeline.endMonth,
      zeroThreshold: 0.000001
    },
    keyPeriods,
    indices,
    inputGlassGroups,
    inputGlass
  }

  // --- 4. Resolve Calculations ---
  const calculations = resolveCalculations(recipe.calculations || [])
  const calculationsGroups = resolveCalculationGroups(recipe.calculationGroups || [])
  const calculationsTabs = resolveTabs(recipe.tabs || [])

  // --- 5. Build model-calculations.json ---
  const modelCalculations = {
    _description: 'Model structure - formulas and relationships only',
    calculationsGroups,
    calculations,
    calculationsTabs
  }

  // --- 6. Resolve Modules ---
  const moduleGroups = resolveModuleGroups(recipe.moduleGroups || [])
  const moduleCalculations = resolveModuleCalculations(recipe.moduleCalculations || [])
  const modules = resolveModules(recipe.modules || [])

  // --- 7. Build model-modules.json ---
  const modelModules = {
    moduleGroups,
    moduleCalculations,
    modules,
    _mRefMap: recipe.mRefMap || {}
  }

  // --- 8. Write files ---
  if (dryRun) {
    console.log('DRY RUN - files not written')
    console.log(`  model-inputs.json: ${keyPeriods.length} key periods, ${inputGlassGroups.length} groups, ${inputGlass.length} inputs`)
    console.log(`  model-calculations.json: ${calculations.length} calculations, ${calculationsGroups.length} groups, ${calculationsTabs.length} tabs`)
    console.log(`  model-modules.json: ${modules.length} modules, ${moduleCalculations.length} module calcs`)
    return { modelInputs, modelCalculations, modelModules }
  }

  await Promise.all([
    fs.writeFile(
      path.join(dataDir, 'model-inputs.json'),
      JSON.stringify(modelInputs, null, 2),
      'utf-8'
    ),
    fs.writeFile(
      path.join(dataDir, 'model-calculations.json'),
      JSON.stringify(modelCalculations, null, 2),
      'utf-8'
    ),
    fs.writeFile(
      path.join(dataDir, 'model-modules.json'),
      JSON.stringify(modelModules, null, 2),
      'utf-8'
    )
  ])

  console.log('Model files generated:')
  console.log(`  model-inputs.json: ${keyPeriods.length} key periods, ${inputGlassGroups.length} groups, ${inputGlass.length} inputs`)
  console.log(`  model-calculations.json: ${calculations.length} calculations, ${calculationsGroups.length} groups, ${calculationsTabs.length} tabs`)
  console.log(`  model-modules.json: ${modules.length} modules, ${moduleCalculations.length} module calcs`)

  return { modelInputs, modelCalculations, modelModules }
}

/**
 * CLI entry point
 */
export async function runGenerate(recipePath, dataDir, options = {}) {
  const raw = await fs.readFile(recipePath, 'utf-8')
  const recipe = JSON.parse(raw)
  return generateFromRecipe(recipe, dataDir, options)
}
