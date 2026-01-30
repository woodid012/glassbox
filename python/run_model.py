#!/usr/bin/env python3
"""
Run the Glassbox model and print key results.

Usage:
    python run_model.py                 # Run base case
    python run_model.py --tornado       # Run tornado sensitivity
    python run_model.py --scenarios     # Run named scenarios
    python run_model.py --grid          # Run combinatorial grid
    python run_model.py --export FILE   # Export results to CSV/Excel/JSON
"""

import argparse
import sys
import time
from pathlib import Path

# Add parent to path so we can import glassbox
sys.path.insert(0, str(Path(__file__).parent))

from glassbox import GlassboxEngine, ScenarioManager


def print_progress(current, total, label=''):
    bar_len = 30
    filled = int(bar_len * current / total)
    bar = '=' * filled + '-' * (bar_len - filled)
    print(f'\r  [{bar}] {current}/{total} {label:<50s}', end='', flush=True)
    if current == total:
        print()


# ---------------------------------------------------------------------------
# Standard output specs (reused across analysis modes)
# ---------------------------------------------------------------------------

def _add_standard_outputs(sm: ScenarioManager):
    """Add the standard set of output metrics to measure."""
    sm.add_output('R8',   'Total Revenue',       metric='sum')
    sm.add_output('R13',  'EBITDA',              metric='sum')
    sm.add_output('R19',  'NPAT',                metric='sum')
    sm.add_output('R205', 'Total CFADS',         metric='sum')
    sm.add_output('R115', 'Contracted CFADS',    metric='sum')
    sm.add_output('R116', 'Merchant CFADS',      metric='sum')
    sm.add_output('R9071','Min DSCR',            metric='min')
    sm.add_output('R178', 'Total Debt Service',  metric='sum')
    sm.add_output('R133', 'Dividends',           metric='sum')
    sm.add_output('R137', 'Net CF to Equity',    metric='sum')


def _print_output_row(label: str, outputs: dict, compact=False):
    """Print a single row of output results."""
    rev = outputs.get('R8', 0) or 0
    ebitda = outputs.get('R13', 0) or 0
    cfads = outputs.get('R205', 0) or 0
    dscr = outputs.get('R9071', 0) or 0
    divs = outputs.get('R133', 0) or 0
    if compact:
        print(f'  {label:45s}  Rev={rev:>8.2f}  EBITDA={ebitda:>8.2f}  CFADS={cfads:>8.2f}  MinDSCR={dscr:>6.2f}  Divs={divs:>8.2f}')
    else:
        npat = outputs.get('R19', 0) or 0
        ds = outputs.get('R178', 0) or 0
        ncf = outputs.get('R137', 0) or 0
        print(f'  {label:45s}')
        print(f'    Revenue={rev:>10.2f}  EBITDA={ebitda:>10.2f}  NPAT={npat:>10.2f}')
        print(f'    CFADS={cfads:>10.2f}  DS={ds:>10.2f}  MinDSCR={dscr:>8.4f}')
        print(f'    Divs={divs:>10.2f}  Net CF Equity={ncf:>10.2f}')


# ---------------------------------------------------------------------------
# Base case
# ---------------------------------------------------------------------------

def run_base_case(data_dir: str):
    """Run the base case model and print key outputs."""
    print('Loading model...')
    engine = GlassboxEngine(data_dir)

    print(f'Timeline: {engine.config["startYear"]}/{engine.config["startMonth"]} to '
          f'{engine.config["endYear"]}/{engine.config["endMonth"]} ({engine.periods} periods)')

    print('Running calculations...')
    t0 = time.time()
    engine.run()
    elapsed = time.time() - t0
    print(f'Done in {elapsed:.2f}s ({len(engine.results)} calculations evaluated)')

    if engine.errors:
        print(f'\nWarnings/Errors ({len(engine.errors)}):')
        for ref, err in list(engine.errors.items())[:10]:
            print(f'  {ref}: {err}')

    # Print summary of key calculations
    print('\n--- Key Results ---')
    calcs = engine._calcs_data.get('calculations', [])

    key_names = [
        'Total Revenue', 'Tolling Revenue', 'Merchant Revenue',
        'EBITDA', 'NPAT',
        'Total CFADS', 'Contracted CFADS', 'Merchant CFADS',
        'Total Debt Service', 'Interest Expense',
        'Dividends', 'Net Cash Flow to Equity',
        'Period DSCR',
        'Model Period',
    ]

    printed = set()
    for name in key_names:
        for c in calcs:
            if c['name'].lower() == name.lower() and c['id'] not in printed:
                ref = f'R{c["id"]}'
                arr = engine.results.get(ref)
                if arr is not None:
                    total = float(arr.sum())
                    mn = float(arr.min())
                    mx = float(arr.max())
                    nonzero = int((arr != 0).sum())
                    print(f'  {ref:8s} {c["name"]:35s}  sum={total:>12.2f}  min={mn:>10.4f}  max={mx:>10.4f}  nonzero={nonzero}')
                    printed.add(c['id'])
                break

    return engine


# ---------------------------------------------------------------------------
# Tornado sensitivity
# ---------------------------------------------------------------------------

def run_tornado(data_dir: str, export_path: str | None = None):
    """Run tornado sensitivity analysis across key project finance variables.

    Sensitivities:
    1. CAPEX          - Scale total V1 array by -20% to +20%
    2. OPEX           - Scale total S1 array (feeds into EBITDA, CFADS)
    3. Merchant Rev   - Scale market prices L1 (arb + FCAS)
    4. Tolling Price   - Vary C1.10 ($/MW/hr)
    5. Interest Rates  - Vary operations debt margin C1.33
    6. Max Gearing     - Vary C1.19 (% of project cost as debt)
    7. DSCR Target     - Vary C1.25 (contracted DSCR for debt sizing)
    """
    print('Setting up tornado analysis...')
    sm = ScenarioManager(data_dir)
    _add_standard_outputs(sm)

    # --- Capex: scale entire CAPEX array ---
    sm.add_sensitivity_scale('V1', 'CAPEX (scale)', [0.80, 0.90, 1.00, 1.10, 1.20])

    # --- Opex: scale entire OPEX array ---
    sm.add_sensitivity_scale('S1', 'OPEX (scale)', [0.80, 0.90, 1.00, 1.10, 1.20])

    # --- Merchant Revenue: scale market arb prices ---
    sm.add_sensitivity_scale('L1', 'Market Prices (scale)', [0.70, 0.85, 1.00, 1.15, 1.30])

    # --- Tolling Price (contracted revenue driver) ---
    # Base: C1.10 = 21 $/MW/hr
    sm.add_sensitivity('C1.10', 'Tolling Cost ($/MW/hr)', [15, 18, 21, 24, 27], base_value=21)

    # --- Interest Rates (ops debt margin) ---
    # Base: C1.33 = 1.75%
    sm.add_sensitivity('C1.33', 'Ops Debt Margin (%)', [1.25, 1.50, 1.75, 2.00, 2.25], base_value=1.75)

    # --- Gearing ---
    # Base: C1.19 = 65%
    sm.add_sensitivity('C1.19', 'Max Gearing (%)', [50, 55, 60, 65, 70, 75], base_value=65)

    # --- DSCR Target ---
    # Base: C1.25 = 1.40
    sm.add_sensitivity('C1.25', 'Contracted DSCR Target', [1.20, 1.30, 1.40, 1.50, 1.60], base_value=1.40)

    total_runs = sum(len(s.values) for s in sm._sensitivities)
    print(f'Running {total_runs} sensitivity cases across {len(sm._sensitivities)} variables...')
    t0 = time.time()
    results = sm.run_tornado(progress_callback=print_progress)
    elapsed = time.time() - t0
    print(f'Done in {elapsed:.1f}s')

    # Print results
    print('\n--- Tornado Results ---')
    print('\nBase case:')
    _print_output_row('Base', results['base'])

    for sens in results['sensitivities']:
        is_scale = any(s.mode == 'scale' and s.ref == sens['ref'] for s in sm._sensitivities)
        print(f'\n{sens["name"]}:')
        for r in sens['results']:
            val = r['input_value']
            if is_scale:
                label = f'x{val:.2f} ({val*100-100:+.0f}%)'
            else:
                label = str(val)
            _print_output_row(f'  {label}', r['outputs'], compact=True)

    if export_path:
        _export(sm, results, export_path)

    return results


# ---------------------------------------------------------------------------
# Named scenarios
# ---------------------------------------------------------------------------

def run_scenarios(data_dir: str, export_path: str | None = None):
    """Run named scenarios combining multiple variable changes.

    Scenarios represent realistic combined shifts:
    - Downside: higher capex, higher opex, lower prices, higher rates
    - Upside: lower capex, lower opex, higher prices, lower rates
    - Stress: extreme adverse conditions
    """
    print('Setting up scenario analysis...')
    sm = ScenarioManager(data_dir)
    _add_standard_outputs(sm)

    # Base case
    sm.add_scenario('Base Case')

    # --- Capex-driven scenarios ---
    sm.add_scenario('Capex +20%',
                    scales={'V1': 1.20})
    sm.add_scenario('Capex -20%',
                    scales={'V1': 0.80})

    # --- Opex-driven scenarios ---
    sm.add_scenario('Opex +20%',
                    scales={'S1': 1.20})
    sm.add_scenario('Opex -20%',
                    scales={'S1': 0.80})

    # --- Merchant revenue scenarios ---
    sm.add_scenario('Market Prices +30%',
                    scales={'L1': 1.30})
    sm.add_scenario('Market Prices -30%',
                    scales={'L1': 0.70})

    # --- Interest rate scenarios ---
    sm.add_scenario('High Interest (margin +50bps)',
                    overrides={'C1.33': 2.25, 'C1.32': 2.30})
    sm.add_scenario('Low Interest (margin -50bps)',
                    overrides={'C1.33': 1.25, 'C1.32': 1.30})

    # --- Combined downside ---
    sm.add_scenario('Downside Combined',
                    overrides={'C1.33': 2.25, 'C1.10': 18},
                    scales={'V1': 1.15, 'S1': 1.10, 'L1': 0.80})

    # --- Combined upside ---
    sm.add_scenario('Upside Combined',
                    overrides={'C1.33': 1.25, 'C1.10': 24},
                    scales={'V1': 0.90, 'S1': 0.90, 'L1': 1.20})

    # --- Stress test ---
    sm.add_scenario('Stress Test',
                    overrides={'C1.33': 2.50, 'C1.10': 15, 'C1.19': 55},
                    scales={'V1': 1.25, 'S1': 1.20, 'L1': 0.60})

    print(f'Running {len(sm._scenarios)} scenarios...')
    t0 = time.time()
    results = sm.run_scenarios(progress_callback=print_progress)
    elapsed = time.time() - t0
    print(f'Done in {elapsed:.1f}s')

    print('\n--- Scenario Results ---')
    print('\nBase case:')
    _print_output_row('Base', results['base'])

    for s in results['scenarios']:
        print()
        _print_output_row(s['name'], s['outputs'])

    if export_path:
        _export(sm, results, export_path)

    return results


# ---------------------------------------------------------------------------
# Grid analysis
# ---------------------------------------------------------------------------

def run_grid(data_dir: str, export_path: str | None = None):
    """Run combinatorial grid: Capex scale x Tolling Price x Gearing.

    3 x 3 x 3 = 27 combinations.
    """
    print('Setting up grid analysis...')
    sm = ScenarioManager(data_dir)
    _add_standard_outputs(sm)

    sm.add_sensitivity_scale('V1', 'CAPEX (scale)', [0.85, 1.00, 1.15])
    sm.add_sensitivity('C1.10', 'Tolling Cost ($/MW/hr)', [18, 21, 24])
    sm.add_sensitivity('C1.19', 'Max Gearing (%)', [55, 65, 75])

    total = 1
    for s in sm._sensitivities:
        total *= len(s.values)

    print(f'Running {total} grid combinations...')
    t0 = time.time()
    results = sm.run_grid(progress_callback=print_progress)
    elapsed = time.time() - t0
    print(f'Done in {elapsed:.1f}s')

    print('\n--- Grid Results (top 10 by EBITDA) ---')
    sorted_results = sorted(results['results'],
                           key=lambda r: r['outputs'].get('R13', 0) or 0,
                           reverse=True)
    for r in sorted_results[:10]:
        inputs_str = ', '.join(f'{k}={v}' for k, v in r['inputs'].items())
        _print_output_row(inputs_str, r['outputs'], compact=True)

    if export_path:
        _export(sm, results, export_path)

    return results


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _export(sm, results, export_path):
    """Export results to the appropriate format."""
    if export_path.endswith('.xlsx'):
        sm.export_excel(results, export_path)
    elif export_path.endswith('.json'):
        sm.export_json(results, export_path)
    else:
        sm.export_csv(results, export_path)
    print(f'\nExported to {export_path}')


def main():
    parser = argparse.ArgumentParser(description='Run Glassbox financial model')
    parser.add_argument('--data-dir', default=str(Path(__file__).parent.parent / 'data'),
                        help='Path to data directory')
    parser.add_argument('--tornado', action='store_true', help='Run tornado sensitivity')
    parser.add_argument('--scenarios', action='store_true', help='Run named scenarios')
    parser.add_argument('--grid', action='store_true', help='Run grid analysis')
    parser.add_argument('--export', type=str, default=None,
                        help='Export results to file (csv/xlsx/json)')
    parser.add_argument('--list-calcs', action='store_true',
                        help='List all calculations and exit')
    parser.add_argument('--list-refs', action='store_true',
                        help='List all input references and exit')

    args = parser.parse_args()

    if args.list_calcs:
        engine = GlassboxEngine(args.data_dir)
        for ref, name in engine.get_all_calculation_names():
            print(f'{ref:10s} {name}')
        return

    if args.list_refs:
        engine = GlassboxEngine(args.data_dir)
        engine._build_reference_map()
        for ref in sorted(engine.context.keys()):
            if isinstance(engine.context[ref], dict):
                continue
            arr = engine.context[ref]
            if hasattr(arr, '__len__'):
                print(f'{ref:15s} len={len(arr)}')
        return

    if args.tornado:
        run_tornado(args.data_dir, args.export)
    elif args.scenarios:
        run_scenarios(args.data_dir, args.export)
    elif args.grid:
        run_grid(args.data_dir, args.export)
    else:
        run_base_case(args.data_dir)


if __name__ == '__main__':
    main()
