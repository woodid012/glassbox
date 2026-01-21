# Glass Model

Financial Model Builder with Visual Dependencies

## Features

### Glass Inputs (`/glassinputs`)
- Define time series arrays at monthly granularity
- Flags for time-based conditions
- Indexation curves (CPI, escalation)
- Value inputs with sparse overrides

### Model Builder (`/model-builder`)
- Formula-based calculations with dependency tracking
- Variable references: `V1`, `F1`, `I1`, `C1`, `M1.interest`
- Functions: `LAG()`, `LEAD()`, `IF()`, `MIN()`, `MAX()`, `SUM()`, `CUMSUM()`
- Preset modules:
  - Debt Amortisation (annuity/bullet/linear)
  - Depreciation (straight-line/declining balance)
  - Revenue Escalation
  - Working Capital
  - Tax Loss Carryforward
  - Capex Schedule
- Dependency inspector - click any value to drill down
- Graph view - visual dependency map

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open browser
open http://localhost:3000
```

## Project Structure

```
glass-model/
  app/
    page.jsx              # Homepage
    layout.jsx            # Root layout
    globals.css           # Global styles
    glassinputs/
      page.jsx            # Glass Inputs page
      theme.js            # Theme config
      components/         # Input components
    model-builder/
      page.jsx            # Model Builder page
      theme.js            # Theme config
  utils/
    formulaEngine.js      # Formula parsing & evaluation
    moduleTemplates.js    # Preset financial modules
    timeArrayHelpers.js   # Time series utilities
    simpleFormulaEvaluator.js
  package.json
  tailwind.config.js
  next.config.js
```

## Formula Syntax

### References
- `V1`, `V2`, ... - Value inputs
- `F1`, `F2`, ... - Flags
- `I1`, `I2`, ... - Indexations
- `C1`, `C2`, ... - Calculations
- `M1.interest`, `M1.principal` - Module outputs

### Operators
- Arithmetic: `+`, `-`, `*`, `/`, `^`
- Comparison: `GT()`, `GTE()`, `LT()`, `LTE()`, `EQ()`

### Functions
- `LAG(array, periods)` - Shift array back in time
- `LEAD(array, periods)` - Shift array forward in time
- `IF(condition, then, else)` - Conditional
- `MIN(...)`, `MAX(...)` - Min/max
- `SUM(array)` - Sum all values
- `CUMSUM(array)` - Cumulative sum
- `ABS(value)` - Absolute value
- `ROUND(value, decimals)` - Round

### Example
```
C1 = V1 * V2 * F1           # Revenue = Price * Volume * Flag
C2 = C1 + V3                # EBITDA = Revenue + Costs
C3 = IF(GT(C2, 0), C2, 0)   # Positive EBITDA only
```

## Deployment

Built for Vercel deployment:

```bash
npm run build
```

Or push to GitHub and connect to Vercel for automatic deployments.
