/**
 * Benchmark script for unified calculation
 * Mimics what useUnifiedCalculation does to measure real performance
 */

const fs = require('fs');
const path = require('path');

// Load model data
const calcDataPath = path.join(__dirname, '../data/model-calculations.json');
const inputDataPath = path.join(__dirname, '../data/model-inputs.json');

const calcData = JSON.parse(fs.readFileSync(calcDataPath, 'utf8'));
const inputData = JSON.parse(fs.readFileSync(inputDataPath, 'utf8'));

const calculations = calcData.calculations || [];
const modules = calcData.modules || [];

// Calculate periods
const config = inputData.config || {};
const startYear = config.startYear || 2024;
const startMonth = config.startMonth || 1;
const endYear = config.endYear || 2050;
const endMonth = config.endMonth || 12;
const periods = (endYear - startYear) * 12 + (endMonth - startMonth + 1);

console.log('=== Unified Calculation Benchmark ===\n');
console.log(`Model: ${calculations.length} calculations, ${modules.length} modules, ${periods} periods\n`);

// Extract dependencies from formula
function extractDependencies(formula) {
    if (!formula) return [];
    const formulaWithoutShift = formula.replace(/SHIFT\s*\([^)]+\)/gi, '');
    const deps = new Set();

    // R-refs
    let match;
    const rPattern = /\bR(\d+)(?!\d)/g;
    while ((match = rPattern.exec(formulaWithoutShift)) !== null) {
        deps.add(`R${match[1]}`);
    }

    // M-refs (convert M1.3 to M1)
    const mPattern = /\bM(\d+)\.(\d+)/g;
    while ((match = mPattern.exec(formulaWithoutShift)) !== null) {
        deps.add(`M${match[1]}`);
    }

    return [...deps];
}

// Extract module dependencies
function extractModuleDependencies(module, moduleIdx, allModulesCount) {
    const deps = new Set();
    const inputs = module.inputs || {};

    Object.values(inputs).forEach(value => {
        if (typeof value === 'string') {
            let match;
            const rPattern = /\bR(\d+)(?!\d)/g;
            while ((match = rPattern.exec(value)) !== null) {
                deps.add(`R${match[1]}`);
            }

            const mPattern = /\bM(\d+)\.(\d+)/g;
            while ((match = mPattern.exec(value)) !== null) {
                const depModuleNum = parseInt(match[1], 10);
                const depModuleIdx = depModuleNum - 1;
                if (depModuleIdx !== moduleIdx && depModuleIdx >= 0 && depModuleIdx < allModulesCount) {
                    deps.add(`M${depModuleNum}`);
                }
            }
        }
    });

    return [...deps];
}

// Build unified graph
function buildUnifiedGraph(calculations, modules) {
    const graph = new Map();

    calculations.forEach(calc => {
        const nodeId = `R${calc.id}`;
        const deps = extractDependencies(calc.formula);
        graph.set(nodeId, { type: 'calc', deps: new Set(deps), item: calc });
    });

    modules.forEach((mod, idx) => {
        const nodeId = `M${idx + 1}`;
        const deps = extractModuleDependencies(mod, idx, modules.length);
        graph.set(nodeId, { type: 'module', deps: new Set(deps), item: mod, index: idx });
    });

    // Filter invalid deps
    graph.forEach(node => {
        const validDeps = new Set();
        node.deps.forEach(dep => {
            if (graph.has(dep)) validDeps.add(dep);
        });
        node.deps = validDeps;
    });

    return graph;
}

// Topological sort
function topologicalSort(graph) {
    const sorted = [];
    const inDegree = new Map();
    const dependentsOf = new Map();

    graph.forEach((_, nodeId) => {
        inDegree.set(nodeId, 0);
        dependentsOf.set(nodeId, new Set());
    });

    graph.forEach((node, nodeId) => {
        node.deps.forEach(dep => {
            if (graph.has(dep)) {
                inDegree.set(nodeId, inDegree.get(nodeId) + 1);
                dependentsOf.get(dep).add(nodeId);
            }
        });
    });

    const queue = [];
    graph.forEach((_, nodeId) => {
        if (inDegree.get(nodeId) === 0) queue.push(nodeId);
    });

    while (queue.length > 0) {
        const nodeId = queue.shift();
        sorted.push(nodeId);

        dependentsOf.get(nodeId).forEach(dependent => {
            const newDegree = inDegree.get(dependent) - 1;
            inDegree.set(dependent, newDegree);
            if (newDegree === 0) queue.push(dependent);
        });
    }

    if (sorted.length !== graph.size) {
        const inCycle = [];
        graph.forEach((_, nodeId) => {
            if (!sorted.includes(nodeId)) inCycle.push(nodeId);
        });
        console.log('  Circular deps:', inCycle.join(', '));
        inCycle.forEach(nodeId => sorted.push(nodeId));
    }

    return sorted;
}

// Simulate formula evaluation (simplified)
function simulateFormulaEval(formula, periods) {
    // Just allocate and fill array to simulate the work
    const result = new Array(periods).fill(0);
    for (let i = 0; i < periods; i++) {
        // Simulate some computation
        result[i] = Math.random() * 100;
    }
    return result;
}

// Run benchmark
console.log('Building dependency graph...');
const graphStart = performance.now();
const graph = buildUnifiedGraph(calculations, modules);
const graphTime = performance.now() - graphStart;
console.log(`  Graph built in ${graphTime.toFixed(1)}ms (${graph.size} nodes)\n`);

console.log('Topological sort...');
const sortStart = performance.now();
const sorted = topologicalSort(graph);
const sortTime = performance.now() - sortStart;
console.log(`  Sorted in ${sortTime.toFixed(1)}ms\n`);

// Show evaluation order (first 20)
console.log('Evaluation order (first 20):');
console.log('  ' + sorted.slice(0, 20).join(' → '));
if (sorted.length > 20) console.log('  ... and ' + (sorted.length - 20) + ' more\n');
else console.log('');

// Simulate evaluation
console.log('Simulating evaluation...');
const evalStart = performance.now();
const results = {};
let calcCount = 0, moduleCount = 0;

for (const nodeId of sorted) {
    const node = graph.get(nodeId);
    if (node.type === 'calc') {
        results[nodeId] = simulateFormulaEval(node.item.formula, periods);
        calcCount++;
    } else {
        // Simulate module (more outputs)
        for (let i = 1; i <= 7; i++) {
            results[`${nodeId}.${i}`] = simulateFormulaEval('', periods);
        }
        moduleCount++;
    }
}
const evalTime = performance.now() - evalStart;

console.log(`  Evaluated ${calcCount} calculations and ${moduleCount} modules in ${evalTime.toFixed(0)}ms\n`);

// Total time
const totalTime = graphTime + sortTime + evalTime;
console.log('=== TOTAL TIME: ' + totalTime.toFixed(0) + 'ms ===\n');

if (totalTime < 100) {
    console.log('✓ Fast enough for auto-calc! (< 100ms)');
} else if (totalTime < 200) {
    console.log('✓ Good for auto-calc with 300ms debounce');
} else if (totalTime < 500) {
    console.log('⚠ Consider 500ms debounce for auto-calc');
} else {
    console.log('⚠ May want to keep manual Calculate button');
}
