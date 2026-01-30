#!/usr/bin/env python3
"""
Run the Glassbox model and print key results.

Usage:
    python run_model.py                 # Run base case
    python run_model.py --tornado       # Run tornado sensitivity
    python run_model.py --scenarios     # Run named scenarios
    python run_model.py --grid          # Run combinatorial grid
    python run_model.py --export FILE   # Export full results to CSV/Excel/JSON
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
    print(f'\r  [{bar}] {current}/{total} {label}', end='', flush=True)
    if current == total:
        print()


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
    print('\n--- Key Results (annual sums where applicable) ---')
    calcs = engine._calcs_data.get('calculations', [])

    # Find some key calcs by common names
    key_names = [
        'Revenue', 'Total Revenue', 'EBITDA', 'Net Profit', 'NPAT',
        'CFADS', 'Total CFADS', 'Contracted CFADS', 'Merchant CFADS',
        'DSCR', 'Project DSCR', 'Period DSCR',
        'Equity IRR', 'Project IRR',
        'Total Debt Service', 'Interest Expense',
        'Depreciation', 'Tax Expense',
        'Dividend', 'Dividends',
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
                    mean = float(arr.mean())
                    mn = float(arr.min())
                    mx = float(arr.max())
                    nonzero = int((arr != 0).sum())
                    print(f'  {ref:8s} {c["name"]:30s}  sum={total:>14.2f}  mean={mean:>10.4f}  min={mn:>10.4f}  max={mx:>10.4f}  nonzero={nonzero}')
                    printed.add(c['id'])
                break

    return engine


def run_tornado(data_dir: str, export_path: str | None = None):
    """Run tornado sensitivity analysis."""
    print('Setting up tornado analysis...')
    sm = ScenarioManager(data_dir)

    # Define sensitivities (common project finance variables)
    sm.add_sensitivity('C1.19', 'Max Gearing (%)', [50, 55, 60, 65, 70, 75, 80])
    sm.add_sensitivity('C1.24', 'Depreciation Life (years)', [15, 20, 25, 30])

    # Define outputs to measure
    sm.add_output('R4', 'Revenue', metric='sum')

    print(f'Running {sum(len(s.values) for s in sm._sensitivities)} sensitivity cases...')
    t0 = time.time()
    results = sm.run_tornado(progress_callback=print_progress)
    elapsed = time.time() - t0
    print(f'Done in {elapsed:.2f}s')

    # Print results
    print('\n--- Tornado Results ---')
    print(f'Base case: {results["base"]}')
    for sens in results['sensitivities']:
        print(f'\n{sens["name"]} (base={sens["base_value"]}):')
        for r in sens['results']:
            print(f'  {r["input_value"]:>8} -> {r["outputs"]}')

    if export_path:
        if export_path.endswith('.xlsx'):
            sm.export_excel(results, export_path)
        elif export_path.endswith('.json'):
            sm.export_json(results, export_path)
        else:
            sm.export_csv(results, export_path)
        print(f'\nExported to {export_path}')

    return results


def run_scenarios(data_dir: str, export_path: str | None = None):
    """Run named scenarios."""
    print('Setting up scenario analysis...')
    sm = ScenarioManager(data_dir)

    # Define scenarios
    sm.add_scenario('Base Case', {})
    sm.add_scenario('Downside - Low Gearing', {'C1.19': 50})
    sm.add_scenario('Upside - High Gearing', {'C1.19': 80})

    # Define outputs
    sm.add_output('R4', 'Revenue', metric='sum')

    print(f'Running {len(sm._scenarios)} scenarios...')
    t0 = time.time()
    results = sm.run_scenarios(progress_callback=print_progress)
    elapsed = time.time() - t0
    print(f'Done in {elapsed:.2f}s')

    print('\n--- Scenario Results ---')
    print(f'Base: {results["base"]}')
    for s in results['scenarios']:
        print(f'{s["name"]:30s} -> {s["outputs"]}')

    if export_path:
        sm.export_csv(results, export_path)
        print(f'\nExported to {export_path}')

    return results


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
        print('Grid analysis - configure sensitivities in run_model.py')
    else:
        run_base_case(args.data_dir)


if __name__ == '__main__':
    main()
