// Formula validation script for Glass Box model
const calcs = require('../data/model-calculations.json');
const inputs = require('../data/model-inputs.json');

// Build reference maps
const calcIds = new Set(calcs.calculations.map(c => c.id));
const keyPeriodIds = new Set(inputs.keyPeriods.map(kp => kp.id));
const indexIds = new Set(inputs.indices.map(idx => idx.id));
const constantIds = new Set(inputs.inputGlass.filter(i => i.groupId === 100).map(c => c.id));
const moduleCount = calcs.modules.length;

// Get module output counts
const moduleOutputCounts = calcs.modules.map((mod, idx) => {
  const template = calcs.moduleTemplates.find(t => t.id === mod.templateId);
  return { idx: idx + 1, count: template ? template.outputs.length : 0 };
});

console.log('=== Validation Setup ===');
console.log('Total calculations:', calcs.calculations.length);
console.log('Valid calculation IDs:', Array.from(calcIds).sort((a,b)=>a-b).join(', '));
console.log('Valid flag IDs:', Array.from(keyPeriodIds).sort((a,b)=>a-b).join(', '));
console.log('Valid index IDs:', Array.from(indexIds).sort((a,b)=>a-b).join(', '));
console.log('Module count:', moduleCount);
console.log('');

const errors = [];
const warnings = [];

// Validate each calculation
calcs.calculations.forEach(calc => {
  if (!calc.formula || calc.formula.trim() === '') return;
  const formula = calc.formula;

  // Check R references (calculations)
  const rRefs = formula.match(/R\d+/g) || [];
  rRefs.forEach(ref => {
    const id = parseInt(ref.substring(1));
    if (!calcIds.has(id)) {
      errors.push(`R${calc.id} (${calc.name}): References non-existent calculation '${ref}'`);
    }
  });

  // Check F references (flags/key periods)
  const fRefs = formula.match(/F\d+(?:\.(?:Start|End))?/g) || [];
  fRefs.forEach(ref => {
    const baseRef = ref.split('.')[0];
    const id = parseInt(baseRef.substring(1));
    if (!keyPeriodIds.has(id)) {
      errors.push(`R${calc.id} (${calc.name}): References non-existent flag '${ref}' (keyPeriod id=${id})`);
    }
  });

  // Check I references (indexations)
  const iRefs = formula.match(/I\d+/g) || [];
  iRefs.forEach(ref => {
    const id = parseInt(ref.substring(1));
    if (!indexIds.has(id)) {
      errors.push(`R${calc.id} (${calc.name}): References non-existent indexation '${ref}'`);
    }
  });

  // Check C1 references (constants)
  const c1Refs = formula.match(/C1\.\d+/g) || [];
  c1Refs.forEach(ref => {
    const refNum = parseInt(ref.substring(3));
    const id = refNum + 99;
    if (!constantIds.has(id)) {
      errors.push(`R${calc.id} (${calc.name}): References non-existent constant '${ref}' (would be id=${id})`);
    }
  });

  // Check M references (module outputs)
  const mRefs = formula.match(/M\d+\.\d+/g) || [];
  mRefs.forEach(ref => {
    const parts = ref.substring(1).split('.');
    const modNum = parseInt(parts[0]);
    const outNum = parseInt(parts[1]);

    if (modNum > moduleCount) {
      errors.push(`R${calc.id} (${calc.name}): References module '${ref}' but only ${moduleCount} modules exist`);
    } else {
      const modInfo = moduleOutputCounts[modNum - 1];
      if (modInfo && outNum > modInfo.count) {
        errors.push(`R${calc.id} (${calc.name}): References '${ref}' but module ${modNum} only has ${modInfo.count} outputs`);
      }
    }
  });

  // Check for hardcoded business constants (potential issues)
  const hardcodedNums = formula.match(/\b\d+\.?\d*\b/g) || [];
  const acceptableNums = ['0', '1', '2', '3', '10', '100', '1000', '12', '24', '30', '365', '366', '8760', '8784', '0.0001'];
  const suspiciousNums = hardcodedNums.filter(n => {
    // Allow numbers in power expressions (10^6)
    if (formula.includes(`${n}^`) || formula.includes(`^${n}`)) return false;
    // Allow /100 for percentage conversion
    if (formula.includes(`/ ${n}`) && n === '100') return false;
    if (formula.includes(`/${n}`) && n === '100') return false;
    // Allow small numbers and common constants
    if (acceptableNums.includes(n)) return false;
    // Allow numbers in SHIFT/CUMSUM/etc
    if (formula.match(new RegExp(`(SHIFT|CUMSUM|CUMPROD|COUNT)\\([^)]*${n}[^)]*\\)`))) return false;
    return true;
  });

  if (suspiciousNums.length > 0) {
    warnings.push(`R${calc.id} (${calc.name}): Contains hardcoded numbers ${[...new Set(suspiciousNums)].join(', ')} - consider using constants`);
  }
});

// Report results
console.log('=== VALIDATION RESULTS ===\n');

if (errors.length === 0 && warnings.length === 0) {
  console.log('✓ ALL CHECKS PASSED');
  console.log('  - All references are valid');
  console.log('  - No hardcoded business constants detected');
} else {
  if (errors.length > 0) {
    console.log(`❌ ERRORS (${errors.length}):\n`);
    errors.forEach(e => console.log('  ' + e));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`⚠  WARNINGS (${warnings.length}):\n`);
    warnings.forEach(w => console.log('  ' + w));
  }
}

process.exit(errors.length > 0 ? 1 : 0);
