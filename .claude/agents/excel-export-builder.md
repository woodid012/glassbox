# Excel Export Builder

## What This Agent Knows

How to generate a working Excel (.xlsx) file from a GlassBox financial model — with **live formulas** that recompute when inputs change, not just static snapshots.

## Architecture

### Three Components

1. **`utils/serverModelEngine.js`** — Server-side calculation engine
   Replicates the client-side `useUnifiedCalculation` + `useReferenceMap` without React hooks.
   - Builds complete reference map (V, S, C, F, I, T, L refs) from raw JSON
   - Topological sort with SHIFT-cycle detection
   - Evaluates all calculations + modules in dependency order
   - Returns `{ calculationResults, moduleOutputs, timeline, referenceMap }`

2. **`utils/excelFormulaConverter.js`** — GlassBox → Excel formula converter
   - `buildRefMap(sheetLayout)` — maps every GlassBox ref to an Excel sheet+row
   - `convertFormula(formula, refMap, periodIndex, calcsSheet)` — returns Excel formula string
   - `canConvertToExcel(formula)` — filters out unconvertible formulas (CUMPROD_Y, CUMSUM_Y)

3. **`app/api/export/excel/route.js`** — XLSX generator (7 sheets)

### Seven Sheets

| # | Sheet Name     | Contents                                                    |
|---|----------------|-------------------------------------------------------------|
| 1 | Constants      | C1.x values in col C, formula-replicated across period cols |
| 2 | CAPEX          | V1.x time series (static monthly data)                     |
| 3 | OPEX           | S1.x time series (static monthly data)                     |
| 4 | Flags & Time   | F, F.Start, F.End, I, T.*, L refs (static data)            |
| 5 | Modules        | Pre-computed M*.* outputs (too complex for Excel formulas)  |
| 6 | Calcs          | **Working Excel formulas** referencing sheets 1-5           |
| 7 | Summary        | Export metadata and sheet guide                             |

### Formula Conversion Rules

| GlassBox                | Excel                                                      |
|-------------------------|-------------------------------------------------------------|
| `R4 + R7`               | `D$6+D$12` (same-sheet row refs)                            |
| `C1.10`                 | `'Constants'!D$7`                                           |
| `V1`                    | `'CAPEX'!D$15`                                              |
| `F6`                    | `'Flags & Time'!D$8`                                        |
| `CUMSUM(R81)`           | `SUM($D$row:D$row)` (expanding running range)               |
| `CUMSUM(1)`             | `(COLUMN()-COLUMN($D$1)+1)*1`                               |
| `CUMSUM(R3 * F1)`       | `SUMPRODUCT($D$r1:D$r1,$D$r2:D$r2)` (2-ref product)        |
| `CUMSUM(R144 + R146)`   | `SUM($D$r1:D$r1)+SUM($D$r2:D$r2)` (sum of running SUMs)    |
| `CUMPROD(X)`            | `PRODUCT($D$row:D$row)` (simple refs only)                  |
| `SHIFT(R84, 1)`         | `C$row` (one column to the left)                            |
| `COUNT(X)`              | `COUNTIF($D$row:D$row,"<>0")`                               |
| `MIN/MAX/ABS`           | Same names (native Excel)                                   |
| `^`                     | `^` (same in Excel)                                         |

### What Can't Be Excel Formulas

- **Module outputs (M*.*)** — iterative debt sizing uses binary search, distributions have lock-up logic
- **CUMPROD_Y / CUMSUM_Y** — year-boundary detection requires VBA or helper columns
- **3+ term compound CUMSUM/CUMPROD** — e.g., `CUMSUM(S3 * I2 * F1)` (could extend with SUMPRODUCT of 3 ranges)
- **CUMPROD of compound expressions** — e.g., `CUMPROD(1 - F2 + F2 * R111)`

These fall back to **static pre-computed values** styled with amber background + italic gray text so they're visually distinct.

### Coverage

- **98% formula coverage** (139/148 calc rows have live formulas; 6 are trivial zeros, 3 are genuinely complex)
- ~44,000 formula cells + ~1,000 styled-static cells + ~2,000 zero cells

## XLSX Format Details

### Office Open XML Structure

The file is a ZIP containing XML files. Built without any npm dependency — hand-crafted ZIP archive with CRC32.

```
[Content_Types].xml          — Sheet content type declarations
_rels/.rels                  — Root relationship
xl/workbook.xml              — Sheet names and IDs
xl/_rels/workbook.xml.rels   — Sheet + sharedStrings + styles relationships
xl/styles.xml                — Font/fill/cell format definitions
xl/sharedStrings.xml         — Shared string table (all text cells reference this)
xl/worksheets/sheet1-7.xml   — Sheet data
```

### Cell Types in XML

```xml
<!-- String (shared string index) -->
<c r="A1" t="s"><v>0</v></c>

<!-- Number -->
<c r="D2"><v>123.45</v></c>

<!-- Formula -->
<c r="D3"><f>SUM($D$5:D$5)</f></c>

<!-- Static pre-computed (style 2 = amber bg + italic gray) -->
<c r="D4" s="2"><v>67.89</v></c>
```

### Styles

| Index | Font             | Fill          | Use                          |
|-------|------------------|---------------|------------------------------|
| 0     | Calibri 11       | none          | Normal cells                 |
| 1     | Calibri 11 bold  | none          | Headers                      |
| 2     | Calibri 11 italic gray (#888) | amber (#FFF3E0) | Static pre-computed values |

### Sheet Layout Convention

- **Row 1**: Header (Ref, Name, [extra cols], period labels...)
- **Row 2+**: Data rows
- **Columns A-C**: Metadata (Ref, Name, Formula/Unit/Type)
- **Column D onward**: Period data (one column per month, 2027-04 through 2060-03)

### Reference Map Construction

The formula converter needs to know which Excel row each GlassBox ref lives on. This is built by:

1. Each sheet builder returns `refRows: [{ ref: 'C1.10', row: 3 }, ...]`
2. All ref rows are assembled into a `sheetLayout` object keyed by sheet
3. `buildRefMap(sheetLayout)` creates a `Map<ref, { sheet, row }>`
4. Calcs sheet refs are pre-registered before building (since formulas reference each other)

### Constants Sheet Trick

Constants have a single value in column C, with all period columns containing `=$C$n` (formula referencing the value cell). This means:
- Changing the value in column C automatically updates all period columns
- Calcs formulas reference the period column (not column C directly), so cross-sheet refs are uniform

## How to Extend

### Adding a New Sheet

1. Add to `sheetNames` array in `generateXlsxFiles()`
2. Build the sheet data (array of rows)
3. Add to `sheetData` array in matching position
4. If it contains refs used by formulas, add to `sheetLayout` before building Calcs

### Supporting a New Array Function

1. Add conversion in `excelFormulaConverter.js` → `processNestedFunction()` calls
2. Update `canConvertToExcel()` if the function was previously blocked

### Supporting CUMPROD of Compound Expressions

Would need hidden helper rows:
1. Generate a helper row computing the inner expression per period
2. Apply PRODUCT over the helper row's running range
3. Track helper rows in `buildCalcsSheet` and insert them (hidden) into the sheet

### Supporting 3-Way SUMPRODUCT

Extend the CUMSUM compound handler to match 3-term products:
```javascript
const triple = trimmed.match(/^(\w+)\s*\*\s*(\w+)\s*\*\s*(\w+)$/i)
if (triple) { /* SUMPRODUCT of 3 running ranges */ }
```
