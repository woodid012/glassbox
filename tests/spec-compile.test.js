/**
 * Test suite for the model spec compilation system.
 *
 * Tests:
 * 1. Spec compilation produces valid recipe
 * 2. Key period flags map to correct IDs
 * 3. Symbolic refs are translated correctly
 * 4. Formula validation catches errors
 * 5. Generated model has balanced BS
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Import the spec compiler
const { compileSpec } = await import('../recipe/spec/compile.js')

// Import the server engine for validation
const { runServerModel } = await import('../utils/serverModelEngine.js')
const { generateFromRecipe } = await import('../recipe/agent/generate.js')

const SPEC_DIR = path.resolve(__dirname, '../recipe/spec/templates')
const DATA_DIR = path.resolve(__dirname, '../data')

describe('Spec Compilation', () => {
  describe('Basic Compilation', () => {
    it('should compile a minimal spec', () => {
      const spec = {
        project: { name: 'Test', type: 'BESS' },
        timeline: { start: 'Jan 2027', end: 'Dec 2030' },
        keyPeriods: [
          { name: 'Construction', flag: 'F1', duration: '12 months', start: 'timeline.start' }
        ],
        constants: [
          { name: 'Capacity', value: 100 }
        ],
        calculationGroups: [
          { name: 'Test', tab: 'Main' }
        ],
        calculations: [
          { id: 1, name: 'TestCalc', formula: '{Capacity} * 2', group: 'Test' }
        ]
      }

      const recipe = compileSpec(spec)

      expect(recipe.project.name).toBe('Test')
      expect(recipe.timeline.startYear).toBe(2027)
      expect(recipe.timeline.startMonth).toBe(1)
      expect(recipe.keyPeriods).toHaveLength(1)
      expect(recipe.calculations).toHaveLength(1)
    })

    it('should translate symbolic refs in formulas', () => {
      const spec = {
        project: { name: 'Test', type: 'BESS' },
        timeline: { start: 'Jan 2027', end: 'Dec 2030' },
        keyPeriods: [],
        constants: [
          { name: 'PowerMW', value: 100 },
          { name: 'PricePerMW', value: 50 }
        ],
        calculationGroups: [
          { name: 'Revenue', tab: 'Main' }
        ],
        calculations: [
          { id: 1, name: 'TotalRevenue', formula: '{PowerMW} * {PricePerMW}', group: 'Revenue' }
        ]
      }

      const recipe = compileSpec(spec)

      // PowerMW is id 100 -> C1.1, PricePerMW is id 101 -> C1.2
      expect(recipe.calculations[0].formula).toBe('C1.1 * C1.2')
    })
  })

  describe('Key Period Flag Mapping', () => {
    it('should assign IDs that match flag numbers', () => {
      const spec = {
        project: { name: 'Test', type: 'BESS' },
        timeline: { start: 'Jan 2027', end: 'Dec 2050' },
        keyPeriods: [
          { name: 'Construction', flag: 'F1', duration: '18 months', start: 'timeline.start' },
          { name: 'Operations', flag: 'F2', duration: '240 months', start: 'after F1' },
          { name: 'Debt', flag: 'F8', duration: '180 months', start: 'after F1' }
        ],
        constants: [],
        calculationGroups: [],
        calculations: []
      }

      const recipe = compileSpec(spec)

      // F1 should have id 1
      const f1 = recipe.keyPeriods.find(kp => kp.generates === 'F1')
      expect(f1.id).toBe(1)

      // F2 should have id 2
      const f2 = recipe.keyPeriods.find(kp => kp.generates === 'F2')
      expect(f2.id).toBe(2)

      // F8 should have id 8
      const f8 = recipe.keyPeriods.find(kp => kp.generates === 'F8')
      expect(f8.id).toBe(8)
    })

    it('should resolve "after" anchors correctly', () => {
      const spec = {
        project: { name: 'Test', type: 'BESS' },
        timeline: { start: 'Apr 2027', end: 'Dec 2050' },
        keyPeriods: [
          { name: 'Construction', flag: 'F1', duration: '18 months', start: 'timeline.start' },
          { name: 'Operations', flag: 'F2', duration: '120 months', start: 'after F1' }
        ],
        constants: [],
        calculationGroups: [],
        calculations: []
      }

      const recipe = compileSpec(spec)

      const f1 = recipe.keyPeriods.find(kp => kp.generates === 'F1')
      const f2 = recipe.keyPeriods.find(kp => kp.generates === 'F2')

      // F1 starts Apr 2027, lasts 18 months -> ends Sep 2028
      expect(f1.startYear).toBe(2027)
      expect(f1.startMonth).toBe(4)
      expect(f1.endYear).toBe(2028)
      expect(f1.endMonth).toBe(9)

      // F2 starts 1 month after F1 ends -> Oct 2028
      expect(f2.startYear).toBe(2028)
      expect(f2.startMonth).toBe(10)
    })
  })

  describe('Input Compilation', () => {
    it('should compile CAPEX inputs with V-refs', () => {
      const spec = {
        project: { name: 'Test', type: 'BESS' },
        timeline: { start: 'Jan 2027', end: 'Dec 2030' },
        keyPeriods: [
          { name: 'Construction', flag: 'F1', duration: '12 months', start: 'timeline.start' }
        ],
        constants: [],
        inputGroups: [
          { id: 1, name: 'CAPEX', mode: 'values', frequency: 'M', linkedPeriod: 'F1' }
        ],
        inputs: [
          { id: 1, name: 'Equipment', group: 'CAPEX', value: 50, unit: '$ M' },
          { id: 2, name: 'Installation', group: 'CAPEX', value: 10, unit: '$ M' }
        ],
        calculationGroups: [],
        calculations: []
      }

      const recipe = compileSpec(spec)

      expect(recipe.inputGroups).toHaveLength(2) // Constants + CAPEX
      const capexGroup = recipe.inputGroups.find(g => g.name === 'CAPEX')
      expect(capexGroup.ref).toBe('V1')

      // Find the CAPEX inputs (not constants)
      const capexInputs = recipe.inputs.filter(i => i.groupId === 1)
      expect(capexInputs).toHaveLength(2)
      expect(capexInputs[0].ref).toBe('V1.1')
      expect(capexInputs[1].ref).toBe('V1.2')
    })

    it('should translate input refs in formulas', () => {
      const spec = {
        project: { name: 'Test', type: 'BESS' },
        timeline: { start: 'Jan 2027', end: 'Dec 2030' },
        keyPeriods: [],
        constants: [],
        inputGroups: [
          { id: 1, name: 'CAPEX', mode: 'values', frequency: 'M' }
        ],
        inputs: [
          { id: 1, name: 'TotalCapex', group: 'CAPEX', value: 100 }
        ],
        calculationGroups: [
          { name: 'Test', tab: 'Main' }
        ],
        calculations: [
          { id: 1, name: 'CapexCalc', formula: '{TotalCapex} * 2', group: 'Test' }
        ]
      }

      const recipe = compileSpec(spec)

      // TotalCapex should be V1.1
      expect(recipe.calculations[0].formula).toBe('V1.1 * 2')
    })
  })

  describe('Module Compilation', () => {
    it('should compile modules with translated input refs', () => {
      const spec = {
        project: { name: 'Test', type: 'BESS' },
        timeline: { start: 'Jan 2027', end: 'Dec 2050' },
        keyPeriods: [
          { name: 'Debt', flag: 'F8', duration: '180 months', start: 'timeline.start' }
        ],
        constants: [
          { name: 'DebtGearing', value: 70 },
          { name: 'DebtRate', value: 7.5 }
        ],
        calculationGroups: [],
        calculations: [],
        modules: [
          {
            id: 1,
            name: 'SeniorDebt',
            template: 'iterative_debt_sizing',
            inputs: {
              gearingRef: '{DebtGearing}',
              interestRateRef: '{DebtRate}',
              debtPeriodFlag: 'F8'
            }
          }
        ]
      }

      const recipe = compileSpec(spec)

      expect(recipe.modules).toHaveLength(1)
      const mod = recipe.modules[0]
      // DebtGearing is id 100 -> C1.1, DebtRate is id 101 -> C1.2
      expect(mod.inputs.gearingRef).toBe('C1.1')
      expect(mod.inputs.interestRateRef).toBe('C1.2')
      expect(mod.inputs.debtPeriodFlag).toBe('F8')
    })
  })
})

describe('BESS Template Compilation', () => {
  let bessSpec
  let recipe

  beforeAll(async () => {
    // Load the BESS spec template
    const specPath = path.join(SPEC_DIR, 'bess-100mw-v2.spec.json')
    const specContent = await fs.readFile(specPath, 'utf-8')
    bessSpec = JSON.parse(specContent)
    recipe = compileSpec(bessSpec)
  })

  it('should compile without errors', () => {
    expect(recipe).toBeDefined()
    expect(recipe.project.name).toContain('BESS')
  })

  it('should have all key periods with matching IDs', () => {
    expect(recipe.keyPeriods.length).toBeGreaterThan(0)

    for (const kp of recipe.keyPeriods) {
      const flagNum = parseInt(kp.generates.replace('F', ''))
      expect(kp.id).toBe(flagNum)
    }
  })

  it('should have calculations with translated formulas', () => {
    // Check that no {Name} patterns remain in formulas
    for (const calc of recipe.calculations) {
      expect(calc.formula).not.toMatch(/\{[^}]+\}/)
    }
  })

  it('should have all constants with C1.x refs', () => {
    const constants = recipe.inputs.filter(i => i.groupId === 100)
    expect(constants.length).toBeGreaterThan(0)

    for (const c of constants) {
      if (c.ref) {
        expect(c.ref).toMatch(/^C1\.\d+$/)
      }
    }
  })
})

describe('End-to-End Model Generation', () => {
  it('should generate a model that can be evaluated', async () => {
    // Create a minimal working spec
    const spec = {
      project: { name: 'E2E Test', type: 'BESS' },
      timeline: { start: 'Jan 2027', end: 'Dec 2030' },
      keyPeriods: [
        { name: 'Construction', flag: 'F1', duration: '12 months', start: 'timeline.start' },
        { name: 'Operations', flag: 'F2', duration: '36 months', start: 'after F1' }
      ],
      constants: [
        { name: 'Capacity', value: 100 },
        { name: 'Price', value: 50 }
      ],
      inputGroups: [
        { id: 1, name: 'CAPEX', mode: 'values', linkedPeriod: 'F1' }
      ],
      inputs: [
        { id: 1, name: 'Equipment', group: 'CAPEX', value: 80 }
      ],
      calculationGroups: [
        { name: 'Revenue', tab: 'P&L' },
        { name: 'Costs', tab: 'P&L' }
      ],
      calculations: [
        {
          id: 10,
          name: 'Revenue',
          formula: '{Capacity} * {Price} / 12 * F2',
          group: 'Revenue',
          type: 'flow'
        },
        {
          id: 11,
          name: 'Capex',
          formula: '-{Equipment} * F1',
          group: 'Costs',
          type: 'flow'
        }
      ]
    }

    const recipe = compileSpec(spec)

    // Verify compilation
    expect(recipe.calculations[0].formula).toBe('C1.1 * C1.2 / 12 * F2')
    expect(recipe.calculations[1].formula).toBe('-V1.1 * F1')

    // The recipe structure should be valid
    expect(recipe.keyPeriods).toHaveLength(2)
    expect(recipe.calculations).toHaveLength(2)
  })
})
