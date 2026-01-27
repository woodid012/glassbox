// Circular dependency checker for Glass Box model
const calcs = require('../data/model-calculations.json');

// Build dependency graph (excluding SHIFT references which break cycles)
const calcById = new Map();
const dependencies = new Map();

calcs.calculations.forEach(calc => {
  calcById.set(calc.id, calc);

  if (!calc.formula) {
    dependencies.set(calc.id, []);
    return;
  }

  // Remove SHIFT(...) patterns - these are lagged dependencies that don't create cycles
  const formulaWithoutShift = calc.formula.replace(/SHIFT\s*\([^)]+\)/gi, '');

  // Extract R references
  const rRefs = formulaWithoutShift.match(/R(\d+)/g) || [];
  const deps = [...new Set(rRefs.map(ref => parseInt(ref.substring(1))))];

  // Only include valid calculation IDs
  const validDeps = deps.filter(id => calcById.has(id));
  dependencies.set(calc.id, validDeps);
});

// Topological sort using Kahn's algorithm
const allIds = Array.from(calcById.keys());
const inDegree = new Map();
const adjList = new Map();

allIds.forEach(id => {
  inDegree.set(id, 0);
  adjList.set(id, []);
});

allIds.forEach(id => {
  const deps = dependencies.get(id) || [];
  deps.forEach(depId => {
    if (adjList.has(depId)) {
      adjList.get(depId).push(id);
      inDegree.set(id, inDegree.get(id) + 1);
    }
  });
});

const queue = [];
allIds.forEach(id => {
  if (inDegree.get(id) === 0) {
    queue.push(id);
  }
});

const sorted = [];
while (queue.length > 0) {
  const id = queue.shift();
  sorted.push(id);

  (adjList.get(id) || []).forEach(neighbor => {
    inDegree.set(neighbor, inDegree.get(neighbor) - 1);
    if (inDegree.get(neighbor) === 0) {
      queue.push(neighbor);
    }
  });
}

console.log('=== CIRCULAR DEPENDENCY CHECK ===\n');

if (sorted.length === allIds.length) {
  console.log('✓ NO CIRCULAR DEPENDENCIES DETECTED');
  console.log(`  All ${allIds.length} calculations can be evaluated in dependency order`);
} else {
  const inCycle = allIds.filter(id => !sorted.includes(id));
  console.log(`❌ CIRCULAR DEPENDENCY DETECTED`);
  console.log(`\n  ${inCycle.length} calculations are in a dependency cycle:\n`);

  inCycle.forEach(id => {
    const calc = calcById.get(id);
    const deps = dependencies.get(id) || [];
    const cyclicDeps = deps.filter(depId => inCycle.includes(depId));

    console.log(`  R${id} (${calc.name})`);
    console.log(`    Formula: ${calc.formula}`);
    console.log(`    Depends on (in cycle): ${cyclicDeps.map(d => `R${d}`).join(', ')}`);
    console.log('');
  });

  console.log('  RECOMMENDED FIX:');
  console.log('  - Use SHIFT() to break cycles by referencing prior period values');
  console.log('  - For ledger patterns, use CUMSUM gold standard (calculate Closing first)');
}

process.exit(sorted.length === allIds.length ? 0 : 1);
