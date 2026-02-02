#!/usr/bin/env node
/**
 * Recipe Agent CLI
 *
 * Usage:
 *   node recipe/agent/index.js extract           Extract recipe from current model
 *   node recipe/agent/index.js generate           Generate model files from recipe
 *   node recipe/agent/index.js generate --dry-run  Preview without writing
 *   node recipe/agent/index.js validate           Run engine + check BS/covenants/IRR (via vitest)
 *   node recipe/agent/index.js lint               Best practice checks (no engine)
 *   node recipe/agent/index.js debug              BS imbalance diagnosis (via vitest)
 *   node recipe/agent/index.js roundtrip          Extract -> Generate -> Validate (via vitest)
 *   node recipe/agent/index.js compare            Compare engine output vs IFS Excel + export (via vitest)
 */
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.resolve(__dirname, '../../data')
const RECIPE_PATH = path.resolve(__dirname, '../recipe.json')
const PROJECT_ROOT = path.resolve(__dirname, '../..')

const command = process.argv[2]
const flags = process.argv.slice(3)
const dryRun = flags.includes('--dry-run')

async function main() {
  switch (command) {
    case 'extract': {
      const { runExtract } = await import('./extract.js')
      await runExtract(DATA_DIR, RECIPE_PATH)
      break
    }

    case 'generate': {
      const { runGenerate } = await import('./generate.js')
      await runGenerate(RECIPE_PATH, DATA_DIR, { dryRun })
      break
    }

    case 'validate': {
      // Run via vitest since server engine needs vitest's module resolution
      console.log('Running validation via vitest...')
      try {
        execSync('npx vitest run tests/recipe-roundtrip.test.js -t "validate"', {
          cwd: PROJECT_ROOT,
          stdio: 'inherit'
        })
      } catch (e) {
        process.exit(1)
      }
      break
    }

    case 'lint': {
      const { runLint } = await import('./lint.js')
      const issues = await runLint(RECIPE_PATH)
      const errors = issues.filter(i => i.level === 'error')
      process.exit(errors.length > 0 ? 1 : 0)
      break
    }

    case 'debug': {
      console.log('Running BS debug via vitest...')
      try {
        execSync('npx vitest run tests/recipe-roundtrip.test.js -t "debug"', {
          cwd: PROJECT_ROOT,
          stdio: 'inherit'
        })
      } catch (e) {
        process.exit(1)
      }
      break
    }

    case 'roundtrip': {
      console.log('=== Step 1: Extract recipe from current model ===')
      const { runExtract } = await import('./extract.js')
      await runExtract(DATA_DIR, RECIPE_PATH)

      console.log('\n=== Step 2: Generate model files from recipe ===')
      const { runGenerate } = await import('./generate.js')
      await runGenerate(RECIPE_PATH, DATA_DIR)

      console.log('\n=== Step 3: Validate + Lint via vitest ===')
      try {
        execSync('npx vitest run tests/recipe-roundtrip.test.js', {
          cwd: PROJECT_ROOT,
          stdio: 'inherit'
        })
        console.log('\n=== Roundtrip PASSED ===')
      } catch (e) {
        console.log('\n=== Roundtrip FAILED ===')
        process.exit(1)
      }
      break
    }

    case 'compare': {
      console.log('Running Excel comparison via vitest...')
      try {
        execSync('npx vitest run tests/excel-compare.test.js', {
          cwd: PROJECT_ROOT,
          stdio: 'inherit'
        })
      } catch (e) {
        process.exit(1)
      }
      break
    }

    default:
      console.log(`
Recipe Agent CLI

Commands:
  extract     Extract recipe from current model files
  generate    Generate model files from recipe.json
  validate    Run engine and check BS/covenants/IRR
  lint        Check best practices (no engine needed)
  debug       Diagnose BS imbalances
  roundtrip   Extract -> Generate -> Validate -> Lint
  compare     Compare engine output vs IFS Excel + export

Options:
  --dry-run   Preview without writing files (generate only)
`)
      break
  }
}

main().catch(err => {
  console.error('Error:', err.message)
  if (process.env.DEBUG) console.error(err.stack)
  process.exit(1)
})
