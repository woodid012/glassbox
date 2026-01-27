# Plan: Simplify Depreciation to Ledger Format

## Current State (D&A Group 16)

| ID | Name | Formula | Issue |
|----|------|---------|-------|
| R80 | Cumulative Capex | `CUMSUM(V1)` | Intermediate calc, not ledger |
| R81 | Asset Value at COD | `R80 * F2` | Same value every ops period, not a one-time addition |
| R82 | Monthly Depreciation | `(R81 / C1.19 / T.MiY)` | **BUG**: Uses C1.19 (Max Gearing=65%) instead of C1.24 (Depreciation Life=15yr) |
| R83 | Accumulated Depreciation | `MIN(CUMSUM(R82),R81)` | Capped correctly |
| R84 | Book Value | `MAX(0, R80 - R83)` | Uses R80 instead of persistent asset value |

## Target State: Clean Ledger Format

| ID | Name | Formula | Type | Description |
|----|------|---------|------|-------------|
| R80 | Opening Balance | `SHIFT(R84, 1)` | stock_start | Prior period's closing balance |
| R81 | Addition | `CUMSUM(V1) * MAX(0, F2 - SHIFT(F2, 1))` | flow | One-time addition when ops start (COD flag) |
| R82 | Reduction | `MIN(R80 + R81, CUMSUM(R81) / C1.24 / T.MiY) * F2` | flow | Smaller of: standard depreciation or remaining balance |
| R83 | Accumulated Depreciation | `CUMSUM(R82)` | stock | Running total (for accounting reference) |
| R84 | Closing Balance | `R80 + R81 - R82` | stock | = Book Value, naturally >= 0 due to MIN in R82 |

## Key Logic

1. **COD Flag**: `MAX(0, F2 - SHIFT(F2, 1))` = 1 at first ops period, 0 otherwise
2. **Persistent Asset Value**: `CUMSUM(R81)` captures the one-time addition and holds it for rate calculation
3. **Floor at Zero**: `MIN(balance, depreciation_rate)` ensures reduction never exceeds available balance
4. **Depreciation Rate**: `AssetValue / C1.24 / T.MiY` = value / 15 years / 12 months = 1/180 per period

## Changes Summary

1. **R80**: Change from `CUMSUM(V1)` to `SHIFT(R84, 1)`
2. **R81**: Change from `R80 * F2` to `CUMSUM(V1) * MAX(0, F2 - SHIFT(F2, 1))`
3. **R82**: Change from `(R81 / C1.19 / T.MiY)` to `MIN(R80 + R81, CUMSUM(R81) / C1.24 / T.MiY) * F2`
   - Fixes the C1.19 bug (should be C1.24)
   - Adds MIN logic for final payment
4. **R83**: Change from `MIN(CUMSUM(R82),R81)` to `CUMSUM(R82)` (simpler, cap now in R82)
5. **R84**: Change from `MAX(0, R80 - R83)` to `R80 + R81 - R82` (ledger formula)

## Dependencies Check

- R14 (Depreciation in P&L) = `-R82` ✓ No change needed
- No other calculations reference R80, R81, R83, R84 directly

## File to Update

- `data/model-calculations.json` - Update formulas for R80-R84
- Run `node scripts/tokenize-models.js` after
