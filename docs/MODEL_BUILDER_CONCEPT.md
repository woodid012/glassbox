# Model Builder - Concept Documentation

> **Status**: Concept/Future Implementation
> **Current Focus**: Building GlassInputs array system first, then mapping to Model Builder later.

## Overview

The Model Builder is a formula-based financial modeling engine that processes time series calculations with dependency tracking. It takes inputs from GlassInputs and allows building complex financial models through formulas and pre-built modules.

## Core Philosophy

### Reference System

All data elements use a consistent reference notation:

| Prefix | Type | Example | Description |
|--------|------|---------|-------------|
| `V{n}` | Values | `V1`, `V1.1` | Value group sums and sub-items |
| `C{n}` | Constants | `C1`, `C1.2` | Constant group sums and sub-items |
| `S{n}` | Series | `S1`, `S1.3` | Series group sums and sub-items |
| `F{n}` | Flags | `F1` | Binary flags (0/1) from key periods |
| `I{n}` | Indexations | `I1` | Escalation/inflation indices |
| `R{n}` | Results | `R1` | Calculation results |
| `M{n}.{output}` | Modules | `M1.interest` | Pre-built module outputs |

### Formula Engine

Formulas reference other arrays and support:
- Basic arithmetic: `+`, `-`, `*`, `/`
- References: `V1 * F1` (Revenue when flag is active)
- Module outputs: `M1.principal_repayment + M1.interest`
- Nested calculations: `R1 - R2` (Calculation referencing other calculations)

### Dependency Graph

The engine automatically:
1. Extracts references from formulas
2. Builds a dependency graph
3. Determines evaluation order (topological sort)
4. Detects circular dependencies
5. Evaluates period-by-period

## Pre-Built Modules

### 1. Debt Amortisation
Calculates loan schedules with multiple loan types.

**Inputs:**
- Principal Amount
- Annual Interest Rate (%)
- Term (months)
- Drawdown Period
- Loan Type: Annuity | Bullet | Linear
- Grace Periods (optional)

**Outputs:**
- `drawdown` - Initial drawdown
- `interest` - Interest payment per period
- `principal_repayment` - Principal payment per period
- `total_repayment` - Total payment per period
- `balance_opening` - Opening balance
- `balance_closing` - Closing balance

### 2. Depreciation
Asset depreciation with multiple methods.

**Inputs:**
- Asset Value
- Residual Value
- Useful Life (months)
- Start Period
- Method: Straight Line | Declining Balance | Sum of Years

**Outputs:**
- `depreciation` - Depreciation expense per period
- `accumulated` - Accumulated depreciation
- `book_value` - Net book value

### 3. Revenue Escalation
Revenue streams with price and volume escalation.

**Inputs:**
- Base Price
- Base Volume
- Annual Price Escalation (%)
- Annual Volume Growth (%)
- Start/End Period
- Active Flag (optional)

**Outputs:**
- `price` - Escalated price
- `volume` - Adjusted volume
- `revenue` - Total revenue

### 4. Working Capital
Working capital requirements based on days outstanding.

**Inputs:**
- Revenue Reference
- Cost Reference
- Receivable Days
- Payable Days
- Inventory Days

**Outputs:**
- `receivables` - Accounts receivable
- `payables` - Accounts payable
- `inventory` - Inventory balance
- `net_working_capital` - Net WC
- `change` - Change in WC (cash flow impact)

### 5. Tax Calculation
Corporate tax with loss carry-forward.

**Inputs:**
- Taxable Income Reference
- Tax Rate (%)
- Start Period
- Loss Carry Forward (years)

**Outputs:**
- `taxable_income` - Adjusted taxable income
- `tax_expense` - Tax expense
- `losses_utilized` - Losses used
- `losses_carried` - Losses carried forward

## Integration with GlassInputs

### Data Flow
```
GlassInputs (define inputs)
    → Export arrays with references (V1, S1, C1, F1, I1)
    → Model Builder receives context
    → Calculations use references in formulas
    → Results available as R{n}
    → Modules generate M{n}.{output}
```

### Export Format
GlassInputs exports:
```javascript
{
  arrays: {
    'V1': [100, 100, 100, ...],      // Group sum
    'V1.1': [60, 60, 60, ...],       // Sub-item
    'V1.2': [40, 40, 40, ...],       // Sub-item
    'F1': [0, 0, 1, 1, 1, ...],      // Flag
    'I1': [1, 1.02, 1.04, ...],      // Indexation
  },
  metadata: {
    'V1': { name: 'Revenue', type: 'value', isGroup: true },
    'V1.1': { name: 'Product A', type: 'value', isSubItem: true },
    // ...
  },
  timeline: { periods: 120, startDate: '2024-01-01', ... }
}
```

## Future Implementation Notes

1. **Phase 1 (Current)**: Build robust GlassInputs with three modes (Values, Series, Constant)
2. **Phase 2**: Connect GlassInputs export to Model Builder context
3. **Phase 3**: Implement calculation engine with formula validation
4. **Phase 4**: Add pre-built modules
5. **Phase 5**: Dependency visualization and debugging tools

## Files Reference

- `/app/model-builder/page.jsx` - Main page (currently disabled)
- `/utils/formulaEngine.js` - Formula parsing and evaluation
- `/utils/moduleTemplates.js` - Pre-built module definitions
- `/utils/glassInputsIntegration.js` - Export/import utilities
