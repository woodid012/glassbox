// Module reference verification for Glass Box model
const calcs = require('../data/model-calculations.json');

// Find all calculations that reference modules
const moduleRefs = calcs.calculations.filter(c => c.formula && c.formula.match(/M\d+\.\d+/));

console.log('=== MODULE REFERENCE USAGE ===\n');
console.log(`Found ${moduleRefs.length} calculations referencing module outputs:\n`);

moduleRefs.forEach(calc => {
  const refs = calc.formula.match(/M\d+\.\d+/g) || [];
  const uniqueRefs = [...new Set(refs)];
  console.log(`R${calc.id} (${calc.name}):`);
  console.log(`  Formula: ${calc.formula}`);
  console.log(`  Refs: ${uniqueRefs.join(', ')}`);
  console.log('');
});

console.log('=== MODULE DEFINITIONS ===\n');
calcs.modules.forEach((mod, idx) => {
  const template = calcs.moduleTemplates.find(t => t.id === mod.templateId);
  console.log(`M${idx + 1}: ${mod.name} (${mod.templateId})`);
  if (template) {
    template.outputs.forEach((out, outIdx) => {
      console.log(`  M${idx + 1}.${outIdx + 1} = ${out}`);
    });
  }
  console.log('');
});
