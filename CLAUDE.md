# Claude Code Instructions

## Setup & Run

1. Unzip this project
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000 in the browser

## Project Overview

This is a Next.js 14 financial model builder with two main pages:

- `/glassinputs` - Time series input definition (flags, indexations, values)
- `/model-builder` - Formula-based calculations with dependency tracking

## Glass Box Philosophy

This project follows the **Glass Box** philosophy - complete transparency in financial modeling:

### Core Principles

1. **Full Transparency** - Every calculation is visible and traceable. No hidden logic or black-box formulas. Users can see exactly how any number was derived.

2. **Period-Level Granularity** - All calculations operate at the finest granularity (monthly periods). This ensures accuracy and allows drilling down to understand any value.

3. **Flexible Output Detail** - While calculations run at period level, outputs can be aggregated to appropriate detail levels for different users:
   - Executives: Annual summaries
   - Analysts: Quarterly breakdowns
   - Auditors: Full monthly detail

4. **Audit-Ready Exports** - The system supports dumping complete input sets and calculation chains for:
   - External audits
   - Model validation
   - Knowledge transfer
   - Regulatory compliance

### Data Flow: Inputs → Calculations → Results

```
Inputs (transparent, editable)
    ↓
Calculations (visible formulas, traceable references)
    ↓
Results (period-level detail, aggregated views)
    ↓
Exports (full audit trail available)
```

### Design Implications

- All formulas use explicit references (V1, S1, R1) that can be traced back to source inputs
- No magic numbers - constants are named and documented
- Calculation order is deterministic via topological sorting
- Every output can be explained by walking the formula chain backwards

## Key Files

- `app/glassinputs/page.jsx` - Input arrays page
- `app/model-builder/page.jsx` - Calculations page with formula editor
- `utils/formulaEngine.js` - Formula parsing and evaluation
- `utils/moduleTemplates.js` - Preset modules (debt, depreciation, etc.)

## Tech Stack

- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- Lucide React icons

## Code Guidelines

- **Aim to keep files under ~1000 lines** - Not a hard limit, but if files are getting large, consider going back to planning mode to restructure into smaller, well-organized modules

## Data Files

- `data/model-inputs.json` - Input values and groups
- `data/model-calculations.json` - Formulas and structure
- `data/model-ui-state.json` - UI preferences
- `data/model-links.json` - References between items
- `data/model-summary.md` - Human-readable summary of all refs

### JSON Files as Source of Truth
The app reads from and writes to the JSON files directly via `/api/model-state`. When Claude edits `model-calculations.json` or `model-inputs.json`, refresh the browser to see the changes.

**NEVER search or read `data/glass-inputs-autosave.json`** - it's a legacy file, too large and outdated.

### Calculation Groups & Tabs Structure

**Groups own the tab assignment, not calculations.**

Calculations derive their tab from their group's `tabId`. This means:
- To move calculations to a different tab, change the **group's** `tabId`
- Calculations only need `groupId`, not `tabId`
- Moving a group automatically moves all its calculations

```json
// Group - owns the tab assignment
{ "id": 26, "tabId": 4, "name": "Equity IRR" }

// Calculation - only needs groupId (tabId derived from group)
{ "id": 130, "groupId": 26, "name": "Initial Equity", "formula": "..." }
```

**When creating calculations:**
- Set `groupId` to assign to a group
- Do NOT set `tabId` (it's derived from the group)
- Ungrouped calculations (no `groupId`) use their own `tabId` as fallback

**When moving groups between tabs:**
- Change only the group's `tabId`
- All calculations in that group move automatically

## Creating Time Series Inputs (The Linking Pattern)

When you need a new recurring input (e.g., maintenance capex, debt service, revenue stream), think abstractly about linking three components:

```
Key Period (WHEN)  →  Input Group (HOW)  →  Input (WHAT)
     ↓                      ↓                    ↓
 Start/End dates      Frequency (M/Q/Y)      Values/Amount
```

### Step 1: Define the Time Window (Key Period)

Create a Key Period in `keyPeriods` array that defines WHEN the series is active:

```json
{
  "id": 12,
  "name": "Maintenance",
  "startYear": 2042, "startMonth": 10,
  "endYear": 2045, "endMonth": 9,
  "periods": 36
}
```

Key periods can also link to other periods (e.g., "starts 1 month after Construction ends").

### Step 2: Define the Entry Pattern (Input Group)

Create an Input Group in `inputGlassGroups` that defines HOW values are entered:

```json
{
  "id": 8,
  "name": "Maintenance",
  "linkedKeyPeriodId": "12",
  "frequency": "Q",
  "groupType": "combined",
  "entryMode": "constant"
}
```

| Field | Purpose |
|-------|---------|
| `linkedKeyPeriodId` | Links to key period for start/end dates |
| `frequency` | `M` (monthly), `Q` (quarterly), `Y` (annual) |
| `entryMode` | `constant` (same value), `values` (manual each period), `lookup` (reference another) |

### Step 3: Add the Input (What Value)

Create an Input in `inputGlass` that defines WHAT the actual values are:

```json
{
  "id": 130,
  "groupId": 8,
  "name": "Base Maintenance",
  "entryMode": "constant",
  "value": 0.29,
  "valueFrequency": "Q",
  "unit": "$ M"
}
```

### Step 4: Reference in Calculations or Modules

The input automatically expands to monthly periods and can be referenced:
- In formulas: `S1.19` (if in OPEX group) or appropriate prefix
- In modules: Set `maintenanceRef: "S1.19"` as module input

### Complete Example: Adding Quarterly Maintenance

**Goal:** $0.29M quarterly maintenance from Oct 2042 to Sep 2045

1. **Key Period** (id: 12) → Oct 2042 - Sep 2045 (36 months)
2. **Input Group** (id: 8) → Quarterly frequency, linked to key period 12
3. **Input** (id: 130) → $0.29M constant value
4. **Module** (MRA) → References the input, calculates look-forward reserve target

### Why This Pattern Matters

- **Separation of concerns:** Time window, entry pattern, and values are independent
- **Reusability:** Same key period can be used by multiple input groups
- **Flexibility:** Change frequency without recreating inputs
- **Auditability:** Clear traceability from output back to input assumptions

### Alternative: Direct Period Array Input

For ad-hoc data entry (e.g., pasting 12 months of forecast data), use the simpler pattern:

1. **Set the period count** in the input group (e.g., `"periods": 12`)
2. **Paste values directly** into the `values` object with period indices:

```json
{
  "id": 140,
  "groupId": 8,
  "name": "Lump Sum Maintenance",
  "mode": "values",
  "values": {
    "0": 0.5,
    "3": 0.75,
    "6": 0.5,
    "9": 0.75
  },
  "unit": "$ M"
}
```

This approach:
- Defines periods directly (no key period linking needed)
- Uses sparse object format (only non-zero periods need entries)
- Index 0 = first period, index 11 = 12th period
- Good for irregular or one-off payment schedules

**When to use which:**
| Pattern | Use Case |
|---------|----------|
| Key Period Linking | Recurring series tied to project phases (ops, construction) |
| Direct Period Array | Ad-hoc data, irregular schedules, pasted forecasts |

### For Escalation (CPI, etc.)

Don't add escalation to the input itself. Instead:
1. Create a calculation that applies escalation: `S1.19 * I2` (where I2 is CPI index)
2. Reference the escalated calculation in downstream formulas

This keeps escalation logic visible and auditable in the calculation chain.

## Formula Reference System

**All references are ID-based for stability.**

Both calculation references (R-refs) and input references (V, S, C, L) resolve by ID, not array position. This means:
- Deleting an item does NOT shift other references
- References are stable across edits

### Calculation References (R-refs)

When writing formulas that reference other calculations:
- `R60` references the calculation with `"id": 60`
- Array position is irrelevant for formula resolution
- Inserting/reordering calculations does NOT break references

Example: A calculation with `"id": 60` is always referenced as `R60`, regardless of where it appears in the array.

### Input References (V1.X, S1.X, C1.X, L1.X)

Input references are also ID-based:

| Type | Group ID | Reference Formula | Example |
|------|----------|-------------------|---------|
| Constants | 100 | `C1.{id - 99}` | id=118 → C1.19, id=123 → C1.24 |
| CAPEX | 1 | `V1.{id}` | id=5 → V1.5 |
| OPEX | 2 | `S1.{id}` | id=14 → S1.14 |
| Lookups | varies | `L1.{id}` | Depends on lookup structure |

**Important:** Constants use an offset of 99 because their IDs start at 100. Other inputs use their ID directly.

**When adding new calculations:**
1. Choose a unique ID that doesn't conflict with existing IDs
2. Use that ID in formulas (e.g., `R60 + R61`)
3. Array position only affects display order, not formula resolution

**When deleting calculations:**
1. Before deleting, search for all references to that calculation (e.g., grep for `R60`)
2. Update or remove all formulas that reference the deleted calculation
3. IDs do NOT renumber - if you delete R10, other calculations keep their IDs (R9 stays R9, R11 stays R11)
4. Dangling references (e.g., `R60` when id 60 no longer exists) will cause formula errors

**When modifying calculation structure:**
1. Check upstream dependencies: What does this calculation reference?
2. Check downstream dependencies: What references this calculation?
3. Avoid circular dependencies - use SHIFT() to break cycles (e.g., `SHIFT(R84, 1)` references prior period, not current)
4. If a ledger pattern (Opening → Addition → Reduction → Closing) creates a cycle, restructure so Closing is calculated independently

**Handling constants in formulas:**
- **Never hardcode business constants directly in calculations** - avoid formulas like `R5 * 0.15`
- Before adding a constant, check if it already exists in the constants group
- If the constant doesn't exist, add it to the constants list first
- Reference the constant in your formula (e.g., `R5 * C1.7` where C1.7 is the tax rate)
- This ensures all assumptions are visible, auditable, and easy to update

**Time constants (use instead of hardcoded values):**
- `T.MiY` - Months in Year (12) - use instead of `/12` for annual-to-monthly conversion
- `T.DiY` - Days in Year (365/366)
- `T.DiM` - Days in Month (28-31, varies by period)
- `T.QiY` - Quarters in Year (4)
- `T.HiD` - Hours in Day (24)
- `T.HiY` - Hours in Year (8760/8784)
- `T.MiQ` - Months in Quarter (3)
- `T.DiQ` - Days in Quarter (varies: ~90-92)

**Time flags (1 at period end, 0 otherwise):**
- `T.QE` - Quarter End (1 at months 3, 6, 9, 12)
- `T.CYE` - Calendar Year End (1 at December)
- `T.FYE` - Financial Year End (1 at June - Australian FY)

Example: `R70 * C1.17 / 100 / T.MiY` instead of `R70 * C1.17 / 100 / 12`

**Key period flags (ID-based, auto-generated from Key Periods):**

Flag references use the keyPeriod's ID, not array position. This means:
- Deleting a key period does NOT renumber other flag references
- `F{id}` references the key period with that specific ID
- Reference names are stable across edits

Examples from current model:
- `F1` - Construction flag (keyPeriod id=1)
- `F2` - Total Operations flag (keyPeriod id=2)
- `F3` - Normal Operations flag (keyPeriod id=3)
- `F6` - Offtake flag (keyPeriod id=6)
- `F7` - Merchant flag (keyPeriod id=7)
- `F8` - Ops Debt flag (keyPeriod id=8)
- `F{id}.Start` - First period only
- `F{id}.End` - Last period only

**Indexation references (ID-based):**

Indexation references also use the index's ID:
- `I2` - CPI indexation (index id=2)
- Deleting an index does NOT renumber other indexation references

**Use .Start/.End flags for one-time events:**
- Asset additions at COD: `CUMSUM(V1) * F2.Start` instead of `CUMSUM(V1) * MAX(0, F2 - SHIFT(F2, 1))`
- Debt injection at ops start: `R94 * F2.Start`
- Final releases at period end: `balance * F8.End`

**Acceptable hardcoded numbers (structural/technical):**
- `CUMSUM(1)` - incrementing counters
- `10^6` - unit conversion as power expression (e.g., converting to millions)
- `/100` - percentage-to-decimal conversion (standard notation)
- `0.0001` - small number to prevent division by zero (technical safeguard)
- `0` - placeholder formulas for future implementation
- `1, 2, 3` in SHIFT functions - period offsets for lagging values
- `/30` in working capital - standard 30-day month assumption (financial convention)

**Numbers that MUST use constants or time constants:**
- Interest rates, tax rates, DSCR targets → use C1.xx constants
- Hours per year (8760) → use `T.HiY`
- Months per year (12) → use `T.MiY`
- Days per year (365) → use `T.DiY`
- Depreciation life, debt term → use C1.xx constants
- Any business assumption that an analyst might want to change

## Ledger Pattern (Gold Standard)

Ledger-style calculations (Opening → Addition → Reduction → Closing) create circular dependencies because Opening depends on prior Closing, and Closing depends on Opening. The gold standard solution uses CUMSUM to eliminate these cycles entirely.

### The Problem

Traditional ledger formulas create cycles:
```
Opening = SHIFT(Closing, 1)  ← needs Closing
Closing = Opening + Addition - Reduction  ← needs Opening
```

SHIFT-based solutions have evaluation order issues and are fragile.

### The Solution: Calculate Closing First

The key insight: **Calculate Closing first using CUMSUM, then derive Opening from prior cumulative values.**

```
1. CLOSING = MAX(0, CUMSUM(Addition) - Rate * CUMSUM(ActiveFlag))
   - Directly calculated, no circular dependencies
   - MAX(0, ...) prevents negative balances

2. OPENING = MAX(0, (CUMSUM(Addition) - Addition) - Rate * (CUMSUM(ActiveFlag) - ActiveFlag))
   - Uses "CUMSUM(X) - X" to get prior period's cumulative
   - No SHIFT needed!

3. ADDITION = (one-time or periodic formula)
   - For one-time: Use F.Start flag (e.g., CUMSUM(V1) * F2.Start)
   - For periodic: Direct formula (e.g., Drawdown amount * Flag)

4. REDUCTION = MIN(Opening + Addition, Rate) * ActiveFlag
   - Known rate, capped at book value
   - Only during active period (Flag)
```

### Pattern Variations

| Scenario | Addition Formula | Rate Formula |
|----------|------------------|--------------|
| **Depreciation** | `CUMSUM(V1) * F2.Start` | `CUMSUM(V1) / Life / T.MiY` |
| **Simple Debt** | `DebtAmount * F.Start` | `DebtAmount / Tenor / T.MiY` |
| **Amortizing Debt** | `Principal * F.Start` | `PMT-style or DSCR-based` |
| **Reserve Account** | `TargetAmount * F.Start` | `ReleaseAmount * F.End` |

### Why This Works

1. **No circular dependency**: Closing is calculated purely from CUMSUM of inputs
2. **No SHIFT evaluation issues**: Opening uses `CUMSUM(X) - X` instead of `SHIFT(X, 1)`
3. **Correct ordering**: CUMSUM functions evaluate all periods at once
4. **Self-capping**: MAX(0, ...) and MIN(...) prevent over-reduction

### Reference Implementation: D&A (R80-R84)

```javascript
// R84 Closing - calculated FIRST, no dependencies on other ledger rows
"MAX(0, CUMSUM(R81) - CUMSUM(V1) / C1.24 / T.MiY * CUMSUM(F2))"

// R80 Opening - uses prior cumulative (no SHIFT)
"MAX(0, (CUMSUM(R81) - R81) - CUMSUM(V1) / C1.24 / T.MiY * (CUMSUM(F2) - F2))"

// R81 Addition - one-time at COD
"CUMSUM(V1) * F2.Start"

// R82 Reduction - known rate, capped at book value
"MIN(R80 + R81, CUMSUM(V1) / C1.24 / T.MiY) * F2"

// R83 Accumulated - running total
"CUMSUM(R82)"
```

### Verification Checklist

When implementing a ledger pattern:
- [ ] Closing formula uses only CUMSUM, no references to Opening
- [ ] Opening uses `CUMSUM(X) - X` pattern, not SHIFT
- [ ] Reduction is capped with MIN to prevent over-reduction
- [ ] MAX(0, ...) prevents negative balances
- [ ] Opening in period N equals Closing in period N-1

## Calculation & Module Execution Order (CRITICAL)

The model uses a **two-pass calculation architecture** to handle dependencies between calculations and modules. This is critical to understand when working with module outputs.

### The Problem

Modules (M1, M2, etc.) often depend on calculation results (R17, R115, etc.), but calculations may also reference module outputs (M5.7, M1.3, etc.). This creates a chicken-and-egg problem:

```
Pass 1: Calculations run → but module refs (M5.7) return 0
        ↓
Modules run → using calculation results from Pass 1
        ↓
Pass 2: Calculations that reference modules are RE-EVALUATED
        with real module values
```

### Execution Flow

1. **First Pass (calculationResults)**: All calculations are evaluated in dependency order. Any reference to module outputs (M1.1, M5.7, etc.) returns **zeros** at this stage.

2. **Module Calculation (postCalcModuleOutputs)**: Modules are computed using the first-pass calculation results. Modules are topologically sorted so they can reference each other.

3. **Second Pass (finalCalculationResults)**: Calculations that reference module outputs are re-evaluated with the real module values. This includes any calculations that depend on those (transitively).

### Key Implementation Details

Located in `app/dashboard/hooks/useDashboardState.js`:

- `regularModuleOutputs` - Initializes module refs as zeros (placeholder)
- `calculationResults` - First pass evaluation
- `postCalcModuleOutputs` - Actual module calculations
- `finalCalculationResults` - Second pass re-evaluation
- The hook returns `finalCalculationResults` (not `calculationResults`)

### When Adding Module References to Calculations

When a calculation references a module output (e.g., `R18 = -M5.7`):

1. The first pass will compute R18 as 0 (since M5.7 doesn't exist yet)
2. The module (M5) will compute using other calc results
3. The second pass will re-compute R18 with the real M5.7 value
4. Any calculation depending on R18 will also be re-evaluated

### Module Output References

Module outputs are referenced as `M{moduleIndex}.{outputIndex}`:
- Module index is 1-based position in the modules array
- Output index is 1-based position in the template's outputs array

Example for Tax module (5th module):
```
M5.1 = taxable_income_before_losses
M5.2 = losses_opening
M5.3 = losses_generated
M5.4 = losses_utilised
M5.5 = losses_closing
M5.6 = net_taxable_income
M5.7 = tax_payable
```

### Debugging Tips

If module values show in the module preview but not in calculations:
1. Check that `finalCalculationResults` is being returned (not `calculationResults`)
2. Verify the calculation formula uses correct M*.* syntax
3. Check browser console for any evaluation errors

## Number Formatting

Smart number formatting is used throughout the application:

- **Large numbers (≥1000):** Whole numbers, no decimals (e.g., 12345 → "12,345")
- **Small decimals (<1):** 2 significant figures (e.g., 0.00456 → "0.0046")
- **Medium numbers (1-999):** Up to 2 decimal places (e.g., 230.5 → "230.5", 1.43 → "1.43")

Key formatting functions:
- `formatNumber()` in `utils/timeArrayHelpers.js`
- `formatValue()` in `utils/valueAggregation.js`
- `formatAccounting()` in `app/dashboard/calculations/page.jsx`

## Notes

- Some glassinputs components are placeholder stubs - replace with full implementations if available
- State persists to localStorage
- Vercel-compatible for deployment
