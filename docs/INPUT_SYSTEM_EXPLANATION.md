# Input Definition System - Technical Explanation

## Overview

This document explains the simplified input definition system for a financial modeling application built with Next.js/React. The system allows users to define time-series inputs that feed into financial calculations.

---

## Core Concepts

### Input Types (Entry Modes)

There are 3 types of inputs users can create:

| Type | `entryMode` Value | User Experience | Internal Behavior |
|------|-------------------|-----------------|-------------------|
| **Constant** | `'constant'` | Enter ONE value | Same value applied to every period |
| **Values** | `'values'` | Enter value PER PERIOD | Values are stored sparsely and looked up per period |
| **Series** | `'series'` | Enter ONE value + date range | Value applies within the date range, with Flow/Stock spreading |

### Flow vs Stock (Spread Method)

When input frequency differs from model frequency (e.g., annual inputs in a monthly model), the system needs to know how to spread values:

| Method | `spreadMethod` Value | Behavior | Use For |
|--------|---------------------|----------|---------|
| **Flow** | `'spread'` | Divides value across periods (1200/year → 100/month) | Revenues, costs, volumes - things that accumulate |
| **Stock** | `'lookup'` | Repeats value in each period (100/year → 100 each month) | Prices, rates, factors - point-in-time values |

### Auto-Detection

The system auto-detects Flow/Stock from the input name using keywords:

**Stock keywords** (repeat value):
- price, rate, factor, percent, ratio, count, capacity, balance, index, escalation, inflation, growth, yield, margin, fee

**Flow keywords** (divide value):
- revenue, cost, expense, capex, opex, volume, production, generation, payment, cash, income, profit, loss, spend, budget, amount, total

**Default**: Flow (dividing is safer for financial inputs)

---

## Data Structures

### Input Object

```javascript
{
    id: 1,
    groupId: 1,
    name: "Merchant Price",
    entryMode: 'values',        // 'constant' | 'values' | 'series'
    values: { 0: 50, 1: 55 },   // Sparse object: { periodIndex: value }
    formulas: { 0: "10*5" },    // Optional formulas per period
    value: 0,                   // Single value (for constant/series modes)
    valueFrequency: 'Y',        // 'M' | 'Q' | 'Y' - what period the value represents
    spreadMethod: null          // 'spread' | 'lookup' | null (auto-detect)
}
```

### Group Object

```javascript
{
    id: 1,
    name: "Revenue Inputs",
    startDate: "2025-01-01",
    endDate: "2030-12-31",
    periods: 72,
    frequency: 'M',             // 'M' | 'Q' | 'Y' - display/input frequency
    linkedKeyPeriodId: null,    // Link to a key period for dates
    groupType: 'combined'
}
```

---

## Key Files

### 1. `hooks/useInputArrays.js`

Computes time-series arrays from input definitions.

**Key computation** in `inputGlassArrays` useMemo:
- Determines entry mode (constant/values/series)
- Uses explicit spreadMethod or defaults to 'spread' (flow)
- Calculates `periodsPerValueFreq` based on timeline frequency
- For Series mode: spreads or repeats value based on spreadMethod
- For Values mode: looks up sparse values by period index

### 2. `hooks/useInputManagement.js`

CRUD operations for inputs and groups.

**Key function**: `addInputGlass(groupId)`
- Creates new input with default `entryMode: 'values'`
- Uses `spreadMethod: 'spread'` (flow) by default

### 3. `components/inputs/InputGroups.jsx`

UI component for rendering input groups and their inputs.

**Key features**:
- Dropdown for entry mode: Constant / Values / Series
- Flow/Stock dropdown only shown when group frequency ≠ Monthly
- Auto-detected Flow/Stock values highlighted with amber background
- Constant mode cells shown in blue (read-only)
- Values mode cells are editable with formula support
- Series mode cells show calculated values (read-only)

---

## UI Layout

### Group Header
```
┌─ Revenue Inputs ──────────────────────────────────────────────────┐
│ Key Period: [Model ▼]   Input Freq: [Annual ▼]   Periods: 10      │
└───────────────────────────────────────────────────────────────────┘
```

### Input Row (when group freq = Annual, so Flow/Stock shows)
```
│ Delete │ Label           │ Type     │ Value    │ Method │ Total  │ 2025 │ 2026 │ ...
├────────┼─────────────────┼──────────┼──────────┼────────┼────────┼──────┼──────┼────
│   🗑   │ Tax Rate        │ Constant │ 30       │  -     │ 30     │  30  │  30  │ ...
│   🗑   │ Merchant Price  │ Values   │ –        │ Stock  │ 275    │  50  │  55  │ ...
│   🗑   │ Contract Rev    │ Series   │ 1200000  │ Flow   │ 6M     │ 100k │ 100k │ ...
```

### Input Row (when group freq = Monthly, Flow/Stock hidden)
```
│ Delete │ Label           │ Type     │ Value    │ Total  │ Jan-25 │ Feb-25 │ ...
```

---

## Backwards Compatibility

The system supports legacy property names:

| Old Property | New Property | Notes |
|--------------|--------------|-------|
| `mode` | `entryMode` | |
| `timePeriod` | `valueFrequency` | |
| `type: 'stock'` | `spreadMethod: 'lookup'` | |
| `type: 'flow'` | `spreadMethod: 'spread'` | |
| `entryMode: 'single'` | `entryMode: 'series'` | |

---

## Calculation Flow

1. **User creates input** in group with entry mode
2. **Input stored** with sparse values/formulas or single value
3. **useInputArrays hook** computes full time-series array:
   - Determines mode from `entryMode`
   - Gets spreadMethod (explicit or auto-detected)
   - For each timeline period:
     - Constant: return `input.value`
     - Values: lookup `input.values[periodIndex]`
     - Series: check date range, apply spread/lookup logic
4. **Result**: Full array like `[100, 100, 100, 100, ...]` for all model periods

---

## Example Scenarios

### Scenario 1: Annual Inputs in Monthly Model

Group frequency: Annual (Y)
Model frequency: Monthly

| Input | Type | Value | Method | Jan-25 | Feb-25 | ... | Dec-25 | Total |
|-------|------|-------|--------|--------|--------|-----|--------|-------|
| Revenue | Series | 1,200,000 | Flow | 100,000 | 100,000 | ... | 100,000 | 1,200,000 |
| Price | Series | 50 | Stock | 50 | 50 | ... | 50 | 600 |

### Scenario 2: Monthly Inputs in Monthly Model

Group frequency: Monthly (M)
Model frequency: Monthly

- Flow/Stock dropdown hidden (not relevant)
- Values entered directly map to periods

---

## Key Code Patterns

### Detecting Entry Mode
```javascript
const entryMode = input.entryMode || input.mode || 'values'
const isConstantMode = entryMode === 'constant' || entryMode === 'constants'
const isValuesMode = entryMode === 'values' || entryMode === 'schedule'
const isSeriesMode = entryMode === 'series' || entryMode === 'single' || entryMode === 'uniform'
```

### Calculating Spread
```javascript
const periodsPerValueFreq = valueFrequency === 'Y' ? 12 : valueFrequency === 'Q' ? 3 : 1
const valuePerPeriod = spreadMethod === 'lookup'
    ? input.value
    : input.value / periodsPerValueFreq
```

### Conditional UI
```javascript
// Only show Flow/Stock when group freq isn't monthly
const showFlowStock = groupFrequency !== 'M'
```
