const { readFileSync } = require('fs');
const { runServerModel } = require('./utils/serverModelEngine.js');

// Load data
const calcData = JSON.parse(readFileSync('./data/model-calculations.json', 'utf-8'));
const inputs = JSON.parse(readFileSync('./data/model-inputs.json', 'utf-8'));
const modulesData = JSON.parse(readFileSync('./data/model-modules.json', 'utf-8'));

// Merge modules
if (modulesData.moduleGroups?.length) {
    calcData.calculationsGroups = [...(calcData.calculationsGroups || []), ...modulesData.moduleGroups];
}
if (modulesData.moduleCalculations?.length) {
    calcData.calculations = [...(calcData.calculations || []), ...modulesData.moduleCalculations];
}
if (modulesData.modules !== undefined) calcData.modules = modulesData.modules;
if (modulesData._mRefMap !== undefined) calcData._mRefMap = modulesData._mRefMap;

// Run model
const results = runServerModel(inputs, calcData);

// Check key B/S components at period 19
const p = 18; // Period 19 (0-indexed)

console.log('Period 19 Balance Sheet Components:');
console.log('R187 Total Assets:', results.R187?.[p]);
console.log('R194 Total L+E:', results.R194?.[p]);
console.log('R195 Balance Check:', results.R195?.[p]);
console.log('');
console.log('Asset Breakdown:');
console.log('R182 Cash:', results.R182?.[p]);
console.log('R196 WIP:', results.R196?.[p]);
console.log('R183 PP&E:', results.R183?.[p]);
console.log('R184 Receivables:', results.R184?.[p]);
console.log('R185 GST Recv:', results.R185?.[p]);
console.log('R186 MRA:', results.R186?.[p]);
console.log('R230 IDC+Fees NBV:', results.R230?.[p]);
console.log('R231 Upfront NBV:', results.R231?.[p]);
console.log('R232 Maint NBV:', results.R232?.[p]);
console.log('');
console.log('Liability + Equity:');
console.log('R198 Cons Debt:', results.R198?.[p]);
console.log('R188 Ops Debt:', results.R188?.[p]);
console.log('R189 Payables:', results.R189?.[p]);
console.log('R191 Share Cap:', results.R191?.[p]);
console.log('R192 RE:', results.R192?.[p]);

// Check negative cash progression
console.log('\nCash progression around negative period:');
for (let i = 15; i <= 22; i++) {
    console.log(`Period ${i + 1}: R42=${results.R42?.[i]?.toFixed(4)}, R40=${results.R40?.[i]?.toFixed(4)}`);
}
