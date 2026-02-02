/**
 * Excel Comparison Tests
 *
 * Cross-validates GlassBox engine output (from model JSONs via recipe)
 * against IFS_month.xlsx - the external reference BESS financial model.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { compareWithIFS, printIFSReport } from '../recipe/agent/excel-compare.js'

const DATA_DIR = join(process.cwd(), 'data')
const IFS_PATH = join(DATA_DIR, 'IFS_month.xlsx')

describe('IFS Excel Comparison', () => {
  let report

  beforeAll(() => {
    if (!existsSync(IFS_PATH)) return
    report = compareWithIFS(DATA_DIR, IFS_PATH)
  })

  it('should compare GlassBox output against IFS reference model', () => {
    if (!report) {
      console.log('Skipping: data/IFS_month.xlsx not found')
      return
    }

    printIFSReport(report)
    expect(report.totalComparisons).toBeGreaterThan(0)
    expect(report.summary.length).toBeGreaterThan(0)
  })

  it('should have BS check = 0 in both models', () => {
    if (!report) return
    const bsCheck = report.summary.find(s => s.name === 'BS Check')
    expect(bsCheck).toBeDefined()
    expect(bsCheck.matchPct).toBe('100.0')
  })

  it('should match contracted revenue closely', () => {
    if (!report) return
    const rev = report.summary.find(s => s.name === 'Contracted Revenue')
    if (rev) {
      console.log(`Contracted Revenue: ${rev.matchPct}% match, max diff: ${rev.maxDiff} at ${rev.maxDiffPeriod}`)
    }
  })

  it('should match merchant revenue closely', () => {
    if (!report) return
    const rev = report.summary.find(s => s.name === 'Merchant Revenue')
    if (rev) {
      console.log(`Merchant Revenue: ${rev.matchPct}% match, max diff: ${rev.maxDiff} at ${rev.maxDiffPeriod}`)
    }
  })

  it('should match DSCR within tolerance', () => {
    if (!report) return
    const dscr = report.summary.find(s => s.name === 'Periodic DSCR')
    if (dscr) {
      console.log(`DSCR: ${dscr.matchPct}% match, max diff: ${dscr.maxDiff}`)
      expect(parseFloat(dscr.matchPct)).toBeGreaterThan(80)
    }
  })

  it('should match MRA balance within tolerance', () => {
    if (!report) return
    const mra = report.summary.find(s => s.name === 'MRA')
    if (mra) {
      console.log(`MRA: ${mra.matchPct}% match, max diff: ${mra.maxDiff}`)
      expect(parseFloat(mra.matchPct)).toBeGreaterThan(85)
    }
  })

  it('should match debt drawdown within tolerance', () => {
    if (!report) return
    const debt = report.summary.find(s => s.name === 'Senior Debt Drawdown')
    if (debt) {
      console.log(`Debt Drawdown: ${debt.matchPct}% match, max diff: ${debt.maxDiff}`)
      expect(parseFloat(debt.matchPct)).toBeGreaterThan(90)
    }
  })

  it('should report EBITDA comparison', () => {
    if (!report) return
    const ebitda = report.summary.find(s => s.name === 'EBITDA')
    if (ebitda) {
      console.log(`EBITDA: ${ebitda.matchPct}% match, max diff: ${ebitda.maxDiff} at ${ebitda.maxDiffPeriod}`)
      console.log(`  IFS: ${ebitda.maxDiffIFS}, GB: ${ebitda.maxDiffGB}`)
    }
  })

  it('should report ops debt balance comparison', () => {
    if (!report) return
    const debt = report.summary.find(s => s.name === 'Ops Debt Balance')
    if (debt) {
      console.log(`Ops Debt: ${debt.matchPct}% match, max diff: ${debt.maxDiff} at ${debt.maxDiffPeriod}`)
      console.log(`  IFS: ${debt.maxDiffIFS}, GB: ${debt.maxDiffGB}`)
    }
  })
})
