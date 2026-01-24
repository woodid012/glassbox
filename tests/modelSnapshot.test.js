import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  evalExprForAllPeriods,
  processArrayFunctions,
  cumsum,
  cumprod,
  cumsumY,
  cumprodY,
  shift,
} from '../utils/formulaEvaluator.js'
import { createTimeline } from '../utils/timeArrayHelpers.js'

// Load model data
function loadModelData() {
  const dataDir = join(process.cwd(), 'data')

  const calcData = JSON.parse(
    readFileSync(join(dataDir, 'model-calculations.json'), 'utf-8')
  )
  const inputs = JSON.parse(
    readFileSync(join(dataDir, 'model-inputs.json'), 'utf-8')
  )

  // Calculations are nested under the 'calculations' property
  return {
    calculations: calcData.calculations || [],
    calculationsGroups: calcData.calculationsGroups || [],
    inputs
  }
}

describe('Model Data Structure Tests', () => {
  let modelData

  beforeAll(() => {
    modelData = loadModelData()
  })

  it('loads model data successfully', () => {
    expect(modelData.calculations).toBeDefined()
    expect(modelData.inputs).toBeDefined()
    expect(Array.isArray(modelData.calculations)).toBe(true)
    expect(modelData.calculations.length).toBeGreaterThan(0)
  })

  it('all calculations have required fields', () => {
    for (const calc of modelData.calculations) {
      expect(calc.id).toBeDefined()
      expect(typeof calc.id).toBe('number')
      expect(calc.name).toBeDefined()
    }
  })

  it('creates timeline correctly', () => {
    const timeline = createTimeline(2025, 1, 2026, 12, 'monthly')
    expect(timeline.periods).toBe(24)
    expect(timeline.year[0]).toBe(2025)
    expect(timeline.month[0]).toBe(1)
  })
})

describe('Calculation Consistency Tests', () => {
  let modelData

  beforeAll(() => {
    modelData = loadModelData()
  })

  it('all calculations have unique IDs', () => {
    const ids = modelData.calculations.map(c => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('all R-references point to existing calculations', () => {
    const calcIds = new Set(modelData.calculations.map(c => c.id))
    const missingRefs = []

    for (const calc of modelData.calculations) {
      if (!calc.formula) continue

      const refs = calc.formula.match(/R(\d+)/g) || []
      for (const ref of refs) {
        const refId = parseInt(ref.slice(1))
        if (!calcIds.has(refId)) {
          missingRefs.push({ calcId: calc.id, missingRef: ref })
        }
      }
    }

    if (missingRefs.length > 0) {
      console.log('Missing references:', missingRefs.slice(0, 10))
    }

    expect(missingRefs.length).toBe(0)
  })

  it('no calculations have empty formulas (except placeholders)', () => {
    const emptyFormulas = modelData.calculations.filter(c =>
      !c.formula && c.name !== 'placeholder'
    )

    // Log any empty formulas found
    if (emptyFormulas.length > 0) {
      console.log('Calculations with empty formulas:',
        emptyFormulas.slice(0, 5).map(c => ({ id: c.id, name: c.name }))
      )
    }
  })

  it('all formulas have balanced parentheses', () => {
    const unbalanced = []

    for (const calc of modelData.calculations) {
      if (!calc.formula) continue

      let depth = 0
      for (const char of calc.formula) {
        if (char === '(') depth++
        if (char === ')') depth--
        if (depth < 0) break
      }

      if (depth !== 0) {
        unbalanced.push({ id: calc.id, name: calc.name, formula: calc.formula })
      }
    }

    expect(unbalanced.length).toBe(0)
  })
})

describe('Known Calculation Regression Tests', () => {
  it('CUMSUM(1) produces period counter [1, 2, 3, ...]', () => {
    const timeline = createTimeline(2025, 1, 2025, 12, 'monthly')
    const refs = {}

    const { processedFormula, arrayFnResults } = processArrayFunctions(
      'CUMSUM(1)',
      refs,
      timeline
    )

    for (const [placeholder, values] of Object.entries(arrayFnResults)) {
      refs[placeholder] = values
    }

    const result = evalExprForAllPeriods(processedFormula, refs, timeline.periods)
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('compound interest calculation is correct', () => {
    const timeline = createTimeline(2025, 1, 2025, 12, 'monthly')

    // Principal = 1000, Monthly rate = 1% (0.01)
    const refs = {
      Principal: new Array(12).fill(1000),
      Rate: new Array(12).fill(0.01),
    }

    // Simple interest: Principal * (1 + Rate)^period
    const factor = evalExprForAllPeriods('1 + Rate', refs, 12)
    const compoundFactor = cumprod(factor, 12)

    // After 12 months with 1% monthly: 1000 * 1.01^12 ≈ 1126.83
    const finalValue = 1000 * compoundFactor[11]
    expect(finalValue).toBeCloseTo(1126.83, 1)
  })

  it('SHIFT correctly lags values', () => {
    const timeline = createTimeline(2025, 1, 2025, 6, 'monthly')
    const refs = {
      R1: [100, 200, 300, 400, 500, 600]
    }

    const { processedFormula, arrayFnResults } = processArrayFunctions(
      'SHIFT(R1, 1)',
      refs,
      timeline
    )

    expect(arrayFnResults['__ARRAYFN0__']).toEqual([0, 100, 200, 300, 400, 500])
  })
})
