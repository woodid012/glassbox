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

### For LLM Reading (Use These First)
**Tokenized files are 70% smaller - always read these first:**
- `data/model-calculations.tok.json` - Compact calculations (11 KB vs 33 KB)
- `data/model-inputs.tok.json` - Compact inputs (31 KB vs 117 KB)
- `data/model-summary.md` - Human-readable summary of all refs

### For Full Details (Only When Needed)
- `data/model-inputs.json` - Full input values and groups
- `data/model-calculations.json` - Full formulas and structure
- `data/model-ui-state.json` - UI preferences
- `data/model-links.json` - References between items

### Tokenized Format
The `.tok.json` files use short keys for compactness:
- `i` = id, `n` = name, `f` = formula, `d` = description, `t` = type, `g` = groupId
- `v` = value, `vs` = values (non-zero only), `u` = unit

### Re-tokenize After Edits
After editing model-calculations.json or model-inputs.json:
```bash
node scripts/tokenize-models.js
```

**NEVER search or read `data/glass-inputs-autosave.json`** - it's too large and outdated.

## Formula Reference System

**R-references resolve by calculation ID, not array position.**

When writing formulas that reference other calculations:
- `R60` references the calculation with `"id": 60`
- Array position is irrelevant for formula resolution
- Inserting/reordering calculations does NOT break references

Example: A calculation with `"id": 60` is always referenced as `R60`, regardless of where it appears in the array.

**When adding new calculations:**
1. Choose a unique ID that doesn't conflict with existing IDs
2. Use that ID in formulas (e.g., `R60 + R61`)
3. Array position only affects display order, not formula resolution

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
