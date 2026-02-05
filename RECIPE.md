# Recipe Module (Model Generation System)

> **Status:** Future/experimental feature. Not part of core Glassbox functionality.

The Recipe module provides a two-tier system for generating and managing financial models:
1. **Spec** (simple, Claude-friendly) → 2. **Recipe** (detailed) → 3. **Model JSON files**

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SPEC LAYER                                  │
│   model-spec.json (~200 lines, Claude reads/writes)                │
│   - Human-readable dates: "Apr 2027"                               │
│   - Symbolic refs: {PowerMW}, {TollingFee}                         │
│   - Simple anchors: "after F1"                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ compile.js
┌─────────────────────────────────────────────────────────────────────┐
│                        RECIPE LAYER                                 │
│   recipe.json (~2500 lines, full detail)                           │
│   - Resolved dates: { startYear: 2027, startMonth: 4 }             │
│   - Translated refs: C1.1, C1.8                                    │
│   - Full anchor structure with offsets                             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ generate.js
┌─────────────────────────────────────────────────────────────────────┐
│                        MODEL LAYER                                  │
│   model-inputs.json, model-calculations.json, model-modules.json   │
│   - Ready for the calculation engine                               │
│   - Consumed by the dashboard UI                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## File Locations

| File | Purpose |
|------|---------|
| `recipe/spec/model-spec.schema.json` | JSON Schema for spec validation |
| `recipe/spec/compile.js` | Spec → Recipe compiler |
| `recipe/spec/templates/*.spec.json` | Spec templates (BESS, Solar) |
| `recipe/recipe.json` | Current compiled recipe |
| `recipe/agent/index.js` | CLI entry point |
| `recipe/agent/generate.js` | Recipe → Model files |
| `recipe/agent/extract.js` | Model files → Recipe |
| `recipe/agent/validate.js` | Run engine + check BS/covenants |
| `recipe/agent/lint.js` | Best practice checks |

## CLI Commands

```bash
# === SPEC COMMANDS (Claude-friendly) ===

# Compile a spec to recipe.json
node recipe/agent/index.js compile recipe/spec/templates/bess-simple.spec.json

# Full pipeline: spec → recipe → model files
node recipe/agent/index.js build recipe/spec/templates/bess-simple.spec.json

# Preview compilation without writing
node recipe/agent/index.js compile my-model.spec.json --dry-run


# === RECIPE COMMANDS (detailed) ===

# Extract recipe from current model files
node recipe/agent/index.js extract

# Generate model files from recipe.json
node recipe/agent/index.js generate

# Preview generation without writing
node recipe/agent/index.js generate --dry-run


# === VALIDATION COMMANDS ===

# Run engine and check BS/covenants/IRR
node recipe/agent/index.js validate

# Check best practices (no engine needed)
node recipe/agent/index.js lint

# Diagnose BS imbalances
node recipe/agent/index.js debug

# Full roundtrip: extract → generate → validate
node recipe/agent/index.js roundtrip

# Compare engine output vs IFS Excel reference
node recipe/agent/index.js compare
```

## Spec Format Reference

The spec is a simplified JSON that Claude can easily read and write:

```json
{
  "project": {
    "name": "100 MW BESS",
    "type": "BESS",           // BESS, Solar, Wind, Hybrid, Other
    "currency": "AUD",
    "financialYearEnd": 6     // June
  },

  "timeline": {
    "start": "Apr 2027",      // Human-readable: "Mon YYYY"
    "end": "Mar 2057"
  },

  "keyPeriods": [
    {
      "name": "Construction",
      "flag": "F1",           // Flag determines ID (F1 → id: 1)
      "duration": "18 months", // or "25 years"
      "start": "timeline.start"
    },
    {
      "name": "Operations",
      "flag": "F2",
      "duration": "300 months",
      "start": "after F1"     // Anchors: "after F1", "with F2", "timeline.start"
    }
  ],

  "constants": [
    { "name": "PowerMW", "value": 100 },
    { "name": "TollingFee", "value": 85, "unit": "$/kW/yr" }
  ],

  "inputGroups": [
    { "name": "CAPEX", "mode": "values", "linkedPeriod": "F1" },
    { "name": "OPEX", "mode": "series", "linkedPeriod": "F2" }
  ],

  "inputs": [
    { "name": "BatteryCapex", "group": "CAPEX", "value": 70 },
    { "name": "OMCosts", "group": "OPEX", "value": 0.8 }
  ],

  "calculationGroups": [
    { "name": "Revenue", "tab": "P&L" },
    { "name": "Costs", "tab": "P&L" }
  ],

  "calculations": [
    {
      "id": 4,
      "name": "TollingRevenue",
      "formula": "{PowerMW} * {TollingFee} / T.MiY / 10^6 * F6",
      "group": "Revenue",
      "type": "flow"
    }
  ],

  "modules": []  // Or include debt modules if needed
}
```

## Symbolic References

The spec compiler translates symbolic names to actual refs:

| Spec Formula | Compiled Formula | Notes |
|--------------|------------------|-------|
| `{PowerMW}` | `C1.1` | First constant |
| `{TollingFee}` | `C1.3` | Third constant |
| `{BatteryCapex}` | `V1.1` | First CAPEX input |
| `{OMCosts}` | `S1.10` | OPEX input with id 10 |
| `F6` | `F6` | Key period flags pass through |
| `R4 + R5` | `R4 + R5` | R-refs pass through |

**Naming rules:**
- Constant/input names are sanitized: `"Power Capacity (MW)"` → `{PowerCapacityMW}` or `{PowerCapacity}`
- Spaces, parentheses, and special chars are removed
- Case is preserved

## Key Period Flag-to-ID Mapping

**Flags determine IDs:** When you specify `"flag": "F6"`, the key period gets `id: 6`.

```json
{ "name": "Construction", "flag": "F1" }   → id: 1
{ "name": "Operations", "flag": "F2" }     → id: 2
{ "name": "Tolling", "flag": "F6" }        → id: 6
{ "name": "Merchant", "flag": "F7" }       → id: 7
{ "name": "Debt", "flag": "F8" }           → id: 8
```

This ensures formulas using `F6`, `F7`, `F8` resolve correctly.

## Period Anchoring

| Anchor Syntax | Meaning |
|---------------|---------|
| `"timeline.start"` | Model start date |
| `"after F1"` | 1 month after F1 ends |
| `"with F2"` | Same start as F2 |

The compiler resolves anchors in dependency order and calculates all dates.

## Input Group Modes

| Mode | Prefix | Description |
|------|--------|-------------|
| `values` | V | Point-in-time values (CAPEX) |
| `series` | S | Time series (OPEX, recurring) |
| `lookup` | L | Lookup curves (price forecasts) |
| `constant` | C | Constants (auto-created) |

## Templates Available

| Template | Description |
|----------|-------------|
| `bess-simple.spec.json` | 100 MW BESS with formula-based debt |
| `bess-100mw-v2.spec.json` | 100 MW BESS with iterative debt module |
| `solar.spec.json` | Solar farm template |

## Workflow: Creating a New Model

**Option 1: Interactive with Claude**

User: "Create a 50 MW wind farm model"

Claude will:
1. Ask for key inputs (capacity, prices, gearing, etc.)
2. Generate a spec file with those values
3. Build the model: `node recipe/agent/index.js build <spec>`

**Option 2: Modify Existing Model**

```bash
# Extract current model to recipe
node recipe/agent/index.js extract

# Edit recipe/recipe.json or have Claude edit it

# Regenerate model files
node recipe/agent/index.js generate

# Validate
node recipe/agent/index.js validate
```

**Option 3: Start from Template**

```bash
# Copy template
cp recipe/spec/templates/bess-simple.spec.json my-project.spec.json

# Edit the spec (manually or with Claude)

# Build
node recipe/agent/index.js build my-project.spec.json
```

## Formula Validation

The compiler warns about unknown refs:

```
=== Formula Validation Warnings ===
  R10 (TotalRevenue): Unknown ref "F99" in formula: R4 + R5 * F99
===================================
```

## Test Suite

Run spec compilation tests:
```bash
npx vitest run tests/spec-compile.test.js
```

Tests verify:
- Basic compilation works
- Symbolic refs translate correctly
- Key period IDs match flags
- Period anchors resolve dates
- Input groups link to key periods

## Known Limitations

1. **Iterative modules** - `iterative_debt_sizing` and `dsrf` require JS solvers, not pure formulas. Use formula-based debt for spec-generated models, or use the full recipe system.

2. **Balance sheet precision** - Generating a balanced BS requires careful formula design matching the ledger patterns in CLAUDE.md. Start from a working model and modify incrementally.

3. **Module outputs** - Module refs like `M1.3` only work if the module is properly configured with a JS solver or converted to formulas.

## Best Practices

1. **Use symbolic refs** - Write `{PowerMW}` not `C1.1` for readability
2. **Match flag to ID** - If you need `F8` in formulas, use `"flag": "F8"` in the key period
3. **Link input groups** - Always specify `linkedPeriod` to get proper dates
4. **Test incrementally** - Build and validate after each major change
5. **Start from extract** - For complex models, extract the current recipe first
