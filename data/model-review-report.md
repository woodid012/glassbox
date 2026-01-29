# Model Review Report

**Model:** GlassBox Project Finance Model
**Generated:** 2026-01-29 05:31:35
**Overall Completeness:** 99% (106/107)

## Summary

| Area | Matched | Total | Status |
|------|---------|-------|--------|
| Calculations | 85 | 85 | 100% |
| Modules | 8 | 8 | 100% |
| Inputs | 13 | 14 | 93% |

## Integrity Checks

- **Balance Sheet Balances** [???]: No calculation results available
- **Sources = Uses** [???]: No calculation results available

## Calculation Sections

### Income & Financial Statements (100%)

**Revenue** — 5/5

- [x] Total Revenue: R8 → R8 "Total Revenue" (ref)
- [x] Tolling Revenue: R4 → R4 "Tolling Revenue" (ref)
- [x] Merchant Revenue: R7 → R7 "Merchant Revenue" (ref)
- [x] FCAS Revenue: R5 → R5 "FCAS Revenue" (ref)
- [x] Market Arbitrage Revenue: R6 → R6 "Market Arbitrage Revenue" (ref)

**Profitability** — 9/9

- [x] Total OPEX: R9 → R9 "Total OPEX (Nominal)" (ref)
- [x] Gross Margin: R10 → R10 "Gross Margin" (ref)
- [x] EBITDA: R13 → R13 "EBITDA" (ref)
- [x] Depreciation (P&L): R14 → R14 "P&L Depreciation" (ref)
- [x] EBIT: R15 → R15 "EBIT" (ref)
- [x] Interest Expense: R16 → R16 "Interest Expense" (ref)
- [x] EBT: R17 → R17 "EBT" (ref)
- [x] Tax Expense: R18 → R18 "Tax Expense" (ref)
- [x] NPAT: R19 → R19 "NPAT" (ref)

**Retained Earnings** — 4/4

- [x] Prior RE: R20 → R20 "Operating CF EBITDA" (ref)
- [x] Dividends Declared: R21 → R21 "Operating CF WC Movement" (ref)
- [x] RE Movement: R23 → R23 "Capex" (ref)
- [x] RE Closing: R24 → R24 "GST Paid on Capex" (ref)

**Working Capital** — 4/4

- [x] Receivables: R91 → R95 "Receivables" (pattern)
- [x] Payables: R92 → R96 "Payables" (pattern)
- [x] Net Working Capital: R93 → R97 "Net Working Capital" (pattern)
- [x] Net WC Movement: R94 → R98 "Net WC Movement" (pattern)

**D&A** — 4/4

- [x] D&A Opening Book Value: R80 → R80 "D&A Opening Book Value" (ref)
- [x] D&A Asset Addition: R81 → R81 "D&A Asset Addition" (ref)
- [x] D&A Depreciation Expense: R82 → R82 "D&A Depreciation Expense" (ref)
- [x] D&A Closing Book Value: R84 → R84 "D&A Closing Book Value" (ref)

### Funding & Debt (100%)

**Sources & Uses** — 6/6

- [x] Total Uses: R64 → R64 "Total Uses" (ref)
- [x] Total Sources: R68 → R68 "Total Sources" (ref)
- [x] Sources = Uses Check: R69 → R69 "Sources = Uses Check" (ref)
- [x] Capex + Contingency: R55 → R60 "Capex + Contingency" (pattern)
- [x] Senior Debt: R66 → R66 "Senior Debt" (ref)
- [x] Committed Equity: R67 → R67 "Committed Equity" (ref)

**Operations Debt** — 5/5

- [x] Debt Opening Balance: R95 → R95 "Receivables" (ref)
- [x] Debt Interest Paid: R96 → R96 "Payables" (ref)
- [x] Debt Principal Repayment: R97 → R97 "Net Working Capital" (ref)
- [x] Debt Service (P+I): R98 → R98 "Net WC Movement" (ref)
- [x] Debt Closing Balance: R99 → R74 "Debt Closing Balance" (pattern)

**Covenants** — 2/2

- [x] DSCR: R118 → R118 "DSCR" (ref)
- [x] Total CFADS: R117 → R205 "Total CFADS" (pattern)

**Equity & Dividends** — 4/4

- [x] Equity Injections: R130 → R35 "Construction Equity Injection" (pattern)
- [x] Dividends: R124 → R133 "Dividends" (pattern)
- [x] Share Capital Repayment: R143 → R143 "Share Capital Returned" (ref)
- [x] Equity IRR: R136 → R136 "Terminal Value" (ref)

### Operations (100%)

**Technical** — 3/3

- [x] Model Period: R119 → R119 "Model Period" (ref)
- [x] Degradation Index: R11 → R11 "Degradation Index" (ref)
- [x] Operating Adjustment: R12 → R12 "Operating Adjustment" (ref)

**Opex** — 1/1

- [x] Agency Fee: R30 → R174 "Agency Fee" (pattern)

### Balance Sheet (100%)

**Assets** — 7/7

- [x] Cash & Cash Equivalents: R182 → R182 "Cash & Cash Equivalents" (ref)
- [x] Construction WIP: R196 → R196 "Construction WIP" (ref)
- [x] PP&E (Net Book Value): R183 → R183 "PP&E (Net Book Value)" (ref)
- [x] Trade Receivables: R184 → R184 "Trade Receivables" (ref)
- [x] GST Receivable: R185 → R185 "GST Receivable" (ref)
- [x] MRA Balance: R186 → R186 "MRA Balance" (ref)
- [x] Total Assets: R187 → R187 "Total Assets" (ref)

**Liabilities** — 4/4

- [x] Construction Debt: R198 → R198 "Construction Debt" (ref)
- [x] Operations Debt: R188 → R188 "Operations Debt" (ref)
- [x] Trade Payables: R189 → R189 "Trade Payables" (ref)
- [x] Total Liabilities: R190 → R190 "Total Liabilities" (ref)

**Equity** — 4/4

- [x] Share Capital: R191 → R191 "Share Capital" (ref)
- [x] Retained Earnings: R192 → R192 "Retained Earnings" (ref)
- [x] Total Equity: R193 → R193 "Total Equity" (ref)
- [x] Total L + E: R194 → R194 "Total L + E" (ref)

**Balance Check** — 1/1

- [x] Balance Check: R195 → R195 "Balance Check" (ref)

### Cash Flow Statement (100%)

**Operating CF** — 3/3

- [x] Operating CF EBITDA: R25 → R25 "GST Received (Operations)" (ref)
- [x] Operating CF WC Movement: R26 → R26 "MRA Contribution" (ref)
- [x] Operating CF: R28 → R28 "Investing CF" (ref)

**Investing CF** — 6/6

- [x] Capex: R31 → R31 "Principal Repayment" (ref)
- [x] GST Paid on Capex: R32 → R32 "Interest Paid" (ref)
- [x] GST Received: R33 → R33 "DSRA Contribution" (ref)
- [x] MRA Contribution: R34 → R34 "DSRA Release" (ref)
- [x] MRA Release: R35 → R35 "Construction Equity Injection" (ref)
- [x] Investing CF: R38 → R28 "Investing CF" (pattern)

**Financing CF** — 5/5

- [x] Construction Debt Drawdown: R40 → R40 "Net Cashflow" (ref)
- [x] Principal Repayment: R41 → R41 "Cash Opening Balance" (ref)
- [x] Interest Paid: R42 → R42 "Cash Closing Balance" (ref)
- [x] Dividends Paid: R51 → R51 "Discount Factor" (ref)
- [x] Financing CF: R76 → R39 "Financing CF" (pattern)

**Cash Position** — 3/3

- [x] Net Cashflow: R78 → R40 "Net Cashflow" (pattern)
- [x] Cash Opening Balance: R79 → R41 "Cash Opening Balance" (pattern)
- [x] Cash Closing Balance: R100 → R100 "Tax Taxable Income" (ref)

### Valuation (100%)

**Free Cash Flow** — 3/3

- [x] FCFF: R107 → R46 "FCFF" (pattern)
- [x] FCFE: R110 → R49 "FCFE" (pattern)
- [x] FCF EBITDA: R104 → R104 "Tax Payable" (ref)

**Discount Factors** — 2/2

- [x] Monthly Discount Rate: R113 → R50 "Monthly Discount Rate" (pattern)
- [x] Discount Factor: R114 → R51 "Discount Factor" (pattern)

## Modules

- [x] Iterative Debt Sizing (DSCR Sculpted) (iterative_debt_sizing): Active
- [x] Depreciation & Amortization (depreciation_amortization): Active
- [x] GST Paid/Received (gst_receivable): Active
- [x] Construction Funding (construction_funding): Active
- [x] Tax & Tax Losses (tax_losses): Disabled
- [x] MRA (Maintenance Reserve) (reserve_account): Active
- [x] Distributions (distributions): Active
- [x] DSRF (Debt Service Reserve Facility) (dsrf): Active

## Key Inputs

### Key Periods
- [x] Construction → "Construction" (id: 1)
- [x] Total Operations → "Total Operations" (id: 2)
- [x] Normal Operations → "Normal Operations" (id: 3)
- [x] Offtake → "Offtake" (id: 6)
- [x] Merchant → "Merchant" (id: 7)
- [x] Operations Debt → "Ops Debt" (id: 8)

### Constants
- [x] Battery Capacity (MW) → "Capacity (MW)" (id: 100)
- [ ] Tolling Rate ($/MW/hr) — MISSING
- [x] GST Rate (%) → "GST Rate (%)" (id: 114)
- [x] Tax Rate (%) → "Tax Rate (%)" (id: 110)
- [x] Contingency (%) → "Contingency (%)" (id: 122)
- [x] Depreciation Life → "Depreciation Life (Years)" (id: 123)
- [x] Contracted DSCR Target → "Contracted DSCR Target" (id: 124)
- [x] WACC / Discount Rate → "WACC (%)" (id: 111)

---
*Report generated by GlassBox Model Review. For deeper analysis, invoke the project-finance-validator agent.*