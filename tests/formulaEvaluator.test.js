import { describe, it, expect } from 'vitest'
import {
  evalExprForAllPeriods,
  cumsum,
  cumprod,
  cumsumY,
  cumprodY,
  shift,
  processArrayFunctions,
  evaluateSafeExpression,
} from '../utils/formulaEvaluator.js'

describe('evaluateSafeExpression', () => {
  it('evaluates simple arithmetic', () => {
    expect(evaluateSafeExpression('2 + 3')).toBe(5)
    expect(evaluateSafeExpression('10 - 4')).toBe(6)
    expect(evaluateSafeExpression('6 * 7')).toBe(42)
    expect(evaluateSafeExpression('20 / 4')).toBe(5)
  })

  it('handles parentheses', () => {
    expect(evaluateSafeExpression('(2 + 3) * 4')).toBe(20)
    expect(evaluateSafeExpression('2 + (3 * 4)')).toBe(14)
  })

  it('handles power operator', () => {
    expect(evaluateSafeExpression('2 ^ 3')).toBe(8)
    expect(evaluateSafeExpression('3 ^ 2')).toBe(9)
  })

  it('handles MIN/MAX/ABS functions', () => {
    expect(evaluateSafeExpression('MIN(5, 3)')).toBe(3)
    expect(evaluateSafeExpression('MAX(5, 3)')).toBe(5)
    expect(evaluateSafeExpression('ABS(-5)')).toBe(5)
  })

  it('returns 0 for empty expressions', () => {
    expect(evaluateSafeExpression('')).toBe(0)
    expect(evaluateSafeExpression('   ')).toBe(0)
  })

  it('returns 0 for invalid expressions', () => {
    expect(evaluateSafeExpression('invalid')).toBe(0)
    expect(evaluateSafeExpression('abc + def')).toBe(0)
  })

  it('handles division by zero gracefully', () => {
    // Returns Infinity which is not finite, so returns 0
    expect(evaluateSafeExpression('1 / 0')).toBe(0)
  })
})

describe('evalExprForAllPeriods', () => {
  it('evaluates constant expression for all periods', () => {
    const result = evalExprForAllPeriods('5', {}, 3)
    expect(result).toEqual([5, 5, 5])
  })

  it('evaluates arithmetic expression', () => {
    const result = evalExprForAllPeriods('2 + 3 * 4', {}, 2)
    expect(result).toEqual([14, 14])
  })

  it('substitutes single reference', () => {
    const refs = { R1: [10, 20, 30] }
    const result = evalExprForAllPeriods('R1 * 2', refs, 3)
    expect(result).toEqual([20, 40, 60])
  })

  it('substitutes multiple references', () => {
    const refs = {
      R1: [10, 20, 30],
      R2: [1, 2, 3],
    }
    const result = evalExprForAllPeriods('R1 + R2', refs, 3)
    expect(result).toEqual([11, 22, 33])
  })

  it('handles dotted references (V1.1, C1.5)', () => {
    const refs = {
      'V1.1': [100, 100, 100],
      'C1.5': [0.05, 0.05, 0.05],
    }
    const result = evalExprForAllPeriods('V1.1 * C1.5', refs, 3)
    expect(result).toEqual([5, 5, 5])
  })

  it('handles MIN/MAX in formulas', () => {
    const refs = {
      R1: [10, 5, 15],
      R2: [8, 8, 8],
    }
    const resultMin = evalExprForAllPeriods('MIN(R1, R2)', refs, 3)
    const resultMax = evalExprForAllPeriods('MAX(R1, R2)', refs, 3)
    expect(resultMin).toEqual([8, 5, 8])
    expect(resultMax).toEqual([10, 8, 15])
  })

  it('handles missing references by leaving them as literals', () => {
    // Note: Missing references are sanitized - the 'R' is stripped and
    // the number remains, causing it to be added to the result.
    // This test documents actual behavior - validation should catch
    // missing refs before evaluation.
    const refs = { R1: [10, 20, 30] }
    const result = evalExprForAllPeriods('R1 + R999', refs, 3)
    // R999 becomes just 999 after sanitization (R is stripped)
    expect(result).toEqual([1009, 1019, 1029])
  })

  it('handles power operator in formulas', () => {
    const refs = { R1: [2, 3, 4] }
    const result = evalExprForAllPeriods('R1 ^ 2', refs, 3)
    expect(result).toEqual([4, 9, 16])
  })
})

describe('cumsum', () => {
  it('computes cumulative sum', () => {
    const input = [1, 2, 3, 4, 5]
    const result = cumsum(input, 5)
    expect(result).toEqual([1, 3, 6, 10, 15])
  })

  it('handles zeros', () => {
    const input = [5, 0, 0, 5, 0]
    const result = cumsum(input, 5)
    expect(result).toEqual([5, 5, 5, 10, 10])
  })

  it('handles negative values', () => {
    const input = [10, -3, 5, -2]
    const result = cumsum(input, 4)
    expect(result).toEqual([10, 7, 12, 10])
  })

  it('handles empty array', () => {
    const result = cumsum([], 0)
    expect(result).toEqual([])
  })
})

describe('cumprod', () => {
  it('computes cumulative product', () => {
    const input = [1, 2, 3, 4]
    const result = cumprod(input, 4)
    expect(result).toEqual([1, 2, 6, 24])
  })

  it('handles ones', () => {
    const input = [2, 1, 1, 3]
    const result = cumprod(input, 4)
    expect(result).toEqual([2, 2, 2, 6])
  })

  it('handles fractional values', () => {
    const input = [1, 0.99, 0.99, 0.99]
    const result = cumprod(input, 4)
    expect(result[0]).toBeCloseTo(1)
    expect(result[1]).toBeCloseTo(0.99)
    expect(result[2]).toBeCloseTo(0.9801)
    expect(result[3]).toBeCloseTo(0.970299)
  })

  it('handles zeros (product becomes 0)', () => {
    const input = [2, 3, 0, 4]
    const result = cumprod(input, 4)
    expect(result).toEqual([2, 6, 0, 0])
  })
})

describe('cumsumY', () => {
  it('sums only at year boundaries', () => {
    const values = [10, 10, 10, 20, 20, 20]
    const years = [2024, 2024, 2024, 2025, 2025, 2025]
    const result = cumsumY(values, years, 6)
    // First 3 periods (year 2024): no sum yet
    // Periods 4-6 (year 2025): add 2024's value (10)
    expect(result).toEqual([0, 0, 0, 10, 10, 10])
  })

  it('accumulates across multiple year boundaries', () => {
    const values = [5, 5, 10, 10, 15, 15]
    const years = [2024, 2024, 2025, 2025, 2026, 2026]
    const result = cumsumY(values, years, 6)
    // Year 2024: 0
    // Year 2025: add 5 (from 2024) = 5
    // Year 2026: add 10 (from 2025) = 15
    expect(result).toEqual([0, 0, 5, 5, 15, 15])
  })
})

describe('cumprodY', () => {
  it('multiplies only at year boundaries', () => {
    const values = [0.95, 0.95, 0.95, 0.90, 0.90, 0.90]
    const years = [2024, 2024, 2024, 2025, 2025, 2025]
    const result = cumprodY(values, years, 6)
    // First 3 periods (year 2024): product = 1
    // Periods 4-6 (year 2025): multiply by 0.95
    expect(result[0]).toBe(1)
    expect(result[1]).toBe(1)
    expect(result[2]).toBe(1)
    expect(result[3]).toBeCloseTo(0.95)
    expect(result[4]).toBeCloseTo(0.95)
    expect(result[5]).toBeCloseTo(0.95)
  })

  it('accumulates product across multiple year boundaries', () => {
    const values = [0.9, 0.9, 0.8, 0.8, 0.7, 0.7]
    const years = [2024, 2024, 2025, 2025, 2026, 2026]
    const result = cumprodY(values, years, 6)
    // Year 2024: 1
    // Year 2025: 1 * 0.9 = 0.9
    // Year 2026: 0.9 * 0.8 = 0.72
    expect(result[0]).toBe(1)
    expect(result[1]).toBe(1)
    expect(result[2]).toBeCloseTo(0.9)
    expect(result[3]).toBeCloseTo(0.9)
    expect(result[4]).toBeCloseTo(0.72)
    expect(result[5]).toBeCloseTo(0.72)
  })
})

describe('shift', () => {
  it('shifts array forward by 1', () => {
    const input = [10, 20, 30, 40]
    const result = shift(input, 1, 4)
    expect(result).toEqual([0, 10, 20, 30])
  })

  it('shifts array forward by 2', () => {
    const input = [10, 20, 30, 40]
    const result = shift(input, 2, 4)
    expect(result).toEqual([0, 0, 10, 20])
  })

  it('handles shift larger than array', () => {
    const input = [10, 20, 30]
    const result = shift(input, 5, 3)
    expect(result).toEqual([0, 0, 0])
  })

  it('handles shift of 0', () => {
    const input = [10, 20, 30]
    const result = shift(input, 0, 3)
    expect(result).toEqual([10, 20, 30])
  })
})

describe('processArrayFunctions', () => {
  const mockTimeline = {
    periods: 4,
    year: [2024, 2024, 2025, 2025],
  }

  it('processes CUMSUM function', () => {
    const refs = { R1: [1, 2, 3, 4] }
    const { processedFormula, arrayFnResults } = processArrayFunctions(
      'CUMSUM(R1)',
      refs,
      mockTimeline
    )

    expect(processedFormula).toBe('__ARRAYFN0__')
    expect(arrayFnResults['__ARRAYFN0__']).toEqual([1, 3, 6, 10])
  })

  it('processes CUMPROD function', () => {
    const refs = { R1: [2, 2, 2, 2] }
    const { processedFormula, arrayFnResults } = processArrayFunctions(
      'CUMPROD(R1)',
      refs,
      mockTimeline
    )

    expect(processedFormula).toBe('__ARRAYFN0__')
    expect(arrayFnResults['__ARRAYFN0__']).toEqual([2, 4, 8, 16])
  })

  it('processes SHIFT function', () => {
    const refs = { R1: [10, 20, 30, 40] }
    const { processedFormula, arrayFnResults } = processArrayFunctions(
      'SHIFT(R1, 1)',
      refs,
      mockTimeline
    )

    expect(processedFormula).toBe('__ARRAYFN0__')
    expect(arrayFnResults['__ARRAYFN0__']).toEqual([0, 10, 20, 30])
  })

  it('processes CUMSUM_Y function', () => {
    const refs = { R1: [5, 5, 10, 10] }
    const { processedFormula, arrayFnResults } = processArrayFunctions(
      'CUMSUM_Y(R1)',
      refs,
      mockTimeline
    )

    expect(processedFormula).toBe('__ARRAYFN0__')
    // Year 2024: 0, Year 2025: +5
    expect(arrayFnResults['__ARRAYFN0__']).toEqual([0, 0, 5, 5])
  })

  it('processes CUMPROD_Y function', () => {
    const refs = { R1: [0.9, 0.9, 0.8, 0.8] }
    const { processedFormula, arrayFnResults } = processArrayFunctions(
      'CUMPROD_Y(R1)',
      refs,
      mockTimeline
    )

    expect(processedFormula).toBe('__ARRAYFN0__')
    expect(arrayFnResults['__ARRAYFN0__'][0]).toBe(1)
    expect(arrayFnResults['__ARRAYFN0__'][1]).toBe(1)
    expect(arrayFnResults['__ARRAYFN0__'][2]).toBeCloseTo(0.9)
    expect(arrayFnResults['__ARRAYFN0__'][3]).toBeCloseTo(0.9)
  })

  it('handles multiple array functions in one formula', () => {
    const refs = { R1: [1, 2, 3, 4], R2: [10, 10, 10, 10] }
    const { processedFormula, arrayFnResults } = processArrayFunctions(
      'CUMSUM(R1) + SHIFT(R2, 1)',
      refs,
      mockTimeline
    )

    expect(processedFormula).toBe('__ARRAYFN0__ + __ARRAYFN1__')
    expect(arrayFnResults['__ARRAYFN0__']).toEqual([1, 3, 6, 10])
    expect(arrayFnResults['__ARRAYFN1__']).toEqual([0, 10, 10, 10])
  })
})

describe('Edge Cases and Numeric Stability', () => {
  it('handles very large numbers', () => {
    const result = evalExprForAllPeriods('1000000000 * 1000000000', {}, 1)
    expect(result[0]).toBe(1e18)
  })

  it('handles very small numbers', () => {
    const refs = { R1: [0.000001, 0.000002] }
    const result = evalExprForAllPeriods('R1 * 1000000', refs, 2)
    expect(result[0]).toBeCloseTo(1)
    expect(result[1]).toBeCloseTo(2)
  })

  it('handles negative numbers', () => {
    const refs = { R1: [-10, -20, 30] }
    const result = evalExprForAllPeriods('R1 * 2', refs, 3)
    expect(result).toEqual([-20, -40, 60])
  })

  it('handles complex nested expressions', () => {
    const refs = {
      R1: [100, 100],
      R2: [0.05, 0.05],
      R3: [12, 12],
    }
    const result = evalExprForAllPeriods('R1 * R2 / R3', refs, 2)
    expect(result[0]).toBeCloseTo(0.4167, 3)
    expect(result[1]).toBeCloseTo(0.4167, 3)
  })
})
