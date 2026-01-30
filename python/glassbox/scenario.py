"""
Scenario Manager - runs sensitivity analyses across input variations.

Supports:
- Single-variable sensitivities (tornado charts)
- Multi-variable scenarios (named cases)
- Grid/combinatorial sweeps
- Output collection and export to CSV/Excel
"""

import csv
import itertools
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from .engine import GlassboxEngine


@dataclass
class Sensitivity:
    """A single input sensitivity definition."""
    ref: str           # Input reference (e.g., 'C1.19', 'C1.24')
    name: str          # Human-readable name
    values: list       # Values to test (e.g., [50, 55, 60, 65, 70])
    base_value: float | None = None  # Base case value (auto-detected if None)
    mode: str = 'absolute'  # 'absolute' = set value, 'scale' = multiply base by factor


@dataclass
class Scenario:
    """A named scenario with multiple input overrides."""
    name: str
    overrides: dict[str, float]  # ref -> value (absolute)
    scales: dict[str, float] | None = None  # ref -> multiplier (e.g., 1.2 = +20%)


@dataclass
class OutputSpec:
    """Specifies which outputs to collect from each run."""
    ref: str               # Calculation reference (e.g., 'R4', 'R118')
    name: str              # Human-readable name
    metric: str = 'sum'    # Aggregation: 'sum', 'mean', 'min', 'max', 'last', 'first', 'irr', 'array'
    periods: tuple | None = None  # Optional period range (start, end) to restrict aggregation


def _aggregate(arr: np.ndarray, metric: str, periods: tuple | None = None) -> Any:
    """Aggregate an array according to the metric."""
    if periods:
        start, end = periods
        arr = arr[start:end+1]

    if metric == 'sum':
        return float(np.sum(arr))
    elif metric == 'mean':
        return float(np.mean(arr))
    elif metric == 'min':
        return float(np.min(arr))
    elif metric == 'max':
        return float(np.max(arr))
    elif metric == 'last':
        return float(arr[-1]) if len(arr) > 0 else 0.0
    elif metric == 'first':
        return float(arr[0]) if len(arr) > 0 else 0.0
    elif metric == 'npv':
        # Simple NPV at 10% annual (monthly discount)
        rate = 0.10 / 12
        discounts = np.array([(1 + rate) ** -i for i in range(len(arr))])
        return float(np.sum(arr * discounts))
    elif metric == 'array':
        return arr.tolist()
    else:
        return float(np.sum(arr))


class ScenarioManager:
    """
    Runs sensitivity analyses using the GlassboxEngine.

    Usage:
        sm = ScenarioManager('/path/to/data')

        # Define what to vary
        sm.add_sensitivity('C1.19', 'Max Gearing (%)', [50, 55, 60, 65, 70])
        sm.add_sensitivity('C1.24', 'Depreciation Life', [15, 20, 25, 30])

        # Define what to measure
        sm.add_output('R4', 'Revenue', metric='sum')
        sm.add_output('R118', 'Project DSCR', metric='min')

        # Run single-variable tornado
        tornado_results = sm.run_tornado()

        # Run combinatorial grid
        grid_results = sm.run_grid()

        # Export
        sm.export_csv(grid_results, 'results.csv')
    """

    def __init__(self, data_dir: str | Path | None = None,
                 inputs_data: dict | None = None,
                 calcs_data: dict | None = None):
        self._data_dir = data_dir
        self._inputs_data = inputs_data
        self._calcs_data = calcs_data
        self._sensitivities: list[Sensitivity] = []
        self._scenarios: list[Scenario] = []
        self._outputs: list[OutputSpec] = []

        # Load data once to detect base values
        self._base_engine = self._create_engine()

    def _create_engine(self) -> GlassboxEngine:
        """Create a fresh engine instance."""
        return GlassboxEngine(
            data_dir=self._data_dir,
            inputs_data=self._inputs_data,
            calcs_data=self._calcs_data,
        )

    def add_sensitivity(self, ref: str, name: str, values: list, base_value: float | None = None) -> None:
        """Add a sensitivity with absolute values."""
        self._sensitivities.append(Sensitivity(ref=ref, name=name, values=values, base_value=base_value))

    def add_sensitivity_scale(self, ref: str, name: str, factors: list) -> None:
        """Add a sensitivity that scales the base array by factors.

        Args:
            ref: Input reference (e.g., 'V1' for total CAPEX array)
            name: Human-readable name
            factors: Multipliers to test (e.g., [0.8, 0.9, 1.0, 1.1, 1.2] for -20% to +20%)
        """
        self._sensitivities.append(Sensitivity(ref=ref, name=name, values=factors, mode='scale'))

    def add_scenario(self, name: str, overrides: dict[str, float] | None = None,
                     scales: dict[str, float] | None = None) -> None:
        """Add a named scenario with absolute overrides and/or scaling factors.

        Args:
            name: Scenario name
            overrides: ref -> absolute value
            scales: ref -> multiplier (e.g., {'V1': 1.2} = +20% CAPEX)
        """
        self._scenarios.append(Scenario(name=name, overrides=overrides or {}, scales=scales))

    def add_output(self, ref: str, name: str, metric: str = 'sum', periods: tuple | None = None) -> None:
        """Add an output metric to collect."""
        self._outputs.append(OutputSpec(ref=ref, name=name, metric=metric, periods=periods))

    def _run_single(self, overrides: dict[str, float | np.ndarray] | None = None,
                     scales: dict[str, float] | None = None) -> dict[str, Any]:
        """Run engine with overrides and/or scaling factors, collect outputs.

        Args:
            overrides: ref -> absolute value (scalar or array)
            scales: ref -> multiplier applied to base array (e.g., 1.2 = +20%)
        """
        engine = self._create_engine()

        # Build reference map first so we have base arrays to scale
        engine._build_reference_map()

        # Apply absolute overrides
        if overrides:
            for ref, value in overrides.items():
                engine.override_input(ref, value)

        # Apply scaling factors (multiply existing base arrays)
        # When scaling a group ref (e.g., 'L1', 'V1', 'S1'), also scale all
        # child refs that share the same prefix (e.g., L1.1, L1.2, L1.1.1)
        if scales:
            for ref, factor in scales.items():
                prefix = ref + '.'
                scaled_any = False
                for ctx_ref in list(engine.context.keys()):
                    if ctx_ref == ref or ctx_ref.startswith(prefix):
                        base = engine.context[ctx_ref]
                        if base is not None and hasattr(base, '__mul__'):
                            engine.context[ctx_ref] = base * factor
                            scaled_any = True
                if not scaled_any:
                    # Fallback: try exact ref
                    base = engine.context.get(ref)
                    if base is not None:
                        engine.context[ref] = base * factor

        engine._evaluate_all()

        # Collect outputs
        result = {}
        for out in self._outputs:
            arr = engine.results.get(out.ref)
            if arr is None:
                arr = engine.module_outputs.get(out.ref)
            if arr is None:
                result[out.ref] = None
                continue
            result[out.ref] = _aggregate(arr, out.metric, out.periods)

        return result

    def run_base_case(self) -> dict[str, Any]:
        """Run the base case (no overrides) and return outputs."""
        return self._run_single({})

    def run_tornado(self, progress_callback=None) -> dict:
        """
        Run single-variable sensitivities (tornado analysis).

        For each sensitivity, varies that input while keeping others at base.
        Returns dict with structure:
        {
            'base': { ref: value, ... },
            'sensitivities': [
                {
                    'ref': 'C1.19',
                    'name': 'Max Gearing (%)',
                    'base_value': 65,
                    'results': [
                        { 'input_value': 50, 'outputs': { ref: value, ... } },
                        { 'input_value': 55, 'outputs': { ref: value, ... } },
                        ...
                    ]
                },
                ...
            ]
        }
        """
        # Run base case
        base_results = self._run_single({})
        total_runs = sum(len(s.values) for s in self._sensitivities)
        current_run = 0

        output = {
            'base': base_results,
            'sensitivities': [],
        }

        for sens in self._sensitivities:
            sens_result = {
                'ref': sens.ref,
                'name': sens.name,
                'base_value': sens.base_value,
                'results': [],
            }

            for val in sens.values:
                current_run += 1
                label = f'{sens.name}=x{val:.2f}' if sens.mode == 'scale' else f'{sens.name}={val}'
                if progress_callback:
                    progress_callback(current_run, total_runs, label)

                if sens.mode == 'scale':
                    results = self._run_single(scales={sens.ref: val})
                else:
                    results = self._run_single(overrides={sens.ref: val})
                sens_result['results'].append({
                    'input_value': val,
                    'outputs': results,
                })

            output['sensitivities'].append(sens_result)

        return output

    def run_scenarios(self, progress_callback=None) -> dict:
        """
        Run named scenarios.

        Returns:
        {
            'base': { ref: value, ... },
            'scenarios': [
                { 'name': 'Downside', 'overrides': {...}, 'outputs': { ref: value, ... } },
                ...
            ]
        }
        """
        base_results = self._run_single({})

        output = {
            'base': base_results,
            'scenarios': [],
        }

        for i, scenario in enumerate(self._scenarios):
            if progress_callback:
                progress_callback(i + 1, len(self._scenarios), scenario.name)

            results = self._run_single(
                overrides=scenario.overrides if scenario.overrides else None,
                scales=scenario.scales,
            )
            output['scenarios'].append({
                'name': scenario.name,
                'overrides': scenario.overrides,
                'scales': scenario.scales,
                'outputs': results,
            })

        return output

    def run_grid(self, progress_callback=None) -> dict:
        """
        Run full combinatorial grid of all sensitivities.

        Returns:
        {
            'dimensions': [ { 'ref': ..., 'name': ..., 'values': [...] }, ... ],
            'results': [
                { 'inputs': { ref: value, ... }, 'outputs': { ref: value, ... } },
                ...
            ]
        }
        """
        if not self._sensitivities:
            return {'dimensions': [], 'results': []}

        # Build all combinations
        value_lists = [s.values for s in self._sensitivities]
        combinations = list(itertools.product(*value_lists))
        total = len(combinations)

        output = {
            'dimensions': [
                {'ref': s.ref, 'name': s.name, 'values': s.values}
                for s in self._sensitivities
            ],
            'results': [],
        }

        for idx, combo in enumerate(combinations):
            if progress_callback:
                progress_callback(idx + 1, total, str(combo))

            overrides = {}
            scale_overrides = {}
            inputs_record = {}
            for i, sens in enumerate(self._sensitivities):
                if sens.mode == 'scale':
                    scale_overrides[sens.ref] = combo[i]
                else:
                    overrides[sens.ref] = combo[i]
                inputs_record[sens.ref] = combo[i]

            results = self._run_single(
                overrides=overrides if overrides else None,
                scales=scale_overrides if scale_overrides else None,
            )
            output['results'].append({
                'inputs': inputs_record,
                'outputs': results,
            })

        return output

    def run_monte_carlo(self, n_samples: int = 100,
                        distributions: dict | None = None,
                        seed: int | None = None,
                        progress_callback=None) -> dict:
        """
        Run Monte Carlo simulation with random sampling.

        Args:
            n_samples: Number of random samples
            distributions: Dict of ref -> (distribution_type, params)
                e.g., {'C1.19': ('uniform', 50, 70), 'C1.24': ('normal', 20, 5)}
                Supported: 'uniform' (low, high), 'normal' (mean, std),
                           'triangular' (low, mode, high)
            seed: Random seed for reproducibility

        Returns:
            { 'samples': [ { 'inputs': {...}, 'outputs': {...} }, ... ] }
        """
        if distributions is None:
            # Default: use sensitivity ranges as uniform distributions
            distributions = {}
            for s in self._sensitivities:
                if len(s.values) >= 2:
                    distributions[s.ref] = ('uniform', min(s.values), max(s.values))

        rng = np.random.default_rng(seed)
        output = {'samples': [], 'input_refs': list(distributions.keys())}

        for i in range(n_samples):
            if progress_callback:
                progress_callback(i + 1, n_samples, f'Sample {i+1}')

            overrides = {}
            inputs_record = {}
            for ref, dist in distributions.items():
                dist_type = dist[0]
                if dist_type == 'uniform':
                    val = rng.uniform(dist[1], dist[2])
                elif dist_type == 'normal':
                    val = rng.normal(dist[1], dist[2])
                elif dist_type == 'triangular':
                    val = rng.triangular(dist[1], dist[2], dist[3])
                else:
                    val = dist[1] if len(dist) > 1 else 0
                overrides[ref] = val
                inputs_record[ref] = float(val)

            results = self._run_single(overrides)
            output['samples'].append({
                'inputs': inputs_record,
                'outputs': results,
            })

        return output

    # ------------------------------------------------------------------
    # Export helpers
    # ------------------------------------------------------------------

    @staticmethod
    def export_csv(results: dict, filepath: str) -> None:
        """Export grid or scenario results to CSV."""
        filepath = Path(filepath)

        if 'results' in results and 'dimensions' in results:
            # Grid results
            dims = results['dimensions']
            rows = results['results']
            if not rows:
                return

            input_cols = [d['ref'] for d in dims]
            input_names = [d['name'] for d in dims]
            output_cols = list(rows[0]['outputs'].keys())

            with open(filepath, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(input_names + output_cols)
                for row in rows:
                    input_vals = [row['inputs'].get(c, '') for c in input_cols]
                    output_vals = [row['outputs'].get(c, '') for c in output_cols]
                    writer.writerow(input_vals + output_vals)

        elif 'scenarios' in results:
            # Scenario results
            scenarios = results['scenarios']
            if not scenarios:
                return

            output_cols = list(scenarios[0]['outputs'].keys())

            with open(filepath, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['Scenario'] + output_cols)
                # Base case
                if results.get('base'):
                    writer.writerow(['Base'] + [results['base'].get(c, '') for c in output_cols])
                for s in scenarios:
                    writer.writerow([s['name']] + [s['outputs'].get(c, '') for c in output_cols])

        elif 'sensitivities' in results:
            # Tornado results
            with open(filepath, 'w', newline='') as f:
                writer = csv.writer(f)
                output_cols = list(results['base'].keys()) if results.get('base') else []
                writer.writerow(['Sensitivity', 'Input Value'] + output_cols)
                writer.writerow(['Base', ''] + [results['base'].get(c, '') for c in output_cols])
                for sens in results['sensitivities']:
                    for r in sens['results']:
                        writer.writerow(
                            [sens['name'], r['input_value']] +
                            [r['outputs'].get(c, '') for c in output_cols]
                        )

        elif 'samples' in results:
            # Monte Carlo results
            samples = results['samples']
            if not samples:
                return
            input_cols = results.get('input_refs', list(samples[0]['inputs'].keys()))
            output_cols = list(samples[0]['outputs'].keys())

            with open(filepath, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow([f'Input:{c}' for c in input_cols] + output_cols)
                for s in samples:
                    writer.writerow(
                        [s['inputs'].get(c, '') for c in input_cols] +
                        [s['outputs'].get(c, '') for c in output_cols]
                    )

    @staticmethod
    def export_excel(results: dict, filepath: str) -> None:
        """Export results to Excel. Requires openpyxl."""
        try:
            import openpyxl
        except ImportError:
            raise ImportError('openpyxl required for Excel export. Install: pip install openpyxl')

        wb = openpyxl.Workbook()
        ws = wb.active

        if 'results' in results and 'dimensions' in results:
            ws.title = 'Grid Results'
            dims = results['dimensions']
            rows = results['results']
            if rows:
                input_cols = [d['ref'] for d in dims]
                input_names = [d['name'] for d in dims]
                output_cols = list(rows[0]['outputs'].keys())
                ws.append(input_names + output_cols)
                for row in rows:
                    ws.append(
                        [row['inputs'].get(c, '') for c in input_cols] +
                        [row['outputs'].get(c, '') for c in output_cols]
                    )

        elif 'sensitivities' in results:
            ws.title = 'Tornado'
            output_cols = list(results['base'].keys()) if results.get('base') else []
            ws.append(['Sensitivity', 'Input Value'] + output_cols)
            ws.append(['Base', ''] + [results['base'].get(c, '') for c in output_cols])
            for sens in results['sensitivities']:
                for r in sens['results']:
                    ws.append(
                        [sens['name'], r['input_value']] +
                        [r['outputs'].get(c, '') for c in output_cols]
                    )

        elif 'scenarios' in results:
            ws.title = 'Scenarios'
            scenarios = results['scenarios']
            if scenarios:
                output_cols = list(scenarios[0]['outputs'].keys())
                ws.append(['Scenario'] + output_cols)
                if results.get('base'):
                    ws.append(['Base'] + [results['base'].get(c, '') for c in output_cols])
                for s in scenarios:
                    ws.append([s['name']] + [s['outputs'].get(c, '') for c in output_cols])

        elif 'samples' in results:
            ws.title = 'Monte Carlo'
            samples = results['samples']
            if samples:
                input_cols = results.get('input_refs', list(samples[0]['inputs'].keys()))
                output_cols = list(samples[0]['outputs'].keys())
                ws.append([f'Input:{c}' for c in input_cols] + output_cols)
                for s in samples:
                    ws.append(
                        [s['inputs'].get(c, '') for c in input_cols] +
                        [s['outputs'].get(c, '') for c in output_cols]
                    )

        wb.save(filepath)

    @staticmethod
    def export_json(results: dict, filepath: str) -> None:
        """Export results to JSON."""
        with open(filepath, 'w') as f:
            json.dump(results, f, indent=2, default=str)
