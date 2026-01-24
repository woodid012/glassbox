# Model Summary (Auto-generated)
Generated: 2026-01-24T21:11:43.366Z

## Key Periods (Flags)
| Flag | Name | Periods | Start | End |
|------|------|---------|-------|-----|
| F1 | Construction | 18 | 2027-04 | 2028-09 |
| F2 | Total Operations | 301 | 2028-10 | 2053-10 |
| F3 | Normal Operations | 240 | 2028-10 | 2048-09 |
| F4 | Life Extension | 60 | 2048-10 | 2053-09 |
| F5 | Terminal Value | 1 | 2053-09 | 2053-09 |
| F6 | Revenue Periods | 300 | 2028-10 | 2053-09 |
| F7 | Offtake | 120 | 2028-10 | 2038-09 |
| F8 | Merchant | 180 | 2038-10 | 2053-09 |
| F9 | Debt Facilities | 258 | 2027-04 | 2048-09 |
| F10 | Construction Facility | 18 | 2027-04 | 2028-09 |
| F11 | Ops Debt | 240 | 2028-10 | 2048-09 |

## Constants (C1.X)
| Ref | Name | Value |
|-----|------|-------|
| C1.1 | Capacity (MW) | 70 |
| C1.2 | Storage Hours | 3 |
| C1.3 | Energy Storage (MWh) | 210 |
| C1.4 | Cycles Per Day | 1 |
| C1.5 | Annual Energy (MWh) | 76650 |
| C1.10 | Tolling Cost ($/MW/hr) | 21 |
| C1.11 | Tax Rate (%) | 30 |
| C1.12 | WACC (%) | 8 |
| C1.13 | Receivable Days | 30 |
| C1.14 | Payable Days | 30 |
| C1.15 | GST Rate (%) | 10 |
| C1.16 | DSRA Months Cover | 6 |
| C1.17 | MRA Target ($) | 3.5 |
| C1.18 | Min Cash Balance | 5 |
| C1.19 | Max Gearing (%) | 65 |
| C1.20 | Construction Interest Rate (%) | 7 |
| C1.21 | Operations Interest Rate (%) | 5 |
| C1.23 | Contingency (%) | 10 |
| C1.24 | Depreciation Life (Years) | 15 |
| C1.25 | Contracted DSCR Target | 1.4 |
| C1.26 | Uncontracted DSCR Target | 1.9 |
| C1.27 | Debt Tenor (Years) | 18 |

## Calculations (R#)
| ID | Name | Formula |
|-----|------|---------|
| R119 | Model Period | `CUMSUM(1)` |
| R120 | Ops Period | `CUMSUM(F2)` |
| R3 | Capex + Cont | `V1 * (1 + C1.18 / 100)` |
| R112 | Capex to Apply GST | `V1 - V1.1 - V1.9` |
| R4 | Tolling Revenue | `C1.6 * C1.1 * T.HiY / T.MiY / 10^6 * F7 * I1` |
| R5 | FCAS Revenue | `L1.2 * C1.1 / T.MiY / 10^6 * F8 * I1` |
| R6 | Arb Revenue | `L1.1 * C1.1 / 10^6 / T.MiY * F8 * R12 * I1` |
| R7 | Merchant Revenue | `R5 + R6` |
| R8 | Total Revenue | `R4 + R7` |
| R9 | Total OPEX (Nominal) | `-S1 * I1` |
| R10 | Gross Margin | `R8 + R9` |
| R111 | Monthly Decay Factor | `(1 - L3.5/100) ^ (T.DiM/T.DiY)` |
| R11 | Degradation Index | `CUMPROD(1 - F2 + F2 * R111)` |
| R12 | OperatingAdjustment | `L3.1 / 100 * L3.2 / 100 * L3.3 / 100 * L3.4 / 1...` |
| R13 | EBITDA | `R10` |
| R14 | Depreciation | `-R82` |
| R15 | EBIT | `R13 + R14` |
| R16 | Interest Expense | `-R71` |
| R17 | EBT | `R15 + R16` |
| R18 | Tax Expense | `-R104` |
| R19 | Net Income | `R17 + R18` |
| R20 | EBITDA | `R13` |
| R21 | WC Movement | `-R98` |
| R22 | Operating CF | `R20 + R21` |
| R23 | Capex | `-V1 * F1` |
| R24 | GST Paid on Capex | `-R112 * C1.11 / 100 * F1` |
| R25 | GST Received | `SHIFT(R112 * C1.11 / 100 * F1, 1)` |
| R26 | MRA Contribution | `0` |
| R27 | MRA Release | `0` |
| R28 | Investing CF | `R23 + R24 + R25 + R26 + R27` |
| R29 | Construction Debt Drawdown | `R91` |
| R30 | Ops Debt Drawdown | `0` |
| R31 | Principal Repayment | `-R72` |
| R32 | Interest Paid | `-R71` |
| R33 | DSRA Contribution | `0` |
| R34 | DSRA Release | `0` |
| R60 | Capex + Contingency | `CUMSUM(R3 * F1)` |
| R113 | Capex to Apply GST (Cum) | `CUMSUM(R112 * F1)` |
| R61 | GST Paid | `R113 * C1.11 / 100` |
| R63 | IDC | `CUMSUM(R92)` |
| R64 | Total Uses | `R60 + R61 + R63` |
| R65 | GST Received | `R61` |
| R66 | Construction Debt | `R94` |
| R67 | Construction Equity | `R64 - R65 - R66` |
| R68 | Total Sources | `R65 + R66 + R67` |
| R35 | Construction Equity Injection | `V1 * F1 - R91` |
| R39 | Financing CF | `R29 + R30 + R31 + R32 + R33 + R34 + R35` |
| R40 | Net Cashflow | `R22 + R28 + R39` |
| R41 | Opening Cash | `CUMSUM(R40) - R40` |
| R42 | Closing Cash | `CUMSUM(R40)` |
| ... | (37 more) | ... |