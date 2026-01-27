
import { evaluateSafeExpression } from '../utils/formulaEvaluator.js';

// Mock Data
const PERIODS = 24;
const CAPEX_AMOUNT = 1000;
const USEFUL_LIFE_YEARS = 10;
const MONTHS_IN_YEAR = 12;

// Arrays
const V1 = new Array(PERIODS).fill(0);
V1[2] = CAPEX_AMOUNT; // Capex at month 2

const F2 = new Array(PERIODS).fill(0);
F2.fill(1, 4); // Ops start at month 4

const F2_Start = new Array(PERIODS).fill(0);
F2_Start[4] = 1; // Ops start trigger

const C1_24 = USEFUL_LIFE_YEARS;
const T_MiY = MONTHS_IN_YEAR;

// Results
const R80 = new Array(PERIODS).fill(0); // Opening
const R81 = new Array(PERIODS).fill(0); // Addition
const R82 = new Array(PERIODS).fill(0); // Reduction
const R83 = new Array(PERIODS).fill(0); // Accum Dep
const R84 = new Array(PERIODS).fill(0); // Closing

// Helper to get CUMSUM(V1) at period t
function getCumSumV1(t) {
    let sum = 0;
    for (let i = 0; i <= t; i++) sum += V1[i];
    return sum;
}

// Simulation Loop
console.log('Period | V1 (Capex) | F2 (Ops) | Opening (R80) | Addition (R81) | Reduction (R82) | Closing (R84)');
console.log('-------|------------|----------|---------------|----------------|-----------------|---------------');

let accumDep = 0;

for (let t = 0; t < PERIODS; t++) {
    // 1. Opening Balance (R80)
    // Formula: SHIFT(R84, 1) -> R84[t-1]
    if (t > 0) {
        R80[t] = R84[t - 1];
    } else {
        R80[t] = 0; // Initial opening
    }

    // 2. Addition (R81)
    // Formula: CUMSUM(V1) * F2.Start
    // Note: In real model, CUMSUM(V1) accumulates capex during construction.
    // When Ops start, the total accumulated capex is added to asset base.
    const cumsumV1 = getCumSumV1(t);
    R81[t] = cumsumV1 * F2_Start[t];

    // 3. Reduction (R82) - THE FIX
    // Formula: MIN(R80, CUMSUM(V1) / C1.24 / T.MiY) * F2
    // Interpret: Straight line dep = Total Cost / Life / 12
    // Cap at Opening Balance (can't depreciate more than what's there)
    // Only apply when F2 is active

    // Note: In the actual formula R80 is used. 
    // However, if Addition happens in same period, should it be (R80 + R81)?
    // The formula in JSON is MIN(R80, ...) which implies Depreciation is based on Opening Balance only?
    // Let's check the formula I verified: MIN(R80, ...) 
    // If Addition happens at t=4, R80 is 0. So R82 would be MIN(0, ...) = 0.
    // So depreciation starts NEXT period?
    // Let's trace:
    // t=4: R80=0. R81=1000. R84 = 0 + 1000 - 0 = 1000.
    // t=5: R80=1000. R82 = MIN(1000, 1000/10/12) = 8.33. R84 = 1000 - 8.33 = 991.67.
    // This seems correct for "depreciation starts after capitalization".

    const straightLine = cumsumV1 / C1_24 / T_MiY;
    // Evaluate expression manually since we don't have full parser here for this snippet
    // or use Math.min
    let reduction = 0;
    if (F2[t]) {
        reduction = Math.min(R80[t], straightLine);
    }
    R82[t] = reduction;

    // 4. Closing Balance (R84)
    // Formula: R80 + R81 - R82
    R84[t] = R80[t] + R81[t] - R82[t];

    // 5. Accum Dep (R83)
    accumDep += R82[t];
    R83[t] = accumDep;

    // Output
    if (t >= 2 && t <= 10) { // inner loop to show relevant periods
        console.log(`${t}      | ${V1[t]}          | ${F2[t]}        | ${R80[t].toFixed(2)}        | ${R81[t].toFixed(2)}         | ${R82[t].toFixed(2)}          | ${R84[t].toFixed(2)}`);
    }
}
