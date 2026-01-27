// Python Generator - Generate a complete Python package from Glass Box model
// Creates model.py, evaluator.py, array_functions.py, and module implementations

import { toPython, extractReferences, topologicalSort, buildDependencyGraph } from './formulaConverter'

/**
 * Generate complete Python package from export bundle
 * @param {Object} bundle - Export bundle from generateExportBundle
 * @returns {Object} Map of filename -> content
 */
export function generatePythonPackage(bundle) {
    return {
        '__init__.py': generateInitPy(bundle),
        'model.py': generateModelPy(bundle),
        'evaluator.py': generateEvaluatorPy(bundle),
        'array_functions.py': generateArrayFunctionsPy(),
        'modules/__init__.py': '# Module implementations\n',
        'modules/debt_sizing.py': generateDebtSizingModule(),
        'modules/depreciation.py': generateDepreciationModule(),
        'modules/tax.py': generateTaxModule(),
        'modules/gst.py': generateGstModule(),
        'modules/construction_funding.py': generateConstructionFundingModule(),
        'data/inputs.json': JSON.stringify(bundle.inputs, null, 2),
        'data/calculations.json': JSON.stringify(bundle.calculations, null, 2),
        'data/modules.json': JSON.stringify(bundle.modules, null, 2),
        'data/timeline.json': JSON.stringify(bundle.timeline, null, 2),
        'data/key_periods.json': JSON.stringify(bundle.keyPeriods, null, 2),
        'data/indices.json': JSON.stringify(bundle.indices, null, 2),
        'data/reference_map.json': JSON.stringify(bundle.referenceMap, null, 2),
        'README.md': generateReadmeMd(bundle)
    }
}

/**
 * Generate __init__.py
 */
function generateInitPy(bundle) {
    return `"""
Glass Box Model Export
Exported: ${bundle.exported_at}
Version: ${bundle.version}

This package contains a Python implementation of the Glass Box financial model.
"""

from .model import GlassBoxModel
from .evaluator import FormulaEvaluator
from .array_functions import cumsum, cumprod, shift, count

__version__ = "${bundle.version}"
__all__ = ['GlassBoxModel', 'FormulaEvaluator', 'cumsum', 'cumprod', 'shift', 'count']
`
}

/**
 * Generate model.py - Main GlassBoxModel class
 */
function generateModelPy(bundle) {
    // Build calculation order
    const calcItems = bundle.calculations.items || {}
    const depGraph = buildDependencyGraph(calcItems)
    const calcOrder = topologicalSort(depGraph)

    return `"""
Glass Box Model - Main model class
Generated from Glass Box web application
"""

import json
import numpy as np
from pathlib import Path
from typing import Dict, Optional, Union, List
from .evaluator import FormulaEvaluator
from .modules.debt_sizing import calculate_iterative_debt_sizing
from .modules.depreciation import calculate_depreciation
from .modules.tax import calculate_tax_losses
from .modules.gst import calculate_gst_receivable
from .modules.construction_funding import calculate_construction_funding


class GlassBoxModel:
    """
    Glass Box Financial Model

    A fully transparent financial model where every calculation is traceable.

    Example usage:
        model = GlassBoxModel()
        results = model.evaluate()
        print(f"Total Revenue: {results['R8'].sum():.2f}")
        print(f"Closing Cash: {results['R42'][-1]:.2f}")
    """

    def __init__(self, data_dir: Optional[str] = None):
        """
        Initialize the model with data from JSON files.

        Args:
            data_dir: Path to data directory. Defaults to ./data relative to this file.
        """
        if data_dir is None:
            data_dir = Path(__file__).parent / 'data'
        else:
            data_dir = Path(data_dir)

        # Load model data
        with open(data_dir / 'inputs.json', 'r') as f:
            self.inputs = json.load(f)

        with open(data_dir / 'calculations.json', 'r') as f:
            self.calculations = json.load(f)

        with open(data_dir / 'modules.json', 'r') as f:
            self.modules = json.load(f)

        with open(data_dir / 'timeline.json', 'r') as f:
            self.timeline = json.load(f)

        self.periods = self.timeline['periods']
        self.evaluator = FormulaEvaluator(self.periods)

        # Pre-defined calculation order (topologically sorted)
        self.calc_order = ${JSON.stringify(calcOrder)}

    def _build_reference_map(self, overrides: Optional[Dict] = None) -> Dict[str, np.ndarray]:
        """
        Build the reference map containing all input arrays.
        Dynamically iterates through all input groups.

        Args:
            overrides: Optional dict of ref -> value to override inputs

        Returns:
            Dictionary mapping reference names to numpy arrays
        """
        refs = {}
        overrides = overrides or {}

        # Dynamically process all input groups
        for group_key, group_data in self.inputs.items():
            if not isinstance(group_data, dict):
                continue

            meta = group_data.get('_meta', {})
            entry_mode = meta.get('entryMode', 'series')

            for ref, data in group_data.items():
                if ref == '_meta':
                    continue
                if not isinstance(data, dict):
                    continue

                if entry_mode == 'constant':
                    # Constants have a single 'value'
                    value = overrides.get(ref, data.get('value', 0))
                    refs[ref] = np.full(self.periods, value)
                else:
                    # Series and lookups have 'values' array
                    if ref in overrides:
                        override_val = overrides[ref]
                        refs[ref] = np.array(override_val) if isinstance(override_val, list) else np.full(self.periods, override_val)
                    elif 'values' in data:
                        refs[ref] = np.array(data['values'])
                    elif 'value' in data:
                        refs[ref] = np.full(self.periods, data['value'])

        # Add key period flags (F{id}, F{id}.Start, F{id}.End)
        key_periods = self.inputs.get('_keyPeriods', {})
        for ref, data in key_periods.items():
            if isinstance(data, dict) and 'flag' in data:
                refs[ref] = np.array(data['flag'])
                refs[f"{ref}.Start"] = np.array(data.get('flagStart', [0] * self.periods))
                refs[f"{ref}.End"] = np.array(data.get('flagEnd', [0] * self.periods))

        # Add indices (I{id})
        indices = self.inputs.get('_indices', {})
        for ref, data in indices.items():
            if isinstance(data, dict):
                if ref in overrides:
                    override_val = overrides[ref]
                    refs[ref] = np.full(self.periods, override_val) if isinstance(override_val, (int, float)) else np.array(override_val)
                elif 'values' in data:
                    refs[ref] = np.array(data['values'])

        # Add time constants
        refs['T.MiY'] = np.full(self.periods, 12)
        refs['T.DiY'] = np.full(self.periods, 365)
        refs['T.DiM'] = np.full(self.periods, 30)
        refs['T.QiY'] = np.full(self.periods, 4)
        refs['T.HiD'] = np.full(self.periods, 24)
        refs['T.HiY'] = np.full(self.periods, 8760)
        refs['T.MiQ'] = np.full(self.periods, 3)

        # Add time flags
        month_array = np.array(self.timeline['month'])
        refs['T.QE'] = np.isin(month_array, [3, 6, 9, 12]).astype(float)
        refs['T.CYE'] = (month_array == 12).astype(float)
        refs['T.FYE'] = (month_array == 6).astype(float)

        # Add year array for year-boundary functions
        refs['_year'] = np.array(self.timeline['year'])

        return refs

    def _evaluate_calculations(self, refs: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """
        Evaluate all calculations in dependency order.
        First pass - module references return zeros.
        """
        results = {}

        # Initialize module outputs as zeros (will be filled in second pass)
        for mod in self.modules:
            for output in mod['outputs']:
                refs[output['ref']] = np.zeros(self.periods)

        # Evaluate calculations in order
        for ref in self.calc_order:
            calc = self.calculations['items'].get(ref)
            if calc:
                formula = calc['formula']
                try:
                    results[ref] = self.evaluator.evaluate(formula, {**refs, **results})
                except Exception as e:
                    print(f"Warning: Error evaluating {ref}: {e}")
                    results[ref] = np.zeros(self.periods)

        return results

    def _evaluate_modules(self, refs: Dict[str, np.ndarray], calc_results: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """
        Evaluate all modules using calculation results.
        """
        module_outputs = {}
        context = {**refs, **calc_results}

        for mod in self.modules:
            template_id = mod['templateId']
            inputs = mod['inputs']

            if template_id == 'iterative_debt_sizing':
                outputs = calculate_iterative_debt_sizing(inputs, self.periods, context, self.timeline)
            elif template_id == 'depreciation_amortization':
                outputs = calculate_depreciation(inputs, self.periods, context)
            elif template_id == 'tax_losses':
                outputs = calculate_tax_losses(inputs, self.periods, context)
            elif template_id == 'gst_receivable':
                outputs = calculate_gst_receivable(inputs, self.periods, context)
            elif template_id == 'construction_funding':
                outputs = calculate_construction_funding(inputs, self.periods, context)
            else:
                # Unknown module - return zeros
                outputs = {out['key']: np.zeros(self.periods) for out in mod['outputs']}

            # Map outputs to M{idx}.{output} references
            for i, out in enumerate(mod['outputs']):
                ref = f"M{mod['index']}.{i + 1}"
                module_outputs[ref] = outputs.get(out['key'], np.zeros(self.periods))

        return module_outputs

    def evaluate(self, overrides: Optional[Dict] = None) -> Dict[str, np.ndarray]:
        """
        Run the full model calculation.

        Args:
            overrides: Optional dict of ref -> value to override inputs

        Returns:
            Dictionary mapping calculation references to result arrays

        Example:
            results = model.evaluate()
            print(f"R8 sum: {results['R8'].sum()}")

            # With overrides
            results = model.evaluate({'C1.10': 150})  # Change tolling price
        """
        # Build reference map with any overrides
        refs = self._build_reference_map(overrides)

        # First pass: evaluate calculations (module refs return zeros)
        calc_results = self._evaluate_calculations(refs)

        # Evaluate modules using calculation results
        module_outputs = self._evaluate_modules(refs, calc_results)

        # Second pass: re-evaluate calculations that depend on modules
        refs.update(module_outputs)
        final_results = self._evaluate_calculations(refs)

        # Combine results
        final_results.update(module_outputs)

        return final_results

    def scenario(self, overrides: Dict) -> Dict[str, np.ndarray]:
        """
        Run model with input overrides for sensitivity analysis.

        Args:
            overrides: Dict of ref -> value to override

        Returns:
            Full results dictionary

        Example:
            # Sensitivity on DSCR target
            base = model.evaluate()
            high_dscr = model.scenario({'C1.25': 1.5})
            print(f"Debt change: {high_dscr['M1.1'][0] - base['M1.1'][0]:.2f}")
        """
        return self.evaluate(overrides)

    def get_result(self, ref: str, aggregation: str = 'M') -> Union[np.ndarray, float]:
        """
        Get a specific result with optional aggregation.

        Args:
            ref: Reference name (e.g., 'R8', 'M1.1')
            aggregation: 'M' (monthly), 'Q' (quarterly), 'Y' (yearly), 'total'

        Returns:
            Array or scalar depending on aggregation
        """
        results = self.evaluate()
        values = results.get(ref, np.zeros(self.periods))

        if aggregation == 'total':
            return values.sum()
        elif aggregation == 'Q':
            # Aggregate to quarterly
            n_quarters = self.periods // 3
            return np.array([values[i*3:(i+1)*3].sum() for i in range(n_quarters)])
        elif aggregation == 'Y':
            # Aggregate to yearly
            n_years = self.periods // 12
            return np.array([values[i*12:(i+1)*12].sum() for i in range(n_years)])
        else:
            return values

    def summary(self) -> Dict:
        """
        Get key model metrics summary.

        Returns:
            Dictionary of key metrics
        """
        results = self.evaluate()

        return {
            'total_revenue': results.get('R8', np.zeros(1)).sum(),
            'total_opex': results.get('R9', np.zeros(1)).sum(),
            'total_ebitda': results.get('R13', np.zeros(1)).sum(),
            'closing_cash': results.get('R42', np.zeros(1))[-1],
            'sized_debt': results.get('M1.1', np.zeros(1))[0] if 'M1.1' in results else 0,
            'total_capex': results.get('V1', np.zeros(1)).sum() if 'V1' in results else 0
        }


if __name__ == '__main__':
    # Quick test
    model = GlassBoxModel()
    results = model.evaluate()
    summary = model.summary()

    print("Glass Box Model Summary")
    print("=" * 40)
    for key, value in summary.items():
        print(f"{key}: {value:,.2f}")
`
}

/**
 * Generate evaluator.py - Formula evaluation engine
 */
function generateEvaluatorPy(bundle) {
    return `"""
Formula Evaluator - Evaluate Glass Box formulas in Python
"""

import numpy as np
import re
from typing import Dict, Callable
from .array_functions import cumsum, cumprod, cumsum_y, cumprod_y, shift, count


class FormulaEvaluator:
    """
    Evaluate Glass Box formulas with numpy arrays.
    """

    def __init__(self, periods: int):
        self.periods = periods
        self._formula_cache = {}

    def evaluate(self, formula: str, refs: Dict[str, np.ndarray]) -> np.ndarray:
        """
        Evaluate a formula and return result array.

        Args:
            formula: Glass Box formula string
            refs: Dictionary of reference arrays

        Returns:
            Numpy array of results
        """
        if not formula or formula.strip() == '0':
            return np.zeros(self.periods)

        # Process array functions first
        processed, array_results = self._process_array_functions(formula, refs)

        # Add array results to refs
        eval_refs = {**refs, **array_results}

        # Evaluate the expression for all periods
        return self._eval_expression(processed, eval_refs)

    def _process_array_functions(self, formula: str, refs: Dict[str, np.ndarray]):
        """
        Process array functions (CUMSUM, CUMPROD, SHIFT, etc.) and return
        processed formula with placeholders and results.
        """
        processed = formula
        array_results = {}
        counter = 0

        year_array = refs.get('_year', np.arange(self.periods))

        # CUMPROD_Y(expr)
        pattern = re.compile(r'CUMPROD_Y\\s*\\(([^)]+)\\)', re.IGNORECASE)
        while True:
            match = pattern.search(processed)
            if not match:
                break
            inner = match.group(1)
            inner_arr = self._eval_expression(inner, refs)
            result = cumprod_y(inner_arr, year_array)
            placeholder = f'__ARR{counter}__'
            array_results[placeholder] = result
            processed = processed[:match.start()] + placeholder + processed[match.end():]
            counter += 1

        # CUMPROD(expr)
        pattern = re.compile(r'CUMPROD\\s*\\(([^)]+)\\)', re.IGNORECASE)
        while True:
            match = pattern.search(processed)
            if not match:
                break
            inner = match.group(1)
            inner_arr = self._eval_expression(inner, refs)
            result = cumprod(inner_arr)
            placeholder = f'__ARR{counter}__'
            array_results[placeholder] = result
            processed = processed[:match.start()] + placeholder + processed[match.end():]
            counter += 1

        # CUMSUM_Y(expr)
        pattern = re.compile(r'CUMSUM_Y\\s*\\(([^)]+)\\)', re.IGNORECASE)
        while True:
            match = pattern.search(processed)
            if not match:
                break
            inner = match.group(1)
            inner_arr = self._eval_expression(inner, refs)
            result = cumsum_y(inner_arr, year_array)
            placeholder = f'__ARR{counter}__'
            array_results[placeholder] = result
            processed = processed[:match.start()] + placeholder + processed[match.end():]
            counter += 1

        # CUMSUM(expr)
        pattern = re.compile(r'CUMSUM\\s*\\(([^)]+)\\)', re.IGNORECASE)
        while True:
            match = pattern.search(processed)
            if not match:
                break
            inner = match.group(1)
            inner_arr = self._eval_expression(inner, refs)
            result = cumsum(inner_arr)
            placeholder = f'__ARR{counter}__'
            array_results[placeholder] = result
            processed = processed[:match.start()] + placeholder + processed[match.end():]
            counter += 1

        # SHIFT(expr, n)
        pattern = re.compile(r'SHIFT\\s*\\(\\s*([^,]+)\\s*,\\s*(\\d+)\\s*\\)', re.IGNORECASE)
        while True:
            match = pattern.search(processed)
            if not match:
                break
            inner = match.group(1)
            n = int(match.group(2))
            inner_arr = self._eval_expression(inner, refs)
            result = shift(inner_arr, n)
            placeholder = f'__ARR{counter}__'
            array_results[placeholder] = result
            processed = processed[:match.start()] + placeholder + processed[match.end():]
            counter += 1

        # COUNT(expr)
        pattern = re.compile(r'COUNT\\s*\\(([^)]+)\\)', re.IGNORECASE)
        while True:
            match = pattern.search(processed)
            if not match:
                break
            inner = match.group(1)
            inner_arr = self._eval_expression(inner, refs)
            result = count(inner_arr)
            placeholder = f'__ARR{counter}__'
            array_results[placeholder] = result
            processed = processed[:match.start()] + placeholder + processed[match.end():]
            counter += 1

        return processed, array_results

    def _eval_expression(self, expr: str, refs: Dict[str, np.ndarray]) -> np.ndarray:
        """
        Evaluate a simple expression (no array functions) for all periods.
        """
        if not expr.strip():
            return np.zeros(self.periods)

        # Check cache
        cache_key = expr

        # Convert to Python syntax
        py_expr = expr

        # Replace ^ with **
        py_expr = py_expr.replace('^', '**')

        # Convert MIN/MAX/ABS to numpy
        py_expr = re.sub(r'\\bMIN\\s*\\(', 'np.minimum(', py_expr, flags=re.IGNORECASE)
        py_expr = re.sub(r'\\bMAX\\s*\\(', 'np.maximum(', py_expr, flags=re.IGNORECASE)
        py_expr = re.sub(r'\\bABS\\s*\\(', 'np.abs(', py_expr, flags=re.IGNORECASE)

        # Sort refs by length (longer first) to avoid partial matches
        sorted_refs = sorted(refs.keys(), key=len, reverse=True)

        # Replace references with refs["ref"]
        for ref in sorted_refs:
            # Escape special regex characters in ref
            escaped_ref = re.escape(ref)
            py_expr = re.sub(f'\\\\b{escaped_ref}\\\\b', f'refs["{ref}"]', py_expr)

        # Replace any unresolved R-references with zeros
        py_expr = re.sub(r'\\bR\\d+\\b', 'np.zeros(periods)', py_expr)

        # Evaluate
        try:
            local_vars = {'refs': refs, 'np': np, 'periods': self.periods}
            result = eval(py_expr, {"__builtins__": {}}, local_vars)

            # Ensure result is an array of correct length
            if isinstance(result, (int, float)):
                result = np.full(self.periods, result)
            elif not isinstance(result, np.ndarray):
                result = np.array(result)

            # Handle NaN and Inf
            result = np.nan_to_num(result, nan=0.0, posinf=0.0, neginf=0.0)

            return result
        except Exception as e:
            # Return zeros on error
            return np.zeros(self.periods)
`
}

/**
 * Generate array_functions.py
 */
function generateArrayFunctionsPy() {
    return `"""
Array Functions - Numpy implementations of Glass Box array functions
"""

import numpy as np
from typing import Optional


def cumsum(arr: np.ndarray) -> np.ndarray:
    """
    Cumulative sum.

    CUMSUM([1, 2, 3, 4]) = [1, 3, 6, 10]
    """
    return np.cumsum(arr)


def cumprod(arr: np.ndarray) -> np.ndarray:
    """
    Cumulative product.

    CUMPROD([1, 2, 3, 4]) = [1, 2, 6, 24]
    """
    return np.cumprod(arr)


def cumsum_y(arr: np.ndarray, year_array: np.ndarray) -> np.ndarray:
    """
    Cumulative sum at year boundaries only.
    Adds the value only when the year changes.
    """
    result = np.zeros_like(arr)
    total = 0
    last_year = None
    last_year_value = None

    for i in range(len(arr)):
        current_year = year_array[i] if i < len(year_array) else None

        # Add value only when year changes (not on first period)
        if last_year is not None and current_year != last_year and last_year_value is not None:
            total += last_year_value

        result[i] = total

        # Track last year's value
        if current_year != last_year:
            last_year_value = arr[i]

        last_year = current_year

    return result


def cumprod_y(arr: np.ndarray, year_array: np.ndarray) -> np.ndarray:
    """
    Cumulative product at year boundaries only.
    Applies the factor only when the year changes.
    """
    result = np.zeros_like(arr)
    product = 1.0
    last_year = None
    last_year_value = None

    for i in range(len(arr)):
        current_year = year_array[i] if i < len(year_array) else None

        # Apply factor only when year changes (not on first period)
        if last_year is not None and current_year != last_year and last_year_value is not None:
            product *= last_year_value

        result[i] = product

        # Track last year's value
        if current_year != last_year:
            last_year_value = arr[i]

        last_year = current_year

    return result


def shift(arr: np.ndarray, n: int) -> np.ndarray:
    """
    Shift array forward by n periods, filling with 0.

    SHIFT([1, 2, 3, 4], 1) = [0, 1, 2, 3]
    SHIFT([1, 2, 3, 4], 2) = [0, 0, 1, 2]
    """
    result = np.zeros_like(arr)
    if n < len(arr):
        result[n:] = arr[:-n] if n > 0 else arr
    return result


def count(arr: np.ndarray) -> np.ndarray:
    """
    Cumulative count of non-zero values.

    COUNT([0, 5, 0, 10, 3]) = [0, 1, 1, 2, 3]
    """
    return np.cumsum(arr != 0).astype(float)
`
}

/**
 * Generate debt sizing module
 */
function generateDebtSizingModule() {
    return `"""
Iterative Debt Sizing Module
Binary search to find optimal debt with DSCR-sculpted repayments.
"""

import numpy as np
from typing import Dict, Any, Optional


def calculate_iterative_debt_sizing(
    inputs: Dict[str, Any],
    periods: int,
    context: Dict[str, np.ndarray],
    timeline: Optional[Dict] = None
) -> Dict[str, np.ndarray]:
    """
    Calculate iterative debt sizing with DSCR-sculpted repayments.

    Supports separate contracted and merchant CFADS with different DSCRs.
    """
    # Extract inputs
    contracted_cfads_ref = inputs.get('contractedCfadsRef')
    contracted_dscr = _resolve_dscr(inputs.get('contractedDSCR', 1.35), context)
    merchant_cfads_ref = inputs.get('merchantCfadsRef')
    merchant_dscr = _resolve_dscr(inputs.get('merchantDSCR', 1.50), context)
    debt_flag_ref = inputs.get('debtFlagRef')
    total_funding_ref = inputs.get('totalFundingRef')
    max_gearing_pct = float(inputs.get('maxGearingPct', 65))
    interest_rate_pct = float(inputs.get('interestRatePct', 5))
    tenor_years = int(inputs.get('tenorYears', 18))
    debt_period = inputs.get('debtPeriod', 'Q')
    tolerance = float(inputs.get('tolerance', 0.1))
    max_iterations = int(inputs.get('maxIterations', 50))

    # Initialize outputs
    outputs = {
        'sized_debt': np.zeros(periods),
        'opening_balance': np.zeros(periods),
        'interest_payment': np.zeros(periods),
        'principal_payment': np.zeros(periods),
        'debt_service': np.zeros(periods),
        'closing_balance': np.zeros(periods),
        'period_dscr': np.zeros(periods),
        'cumulative_principal': np.zeros(periods)
    }

    # Get input arrays
    contracted_cfads = context.get(contracted_cfads_ref, np.zeros(periods)) if contracted_cfads_ref else np.zeros(periods)
    merchant_cfads = context.get(merchant_cfads_ref, np.zeros(periods)) if merchant_cfads_ref else np.zeros(periods)
    debt_flag = context.get(debt_flag_ref, np.zeros(periods)) if debt_flag_ref else np.zeros(periods)

    # Calculate debt service capacity
    ds_capacity = np.zeros(periods)
    total_cfads = np.zeros(periods)

    for i in range(periods):
        contracted_cap = contracted_cfads[i] / contracted_dscr if contracted_dscr > 0 else 0
        merchant_cap = merchant_cfads[i] / merchant_dscr if merchant_dscr > 0 else 0
        ds_capacity[i] = contracted_cap + merchant_cap
        total_cfads[i] = contracted_cfads[i] + merchant_cfads[i]

    # Find debt period bounds
    debt_start = np.argmax(debt_flag > 0)
    if debt_flag[debt_start] == 0:
        return outputs  # No debt period

    debt_flag_end = periods - 1 - np.argmax(debt_flag[::-1] > 0)
    tenor_months = tenor_years * 12
    debt_end = min(debt_start + tenor_months - 1, debt_flag_end, periods - 1)

    # Get total funding
    total_funding = 0
    if total_funding_ref and total_funding_ref in context:
        funding_arr = context[total_funding_ref]
        total_funding = funding_arr[debt_start - 1] if debt_start > 0 else funding_arr[0]

    # Monthly rate
    monthly_rate = interest_rate_pct / 100 / 12

    # Binary search for optimal debt
    lower = 0
    upper = total_funding * (max_gearing_pct / 100)
    best_debt = 0
    best_schedule = None

    for _ in range(max_iterations):
        if upper - lower <= tolerance:
            break

        test_debt = (lower + upper) / 2
        schedule = _generate_schedule(
            test_debt, ds_capacity, total_cfads,
            debt_start, debt_end, monthly_rate, periods,
            debt_period, timeline
        )

        if schedule['is_viable']:
            lower = test_debt
            best_debt = test_debt
            best_schedule = schedule
        else:
            upper = test_debt

    # Return best schedule
    if best_schedule:
        outputs['sized_debt'] = np.full(periods, best_debt)
        outputs['opening_balance'] = best_schedule['opening_balance']
        outputs['interest_payment'] = best_schedule['interest_payment']
        outputs['principal_payment'] = best_schedule['principal_payment']
        outputs['debt_service'] = best_schedule['debt_service']
        outputs['closing_balance'] = best_schedule['closing_balance']
        outputs['period_dscr'] = best_schedule['period_dscr']
        outputs['cumulative_principal'] = best_schedule['cumulative_principal']

    return outputs


def _resolve_dscr(value, context):
    """Resolve DSCR value (can be number or reference)."""
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str) and value in context:
        arr = context[value]
        return arr[arr != 0][0] if np.any(arr != 0) else 1.35
    try:
        return float(value)
    except:
        return 1.35


def _is_period_end(month_idx, debt_period, timeline):
    """Check if month index is a period end."""
    if debt_period == 'M':
        return True

    month = timeline['month'][month_idx] if timeline else ((month_idx % 12) + 1)

    if debt_period == 'Q':
        return month in [3, 6, 9, 12]
    if debt_period == 'Y':
        return month == 12
    return True


def _generate_schedule(total_debt, ds_capacity, total_cfads, start, end,
                       monthly_rate, periods, debt_period, timeline):
    """Generate debt schedule for a given debt amount."""
    outputs = {
        'opening_balance': np.zeros(periods),
        'interest_payment': np.zeros(periods),
        'principal_payment': np.zeros(periods),
        'debt_service': np.zeros(periods),
        'closing_balance': np.zeros(periods),
        'period_dscr': np.zeros(periods),
        'cumulative_principal': np.zeros(periods),
        'is_viable': False
    }

    if total_debt <= 0 or start < 0 or end < start:
        return outputs

    balance = total_debt
    cum_principal = 0
    accrued_interest = 0
    accrued_capacity = 0
    accrued_cfads = 0
    ds_breached = False

    for i in range(start, min(end + 1, periods)):
        outputs['opening_balance'][i] = balance

        # Accrue interest
        accrued_interest += balance * monthly_rate
        accrued_capacity += ds_capacity[i]
        accrued_cfads += total_cfads[i]

        is_payment_period = _is_period_end(i, debt_period, timeline) or i == end

        if is_payment_period:
            # Count remaining periods
            remaining = sum(1 for j in range(i, end + 1)
                          if _is_period_end(j, debt_period, timeline) or j == end)

            interest = accrued_interest
            outputs['interest_payment'][i] = interest

            max_ds = accrued_capacity
            min_principal = balance / remaining if remaining > 0 else balance
            max_principal = max(0, max_ds - interest)

            if i == end:
                principal = balance
            elif max_principal >= min_principal:
                principal = min_principal
            else:
                principal = max_principal
                if principal < min_principal * 0.9:
                    ds_breached = True

            principal = min(principal, balance)
            outputs['principal_payment'][i] = principal
            outputs['debt_service'][i] = interest + principal

            if outputs['debt_service'][i] > 0:
                outputs['period_dscr'][i] = accrued_cfads / outputs['debt_service'][i]

            balance -= principal
            cum_principal += principal

            accrued_interest = 0
            accrued_capacity = 0
            accrued_cfads = 0

        outputs['closing_balance'][i] = max(0, balance)
        outputs['cumulative_principal'][i] = cum_principal

    # Carry forward cumulative principal
    for i in range(end + 1, periods):
        outputs['cumulative_principal'][i] = cum_principal

    outputs['is_viable'] = balance < 0.001 and not ds_breached
    return outputs
`
}

/**
 * Generate depreciation module
 */
function generateDepreciationModule() {
    return `"""
Depreciation & Amortization Module
CUMSUM-based ledger pattern - no circular dependencies.
"""

import numpy as np
from typing import Dict, Any


def calculate_depreciation(
    inputs: Dict[str, Any],
    periods: int,
    context: Dict[str, np.ndarray]
) -> Dict[str, np.ndarray]:
    """
    Calculate depreciation using Gold Standard CUMSUM pattern.
    """
    # Extract inputs
    additions_ref = inputs.get('additionsRef')
    ops_flag_ref = inputs.get('opsFlagRef')
    life_years = float(inputs.get('lifeYears', 25))
    method = inputs.get('method', 'straight_line')
    db_multiplier = float(inputs.get('dbMultiplier', 2.0))

    # Initialize outputs
    outputs = {
        'opening': np.zeros(periods),
        'addition': np.zeros(periods),
        'depreciation': np.zeros(periods),
        'accumulated': np.zeros(periods),
        'closing': np.zeros(periods)
    }

    # Get input arrays
    additions = context.get(additions_ref, np.zeros(periods)) if additions_ref else np.zeros(periods)
    ops_flag = context.get(ops_flag_ref, np.zeros(periods)) if ops_flag_ref else np.zeros(periods)

    # Calculate cumulative additions
    cumsum_additions = np.cumsum(additions)

    # Find ops start
    ops_start = np.argmax(ops_flag > 0)
    if ops_flag[ops_start] == 0:
        return outputs

    # Calculate cumulative ops flag
    cumsum_ops = np.cumsum(ops_flag)

    # Total capital at COD
    total_capital = cumsum_additions[ops_start]

    if method == 'declining_balance':
        # Declining balance method
        annual_rate = db_multiplier / life_years
        monthly_rate = annual_rate / 12
        retention = 1 - monthly_rate

        for i in range(periods):
            is_ops = ops_flag[i] > 0
            is_ops_start = i == ops_start
            periods_in_ops = int(cumsum_ops[i])
            prior_periods = periods_in_ops - (1 if is_ops else 0)

            if is_ops_start:
                outputs['addition'][i] = total_capital

            if i >= ops_start:
                outputs['closing'][i] = max(0, total_capital * (retention ** periods_in_ops))

            if i >= ops_start and prior_periods > 0:
                outputs['opening'][i] = total_capital * (retention ** prior_periods)

            if is_ops:
                book_value = outputs['opening'][i] + outputs['addition'][i]
                outputs['depreciation'][i] = max(0, book_value * monthly_rate)

            outputs['accumulated'][i] = (outputs['accumulated'][i-1] if i > 0 else 0) + outputs['depreciation'][i]
    else:
        # Straight line method
        monthly_rate = total_capital / life_years / 12 if life_years > 0 else 0

        for i in range(periods):
            is_ops = ops_flag[i] > 0
            is_ops_start = i == ops_start

            if is_ops_start:
                outputs['addition'][i] = total_capital

            # Closing = MAX(0, CUMSUM(Addition) - Rate * CUMSUM(OpsFlag))
            cumsum_add = total_capital if i >= ops_start else 0
            outputs['closing'][i] = max(0, cumsum_add - monthly_rate * cumsum_ops[i])

            # Opening = prior cumulative
            prior_cumsum_add = cumsum_add - outputs['addition'][i]
            prior_cumsum_ops = cumsum_ops[i] - (1 if is_ops else 0)
            outputs['opening'][i] = max(0, prior_cumsum_add - monthly_rate * prior_cumsum_ops)

            # Depreciation
            if is_ops:
                outputs['depreciation'][i] = min(outputs['opening'][i] + outputs['addition'][i], monthly_rate)

            outputs['accumulated'][i] = (outputs['accumulated'][i-1] if i > 0 else 0) + outputs['depreciation'][i]

    return outputs
`
}

/**
 * Generate tax module
 */
function generateTaxModule() {
    return `"""
Tax & Tax Losses Module
Tax calculation with loss carry-forward using CUMSUM pattern.
"""

import numpy as np
from typing import Dict, Any


def calculate_tax_losses(
    inputs: Dict[str, Any],
    periods: int,
    context: Dict[str, np.ndarray]
) -> Dict[str, np.ndarray]:
    """
    Calculate tax with loss carry-forward using Gold Standard CUMSUM pattern.
    """
    # Extract inputs
    taxable_income_ref = inputs.get('taxableIncomeRef')
    ops_flag_ref = inputs.get('opsFlagRef')
    tax_rate_pct = float(inputs.get('taxRatePct', 30))

    # Initialize outputs
    outputs = {
        'taxable_income_before_losses': np.zeros(periods),
        'losses_opening': np.zeros(periods),
        'losses_generated': np.zeros(periods),
        'losses_utilised': np.zeros(periods),
        'losses_closing': np.zeros(periods),
        'net_taxable_income': np.zeros(periods),
        'tax_payable': np.zeros(periods)
    }

    # Get input arrays
    income = context.get(taxable_income_ref, np.zeros(periods)) if taxable_income_ref else np.zeros(periods)
    ops_flag = context.get(ops_flag_ref, np.ones(periods)) if ops_flag_ref else np.ones(periods)

    tax_rate = tax_rate_pct / 100

    # Calculate generated and potential
    generated = np.maximum(0, -income) * (ops_flag > 0)
    potential = np.maximum(0, income) * (ops_flag > 0)

    # Cumulative sums
    cum_generated = np.cumsum(generated)
    cum_potential = np.cumsum(potential)

    # Cumulative utilised = MIN(cum_generated, cum_potential)
    cum_utilised = np.minimum(cum_generated, cum_potential)

    # Calculate outputs
    outputs['taxable_income_before_losses'] = income
    outputs['losses_generated'] = generated

    for i in range(periods):
        is_ops = ops_flag[i] > 0
        prior_cum_utilised = cum_utilised[i-1] if i > 0 else 0
        prior_cum_generated = cum_generated[i-1] if i > 0 else 0

        outputs['losses_utilised'][i] = cum_utilised[i] - prior_cum_utilised
        outputs['losses_closing'][i] = cum_generated[i] - cum_utilised[i]
        outputs['losses_opening'][i] = prior_cum_generated - prior_cum_utilised

        if is_ops:
            outputs['net_taxable_income'][i] = max(0, income[i] - outputs['losses_utilised'][i])
            outputs['tax_payable'][i] = outputs['net_taxable_income'][i] * tax_rate

    return outputs
`
}

/**
 * Generate GST module
 */
function generateGstModule() {
    return `"""
GST Paid/Received Module
GST ledger with configurable receipt delay using CUMSUM pattern.
"""

import numpy as np
from typing import Dict, Any


def calculate_gst_receivable(
    inputs: Dict[str, Any],
    periods: int,
    context: Dict[str, np.ndarray]
) -> Dict[str, np.ndarray]:
    """
    Calculate GST paid/received with configurable delay.
    """
    # Extract inputs
    gst_base_ref = inputs.get('gstBaseRef')
    active_flag_ref = inputs.get('activeFlagRef')
    gst_rate_pct = float(inputs.get('gstRatePct', 10))
    receipt_delay = int(inputs.get('receiptDelayMonths', 1))

    # Initialize outputs
    outputs = {
        'gst_base': np.zeros(periods),
        'gst_amount': np.zeros(periods),
        'gst_paid': np.zeros(periods),
        'receivable_opening': np.zeros(periods),
        'gst_received': np.zeros(periods),
        'receivable_closing': np.zeros(periods),
        'net_gst_cashflow': np.zeros(periods)
    }

    # Get input arrays
    base = context.get(gst_base_ref, np.zeros(periods)) if gst_base_ref else np.zeros(periods)
    active_flag = context.get(active_flag_ref, np.ones(periods)) if active_flag_ref else np.ones(periods)

    gst_rate = gst_rate_pct / 100

    # Calculate GST amounts
    gst_paid_amounts = np.zeros(periods)

    for i in range(periods):
        is_active = active_flag[i] > 0
        outputs['gst_base'][i] = base[i]

        if is_active and base[i] != 0:
            gst_amount = base[i] * gst_rate
            outputs['gst_amount'][i] = gst_amount
            outputs['gst_paid'][i] = -gst_amount
            gst_paid_amounts[i] = gst_amount

    # Cumulative paid
    cum_paid = np.cumsum(gst_paid_amounts)

    # Cumulative received = SHIFT(cum_paid, delay)
    cum_received = np.zeros(periods)
    if receipt_delay < periods:
        cum_received[receipt_delay:] = cum_paid[:-receipt_delay]

    # Calculate period values
    for i in range(periods):
        prior_cum_received = cum_received[i-1] if i > 0 else 0
        prior_cum_paid = cum_paid[i-1] if i > 0 else 0

        outputs['gst_received'][i] = cum_received[i] - prior_cum_received
        outputs['receivable_closing'][i] = cum_paid[i] - cum_received[i]
        outputs['receivable_opening'][i] = prior_cum_paid - prior_cum_received
        outputs['net_gst_cashflow'][i] = outputs['gst_paid'][i] + outputs['gst_received'][i]

    return outputs
`
}

/**
 * Generate construction funding module
 */
function generateConstructionFundingModule() {
    return `"""
Construction Funding Module
Construction funding waterfall with IDC equity-funded.
"""

import numpy as np
from typing import Dict, Any


def calculate_construction_funding(
    inputs: Dict[str, Any],
    periods: int,
    context: Dict[str, np.ndarray]
) -> Dict[str, np.ndarray]:
    """
    Calculate construction funding waterfall with IDC equity-funded.
    """
    # Extract inputs
    construction_costs_ref = inputs.get('constructionCostsRef')
    gst_paid_ref = inputs.get('gstPaidRef')
    fees_ref = inputs.get('feesRef')
    sized_debt_ref = inputs.get('sizedDebtRef')
    gearing_cap_pct = float(inputs.get('gearingCapPct', 65))
    interest_rate_pct = float(inputs.get('interestRatePct', 5))
    drawdown_method = inputs.get('drawdownMethod', 'prorata')
    construction_flag_ref = inputs.get('constructionFlagRef')

    # Initialize outputs
    outputs = {
        'total_uses_incl_idc': np.zeros(periods),
        'senior_debt': np.zeros(periods),
        'equity': np.zeros(periods),
        'gearing_pct': np.zeros(periods),
        'cumulative_idc': np.zeros(periods),
        'debt_drawdown': np.zeros(periods),
        'equity_drawdown': np.zeros(periods),
        'idc': np.zeros(periods),
        'total_uses_ex_idc': np.zeros(periods)
    }

    # Get input arrays
    construction_costs = context.get(construction_costs_ref, np.zeros(periods)) if construction_costs_ref else np.zeros(periods)
    gst_paid = context.get(gst_paid_ref, np.zeros(periods)) if gst_paid_ref else np.zeros(periods)
    fees = context.get(fees_ref, np.zeros(periods)) if fees_ref else np.zeros(periods)
    sized_debt = context.get(sized_debt_ref, np.zeros(periods)) if sized_debt_ref else np.zeros(periods)
    construction_flag = context.get(construction_flag_ref, np.zeros(periods)) if construction_flag_ref else np.zeros(periods)

    gearing_cap = gearing_cap_pct / 100
    monthly_rate = interest_rate_pct / 100 / 12

    # Find construction period
    cons_start = np.argmax(construction_flag > 0)
    if construction_flag[cons_start] == 0:
        return outputs

    cons_end = periods - 1 - np.argmax(construction_flag[::-1] > 0)

    # Get sized debt amount
    sized_debt_amount = sized_debt[cons_end] if cons_end < periods else 0

    # Calculate total uses ex-IDC
    for i in range(periods):
        outputs['total_uses_ex_idc'][i] = construction_costs[i] + gst_paid[i] + fees[i]

    # Calculate max debt
    total_uses_at_end = outputs['total_uses_ex_idc'][cons_end]
    max_debt_by_gearing = total_uses_at_end * gearing_cap
    max_senior_debt = min(sized_debt_amount, max_debt_by_gearing)

    total_equity_required = total_uses_at_end * (1 - gearing_cap)

    # Calculate drawdowns
    cum_debt = 0
    cum_equity = 0
    cum_idc = 0

    for i in range(periods):
        is_cons = construction_flag[i] > 0

        if is_cons:
            prior_uses = outputs['total_uses_ex_idc'][i-1] if i > 0 else 0
            period_uses = outputs['total_uses_ex_idc'][i] - prior_uses

            if drawdown_method == 'equity_first':
                remaining_equity = max(0, total_equity_required - cum_equity)
                period_equity_base = min(period_uses, remaining_equity)
                remaining_debt = max(0, max_senior_debt - cum_debt)
                period_debt = min(period_uses - period_equity_base, remaining_debt)
            else:  # prorata
                target_debt = period_uses * gearing_cap
                remaining_debt = max(0, max_senior_debt - cum_debt)
                period_debt = min(target_debt, remaining_debt)
                period_equity_base = period_uses - period_debt

            cum_debt += period_debt
            outputs['debt_drawdown'][i] = period_debt

            # IDC
            opening_debt = cum_debt - period_debt
            period_idc = opening_debt * monthly_rate
            cum_idc += period_idc
            outputs['idc'][i] = period_idc
            outputs['cumulative_idc'][i] = cum_idc

            # Equity = base + IDC
            period_equity = period_equity_base + period_idc
            cum_equity += period_equity
            outputs['equity_drawdown'][i] = period_equity

        outputs['senior_debt'][i] = cum_debt
        outputs['total_uses_incl_idc'][i] = outputs['total_uses_ex_idc'][i] + cum_idc
        outputs['equity'][i] = cum_equity

        # Gearing %
        total_uses = outputs['total_uses_ex_idc'][i]
        if drawdown_method == 'equity_first':
            outputs['gearing_pct'][i] = (cum_debt / total_uses * 100) if total_uses > 0 else 0
        else:
            outputs['gearing_pct'][i] = gearing_cap * 100 if is_cons else (outputs['gearing_pct'][i-1] if i > 0 else 0)

    return outputs
`
}

/**
 * Generate README.md
 */
function generateReadmeMd(bundle) {
    return `# Glass Box Model - Python Export

Exported: ${bundle.exported_at}
Version: ${bundle.version}

## Overview

This Python package contains a complete implementation of the Glass Box financial model.
All calculations are fully transparent and traceable.

## Installation

\`\`\`bash
pip install numpy
\`\`\`

## Usage

\`\`\`python
from glassbox_model import GlassBoxModel

# Initialize model
model = GlassBoxModel()

# Run full calculation
results = model.evaluate()

# Get specific results
print(f"Total Revenue: {results['R8'].sum():,.2f}")
print(f"Closing Cash: {results['R42'][-1]:,.2f}")
print(f"Sized Debt: {results['M1.1'][0]:,.2f}")

# Run with input overrides (sensitivity analysis)
high_price = model.scenario({'C1.10': 150})  # Increase tolling price
print(f"Revenue with higher price: {high_price['R8'].sum():,.2f}")

# Get summary metrics
summary = model.summary()
for key, value in summary.items():
    print(f"{key}: {value:,.2f}")
\`\`\`

## Model Structure

### Timeline
- **Periods:** ${bundle.timeline.periods} months
- **Start:** ${bundle.timeline.startYear}-${bundle.timeline.startMonth}
- **End:** ${bundle.timeline.endYear}-${bundle.timeline.endMonth}

### Reference Types

| Prefix | Type | Example |
|--------|------|---------|
| R{id} | Calculation | R8 (Total Revenue) |
| V1.{id} | CAPEX Input | V1.1 (EPC-BESS) |
| S1.{id} | OPEX Input | S1.14 (O&M) |
| C1.{idx} | Constant | C1.10 (Tolling Price) |
| F{id} | Period Flag | F2 (Operations) |
| I{id} | Index | I2 (CPI) |
| M{n}.{m} | Module Output | M1.1 (Sized Debt) |

### Modules

${bundle.modules.map(m => `- **M${m.index}: ${m.name}** - ${m.description}`).join('\n')}

## Array Functions

- \`CUMSUM(X)\` - Cumulative sum
- \`CUMPROD(X)\` - Cumulative product
- \`SHIFT(X, n)\` - Shift array by n periods
- \`COUNT(X)\` - Count of non-zero values

## Verification

To verify the model produces correct results, compare with the web application:

\`\`\`python
model = GlassBoxModel()
results = model.evaluate()

# Key metrics to verify:
print("Verification:")
print(f"R8 (Revenue) sum: {results['R8'].sum():,.2f}")
print(f"R13 (EBITDA) sum: {results['R13'].sum():,.2f}")
print(f"R42 (Closing Cash) final: {results['R42'][-1]:,.2f}")
print(f"M1.1 (Sized Debt): {results['M1.1'][0]:,.2f}")
\`\`\`
`
}
