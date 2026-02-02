import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { runServerModel } from '../utils/serverModelEngine.js';

// Helper to read JSON files
async function readJsonFile(filePath) {
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

// Helper to merge module data into calculations
function mergeCalcsAndModules(calcs, modulesData) {
  if (!calcs || !modulesData) return calcs;

  const merged = { ...calcs };

  if (modulesData.moduleGroups?.length) {
    merged.calculationsGroups = [
      ...(merged.calculationsGroups || []),
      ...modulesData.moduleGroups
    ];
  }

  if (modulesData.moduleCalculations?.length) {
    merged.calculations = [
      ...(merged.calculations || []),
      ...modulesData.moduleCalculations
    ];
  }

  if (modulesData.modules !== undefined) {
    merged.modules = modulesData.modules;
  }

  if (modulesData._mRefMap !== undefined) {
    merged._mRefMap = modulesData._mRefMap;
  }

  return merged;
}

describe('MRA/Maintenance IRR Impact Diagnostic', () => {
  it('should compare model metrics before and after MRA changes', async () => {
    const dataDir = path.join(process.cwd(), 'data');

    // Load CURRENT (working) data
    const [currentInputs, currentCalcs, currentModules] = await Promise.all([
      readJsonFile(path.join(dataDir, 'model-inputs.json')),
      readJsonFile(path.join(dataDir, 'model-calculations.json')),
      readJsonFile(path.join(dataDir, 'model-modules.json'))
    ]);

    const currentCalculations = mergeCalcsAndModules(currentCalcs, currentModules);
    const currentResults = runServerModel(currentInputs, currentCalculations);

    // Load OLD (HEAD) data from git
    const oldCalcsJSON = execSync('git show HEAD:data/model-calculations.json', { encoding: 'utf8' });
    const oldModulesJSON = execSync('git show HEAD:data/model-modules.json', { encoding: 'utf8' });
    const oldInputsJSON = execSync('git show HEAD:data/model-inputs.json', { encoding: 'utf8' });

    const oldInputs = JSON.parse(oldInputsJSON);
    const oldCalcs = JSON.parse(oldCalcsJSON);
    const oldModules = JSON.parse(oldModulesJSON);

    const oldCalculations = mergeCalcsAndModules(oldCalcs, oldModules);
    const oldResults = runServerModel(oldInputs, oldCalculations);

    console.log('\n=== MODEL COMPARISON: OLD vs CURRENT ===\n');

    // Check basic model structure
    // Extract flags from referenceMap (server engine stores them there, not in flagResults)
    const extractFlags = (refMap) => {
      const flags = {};
      for (const [key, value] of Object.entries(refMap || {})) {
        if (key.startsWith('F') && !key.includes('.')) {
          flags[key] = value;
        }
      }
      return flags;
    };

    const currentFlags = extractFlags(currentResults.referenceMap);
    const oldFlags = extractFlags(oldResults.referenceMap);

    console.log('CURRENT MODEL STRUCTURE:');
    console.log(`  Timeline periods: ${currentResults.timeline?.periods || 'MISSING'}`);
    console.log(`  Key periods defined: ${currentInputs.keyPeriods?.length || 0}`);
    console.log(`  Calculations count: ${Object.keys(currentResults.calculationResults || {}).length}`);
    console.log(`  Flag results: ${Object.keys(currentFlags).length}`);

    console.log('\nOLD MODEL STRUCTURE:');
    console.log(`  Timeline periods: ${oldResults.timeline?.periods || 'MISSING'}`);
    console.log(`  Key periods defined: ${oldInputs.keyPeriods?.length || 0}`);
    console.log(`  Calculations count: ${Object.keys(oldResults.calculationResults || {}).length}`);
    console.log(`  Flag results: ${Object.keys(oldFlags).length}`);

    // Check F12 specifically
    const currentF12 = currentResults.referenceMap?.F12 || [];
    const oldF12 = oldResults.referenceMap?.F12 || [];
    console.log(`\nF12 flag check:`);
    console.log(`  OLD F12: length=${oldF12.length}, active periods=${oldF12.filter(f => f > 0).length}`);
    console.log(`  CURRENT F12: length=${currentF12.length}, active periods=${currentF12.filter(f => f > 0).length}`);

    // Find F12 key period definition
    const currentKP12 = currentInputs.keyPeriods?.find(kp => kp.id === 12);
    const oldKP12 = oldInputs.keyPeriods?.find(kp => kp.id === 12);
    console.log(`  OLD KP12: ${oldKP12 ? JSON.stringify(oldKP12) : 'NOT FOUND'}`);
    console.log(`  CURRENT KP12: ${currentKP12 ? JSON.stringify(currentKP12) : 'NOT FOUND'}`);

    console.log('\n');

    // 1. Compare key metrics
    const getR = (results, id) => results.calculationResults?.[`R${id}`] || [];
    const getSum = (arr) => arr.reduce((sum, v) => sum + (v || 0), 0);
    const getMin = (arr) => Math.min(...arr.filter(v => v !== null && v !== undefined && !isNaN(v)));

    const oldEquityIRR = getR(oldResults, 130)[0] || 0;
    const currentEquityIRR = getR(currentResults, 130)[0] || 0;
    const oldProjectIRR = getR(oldResults, 129)[0] || 0;
    const currentProjectIRR = getR(currentResults, 129)[0] || 0;
    const oldDSCRmin = getMin(getR(oldResults, 118).filter((v, i) => i >= 18)); // Operations only
    const currentDSCRmin = getMin(getR(currentResults, 118).filter((v, i) => i >= 18));
    const oldDebt18 = getR(oldResults, 188)[18] || 0;
    const currentDebt18 = getR(currentResults, 188)[18] || 0;

    const oldCFADS = getR(oldResults, 115);
    const currentCFADS = getR(currentResults, 115);
    const oldCFADSsum = getSum(oldCFADS);
    const currentCFADSsum = getSum(currentCFADS);

    console.log('KEY METRICS:');
    console.log(`Equity IRR (R130):      ${(oldEquityIRR * 100).toFixed(2)}% → ${(currentEquityIRR * 100).toFixed(2)}%  (Δ ${((currentEquityIRR - oldEquityIRR) * 100).toFixed(2)}%)`);
    console.log(`Project IRR (R129):     ${(oldProjectIRR * 100).toFixed(2)}% → ${(currentProjectIRR * 100).toFixed(2)}%  (Δ ${((currentProjectIRR - oldProjectIRR) * 100).toFixed(2)}%)`);
    console.log(`DSCR Min (R118):        ${oldDSCRmin.toFixed(3)}x → ${currentDSCRmin.toFixed(3)}x  (Δ ${(currentDSCRmin - oldDSCRmin).toFixed(3)}x)`);
    console.log(`Debt @ p18 (R188):      $${oldDebt18.toFixed(2)}M → $${currentDebt18.toFixed(2)}M  (Δ $${(currentDebt18 - oldDebt18).toFixed(2)}M)`);
    console.log(`CFADS Total (R115):     $${oldCFADSsum.toFixed(2)}M → $${currentCFADSsum.toFixed(2)}M  (Δ $${(currentCFADSsum - oldCFADSsum).toFixed(2)}M)`);

    // 2. Compare MRA Drawdown vs Maintenance Capex during F12
    console.log('\n=== MRA DRAWDOWN vs MAINTENANCE CAPEX (F12 periods) ===\n');

    const oldMRA = getR(oldResults, 149);
    const currentMRA = getR(currentResults, 149);
    const currentMaintCapex = getR(currentResults, 250);

    // Get F12 flag to identify relevant periods
    const F12 = currentResults.referenceMap?.F12 || [];

    console.log('Period | F12 | OLD MRA | CURRENT MRA | Maint Capex | Net CF Impact');
    console.log('-------|-----|---------|-------------|-------------|---------------');

    let totalOldMRA = 0;
    let totalCurrentMRA = 0;
    let totalMaintCapex = 0;

    F12.forEach((flag, i) => {
      if (flag > 0) {
        const oldM = oldMRA[i] || 0;
        const curM = currentMRA[i] || 0;
        const capex = currentMaintCapex[i] || 0;
        const netImpact = curM + capex; // capex is negative, MRA is positive

        totalOldMRA += oldM;
        totalCurrentMRA += curM;
        totalMaintCapex += capex;

        console.log(`  ${i.toString().padStart(3)}  |  ${flag.toFixed(0)}  | ${oldM.toFixed(3).padStart(7)} | ${curM.toFixed(3).padStart(11)} | ${capex.toFixed(3).padStart(11)} | ${netImpact.toFixed(3).padStart(13)}`);
      }
    });

    const totalNet = totalCurrentMRA + totalMaintCapex;
    console.log('-------|-----|---------|-------------|-------------|---------------');
    console.log(`TOTAL  |     | ${totalOldMRA.toFixed(3).padStart(7)} | ${totalCurrentMRA.toFixed(3).padStart(11)} | ${totalMaintCapex.toFixed(3).padStart(11)} | ${totalNet.toFixed(3).padStart(13)}`);

    console.log(`\nMRA Drawdown Change: $${(totalCurrentMRA - totalOldMRA).toFixed(3)}M`);
    console.log(`Net CF Impact should be ~0 if MRA fully funds maintenance: $${totalNet.toFixed(3)}M`);

    // 3. Compare Investing CF (R28)
    console.log('\n=== INVESTING CF (R28) COMPARISON ===\n');

    const oldR28 = getR(oldResults, 28);
    const currentR28 = getR(currentResults, 28);

    console.log('Period | F12 | OLD R28 | CURRENT R28 | Delta');
    console.log('-------|-----|---------|-------------|-------');

    let totalOldR28 = 0;
    let totalCurrentR28 = 0;

    F12.forEach((flag, i) => {
      if (flag > 0) {
        const oldVal = oldR28[i] || 0;
        const curVal = currentR28[i] || 0;
        const delta = curVal - oldVal;

        totalOldR28 += oldVal;
        totalCurrentR28 += curVal;

        console.log(`  ${i.toString().padStart(3)}  |  ${flag.toFixed(0)}  | ${oldVal.toFixed(3).padStart(7)} | ${curVal.toFixed(3).padStart(11)} | ${delta.toFixed(3).padStart(5)}`);
      }
    });

    console.log('-------|-----|---------|-------------|-------');
    console.log(`TOTAL  |     | ${totalOldR28.toFixed(3).padStart(7)} | ${totalCurrentR28.toFixed(3).padStart(11)} | ${(totalCurrentR28 - totalOldR28).toFixed(3).padStart(5)}`);

    // 4. Check if S2 * I2 * F12 equals old formula S1.19 * I2 * T.MiQ * T.QE * F12
    console.log('\n=== FORMULA COMPARISON: S2*I2*F12 vs S1.19*I2*T.MiQ*T.QE*F12 ===\n');

    const S2 = currentResults.referenceMap?.S2 || [];
    const oldS119 = oldResults.referenceMap?.['S1.19'] || [];
    const I2 = currentResults.referenceMap?.I2 || [];
    const TQE = currentResults.referenceMap?.['T.QE'] || [];
    const TMiQ = 3; // Months in Quarter

    console.log('Period | F12 | S2*I2*F12 | S1.19*I2*3*QE*F12 | Match?');
    console.log('-------|-----|-----------|-------------------|-------');

    F12.forEach((flag, i) => {
      if (flag > 0) {
        const newFormula = (S2[i] || 0) * (I2[i] || 1) * flag;
        const oldFormula = (oldS119[i] || 0) * (I2[i] || 1) * TMiQ * (TQE[i] || 0) * flag;
        const match = Math.abs(newFormula - oldFormula) < 0.001 ? '✓' : '✗';

        console.log(`  ${i.toString().padStart(3)}  |  ${flag.toFixed(0)}  | ${newFormula.toFixed(3).padStart(9)} | ${oldFormula.toFixed(3).padStart(17)} | ${match.padStart(5)}`);
      }
    });

    // 5. Compare CFADS period-by-period during F12
    console.log('\n=== CFADS (R115) PERIOD COMPARISON (F12) ===\n');

    console.log('Period | F12 | OLD CFADS | CURRENT CFADS | Delta');
    console.log('-------|-----|-----------|---------------|-------');

    F12.forEach((flag, i) => {
      if (flag > 0) {
        const oldVal = oldCFADS[i] || 0;
        const curVal = currentCFADS[i] || 0;
        const delta = curVal - oldVal;

        console.log(`  ${i.toString().padStart(3)}  |  ${flag.toFixed(0)}  | ${oldVal.toFixed(3).padStart(9)} | ${curVal.toFixed(3).padStart(13)} | ${delta.toFixed(3).padStart(5)}`);
      }
    });

    // Summary
    console.log('\n=== SUMMARY ===\n');
    console.log(`Total MRA Drawdown changed by: $${(totalCurrentMRA - totalOldMRA).toFixed(3)}M`);
    console.log(`Total Maintenance Capex added: $${totalMaintCapex.toFixed(3)}M`);
    console.log(`Net CF impact from MRA+Capex: $${totalNet.toFixed(3)}M`);
    console.log(`Investing CF changed by: $${(totalCurrentR28 - totalOldR28).toFixed(3)}M`);
    console.log(`CFADS changed by: $${(currentCFADSsum - oldCFADSsum).toFixed(3)}M`);
    console.log(`Equity IRR changed by: ${((currentEquityIRR - oldEquityIRR) * 100).toFixed(2)}%`);

    if (Math.abs(totalNet) > 0.1) {
      console.log('\n⚠️  WARNING: MRA drawdown does NOT fully offset maintenance capex!');
      console.log(`   Expected net ~0, got $${totalNet.toFixed(3)}M`);
    }

    if (Math.abs(currentCFADSsum - oldCFADSsum) > 0.1) {
      console.log('\n⚠️  WARNING: CFADS has changed, which explains debt sizing change!');
      console.log(`   CFADS decreased by $${(oldCFADSsum - currentCFADSsum).toFixed(3)}M`);
    }

    // Don't fail the test, just report findings
    expect(true).toBe(true);
  });
});
