"""
Glassbox Calculation Engine - Python implementation.

Dynamically reads model-inputs.json and model-calculations.json,
builds time series arrays, resolves references, and evaluates all formulas.

Mirrors the JS engine: formulaEvaluator.js, useUnifiedCalculation.js,
useInputArrays.js, useReferenceMap.js.
"""

import json
import re
import math
import os
from collections import defaultdict
from pathlib import Path
from typing import Any

import warnings
import numpy as np

# Suppress numpy divide-by-zero warnings (we handle nan/inf -> 0 in _try_numpy_eval)
warnings.filterwarnings('ignore', category=RuntimeWarning, message='.*divide.*')
warnings.filterwarnings('ignore', category=RuntimeWarning, message='.*invalid value.*')


# ---------------------------------------------------------------------------
# Timeline
# ---------------------------------------------------------------------------

def build_timeline(config: dict) -> dict:
    """Build monthly timeline arrays from config start/end."""
    start_year = config['startYear']
    start_month = config['startMonth']
    end_year = config['endYear']
    end_month = config['endMonth']

    years = []
    months = []
    y, m = start_year, start_month
    while y < end_year or (y == end_year and m <= end_month):
        years.append(y)
        months.append(m)
        m += 1
        if m > 12:
            m = 1
            y += 1

    periods = len(years)
    year_arr = np.array(years, dtype=np.int32)
    month_arr = np.array(months, dtype=np.int32)

    return {
        'periods': periods,
        'year': year_arr,
        'month': month_arr,
    }


def _is_leap(year: int) -> bool:
    return (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)


def _days_in_month(year: int, month: int) -> int:
    if month in (1, 3, 5, 7, 8, 10, 12):
        return 31
    if month in (4, 6, 9, 11):
        return 30
    return 29 if _is_leap(year) else 28


# ---------------------------------------------------------------------------
# Time constants
# ---------------------------------------------------------------------------

def build_time_constants(timeline: dict) -> dict[str, np.ndarray]:
    """Build T.DiM, T.MiY, T.QE, etc."""
    periods = timeline['periods']
    year = timeline['year']
    month = timeline['month']

    dim = np.zeros(periods)
    diy = np.zeros(periods)
    him = np.zeros(periods)
    hiy = np.zeros(periods)
    diq = np.zeros(periods)
    qe = np.zeros(periods)
    cye = np.zeros(periods)
    fye = np.zeros(periods)

    for i in range(periods):
        y, m = int(year[i]), int(month[i])
        d = _days_in_month(y, m)
        dim[i] = d
        days_in_year = 366 if _is_leap(y) else 365
        diy[i] = days_in_year
        him[i] = d * 24
        hiy[i] = days_in_year * 24
        q = (m - 1) // 3
        sm = q * 3 + 1
        diq[i] = sum(_days_in_month(y, sm + k) for k in range(3))
        qe[i] = 1 if m in (3, 6, 9, 12) else 0
        cye[i] = 1 if m == 12 else 0
        fye[i] = 1 if m == 6 else 0

    refs: dict[str, np.ndarray] = {}
    refs['T.DiM'] = dim
    refs['T.DiY'] = diy
    refs['T.HiM'] = him
    refs['T.HiY'] = hiy
    refs['T.DiQ'] = diq
    refs['T.QE'] = qe
    refs['T.CYE'] = cye
    refs['T.FYE'] = fye
    refs['T.MiY'] = np.full(periods, 12.0)
    refs['T.QiY'] = np.full(periods, 4.0)
    refs['T.HiD'] = np.full(periods, 24.0)
    refs['T.MiQ'] = np.full(periods, 3.0)
    return refs


# ---------------------------------------------------------------------------
# Flags from key periods
# ---------------------------------------------------------------------------

def build_flag_refs(key_periods: list, timeline: dict) -> dict[str, np.ndarray]:
    """Build F1, F1.Start, F1.End etc. from keyPeriods."""
    periods = timeline['periods']
    year = timeline['year']
    month = timeline['month']
    refs: dict[str, np.ndarray] = {}

    for kp in key_periods:
        kp_id = kp['id']
        arr = np.zeros(periods)
        start_arr = np.zeros(periods)
        end_arr = np.zeros(periods)

        start_total = kp['startYear'] * 12 + kp['startMonth']
        end_total = kp['endYear'] * 12 + kp['endMonth']

        first_idx = -1
        last_idx = -1
        for i in range(periods):
            pt = int(year[i]) * 12 + int(month[i])
            if start_total <= pt <= end_total:
                arr[i] = 1
                if first_idx == -1:
                    first_idx = i
                last_idx = i

        if first_idx >= 0:
            start_arr[first_idx] = 1
        if last_idx >= 0:
            end_arr[last_idx] = 1

        refs[f'F{kp_id}'] = arr
        refs[f'F{kp_id}.Start'] = start_arr
        refs[f'F{kp_id}.End'] = end_arr

    return refs


# ---------------------------------------------------------------------------
# Indexation refs
# ---------------------------------------------------------------------------

def build_indexation_refs(indices: list, timeline: dict) -> dict[str, np.ndarray]:
    """Build I1, I2, etc. from indices."""
    periods = timeline['periods']
    year = timeline['year']
    month = timeline['month']
    refs: dict[str, np.ndarray] = {}

    for idx_def in indices:
        idx_id = idx_def['id']

        if idx_def.get('name') == 'None' or idx_id == 1:
            refs[f'I{idx_id}'] = np.ones(periods)
            continue

        arr = np.zeros(periods)
        start_year = idx_def['indexationStartYear']
        start_month = idx_def['indexationStartMonth']
        start_total = start_year * 12 + start_month
        rate = idx_def['indexationRate'] / 100
        period_type = idx_def.get('indexationPeriod', 'annual')

        for i in range(periods):
            y, m = int(year[i]), int(month[i])
            pt = y * 12 + m
            if pt >= start_total:
                if period_type == 'monthly':
                    months_elapsed = pt - start_total
                    arr[i] = (1 + rate / 12) ** months_elapsed
                else:
                    years_elapsed = y - start_year
                    arr[i] = (1 + rate) ** years_elapsed
            else:
                arr[i] = 1.0

        refs[f'I{idx_id}'] = arr

    return refs


# ---------------------------------------------------------------------------
# Input group refs (V, S, C, L)
# ---------------------------------------------------------------------------

def _generate_periods_for_group(group: dict, config: dict, key_periods: list) -> list[dict]:
    """Generate monthly periods for an input group, mirroring generatePeriods()."""
    linked_id = group.get('linkedKeyPeriodId')
    if linked_id and str(linked_id) != 'constant':
        kp = next((k for k in key_periods if str(k['id']) == str(linked_id)), None)
        if kp:
            sy, sm = kp['startYear'], kp['startMonth']
            ey, em = kp['endYear'], kp['endMonth']
        else:
            sy, sm = config['startYear'], config['startMonth']
            ey, em = config['endYear'], config['endMonth']
    else:
        sy, sm = config['startYear'], config['startMonth']
        ey, em = config['endYear'], config['endMonth']

    result = []
    y, m = sy, sm
    while y < ey or (y == ey and m <= em):
        result.append({'year': y, 'month': m})
        m += 1
        if m > 12:
            m = 1
            y += 1
    return result


def _get_values_for_input(inp: dict, group_periods: list, group: dict) -> list[float]:
    """Expand a single input to monthly values (mirrors getValuesArray + generateConstantValues).

    Constants: raw value repeated every month (no frequency adjustment).
    Series/values with Q/Y frequency: spread evenly into monthly periods.
    """
    entry_mode = inp.get('entryMode') or group.get('entryMode', 'values')
    n_periods = len(group_periods)

    # Constants: just fill with raw value (no frequency division)
    # Mirrors JS generateConstantValues which uses the raw value per month
    if entry_mode == 'constant' or group.get('groupType') == 'constant':
        val = float(inp.get('value', 0) or 0)
        spread_method = inp.get('spreadMethod', 'lookup')
        if spread_method == 'spread':
            val = val / n_periods if n_periods > 0 else 0
        return [val] * n_periods

    # For series mode, the input may have a 'value' field (constant within series)
    # or a 'values' dict. The frequency determines how to expand.
    freq = inp.get('valueFrequency') or inp.get('seriesFrequency') or group.get('frequency', 'M')

    # Check if this is a series with constant entry
    if entry_mode == 'series' or (group.get('entryMode') == 'series'):
        inner_mode = inp.get('entryMode', 'constant')
        if inner_mode == 'constant':
            val = float(inp.get('value', 0) or 0)
            # For series inputs, the value IS the per-frequency amount
            # Spread into monthly: Q -> /3, Y -> /12
            if freq == 'Q':
                val /= 3
            elif freq == 'Y':
                val /= 12
            return [val] * n_periods

    # values mode - sparse dict
    values_dict = inp.get('values', {})
    if not values_dict:
        return [0.0] * n_periods

    # Monthly frequency: direct mapping
    if freq == 'M' or freq is None:
        result = [0.0] * n_periods
        for k, v in values_dict.items():
            idx = int(k)
            if 0 <= idx < n_periods:
                result[idx] = float(v or 0)
        return result

    # Q or Y: expand to monthly by spreading evenly
    months_per = 3 if freq == 'Q' else 12
    result = [0.0] * n_periods
    for k, v in values_dict.items():
        src_idx = int(k)
        base_month_idx = src_idx * months_per
        val = float(v or 0) / months_per
        for offset in range(months_per):
            mi = base_month_idx + offset
            if 0 <= mi < n_periods:
                result[mi] = val
    return result


def build_input_group_refs(
    input_glass: list,
    input_glass_groups: list,
    config: dict,
    key_periods: list,
    timeline: dict,
) -> dict[str, np.ndarray]:
    """Build V1, V1.5, S1, S1.14, C1, C1.19, L... refs."""
    periods = timeline['periods']
    year_arr = timeline['year']
    month_arr = timeline['month']

    # Pre-build timeline lookup
    tl_lookup: dict[str, int] = {}
    for i in range(periods):
        tl_lookup[f"{int(year_arr[i])}-{int(month_arr[i])}"] = i

    # Group inputs by groupId
    inputs_by_group: dict[int, list] = defaultdict(list)
    for inp in input_glass:
        inputs_by_group[inp['groupId']].append(inp)

    groups_by_id = {g['id']: g for g in input_glass_groups}
    active_groups = [g for g in input_glass_groups if g['id'] in inputs_by_group]

    mode_indices = {'values': 0, 'series': 0, 'constant': 0, 'timing': 0, 'lookup': 0}
    refs: dict[str, np.ndarray] = {}

    # Also build lookup refs separately
    lookup_index = 0

    for group in active_groups:
        group_inputs = inputs_by_group[group['id']]

        # Determine normalized mode
        gt = group.get('groupType', '')
        if gt == 'timing':
            norm = 'timing'
        elif gt == 'constant':
            norm = 'constant'
        else:
            gm = group.get('entryMode', 'values')
            if gm in ('lookup', 'lookup2'):
                norm = 'lookup'
            else:
                norm = gm

        mode_indices[norm] = mode_indices.get(norm, 0) + 1
        prefix_map = {'timing': 'T', 'series': 'S', 'constant': 'C', 'lookup': 'L', 'values': 'V'}
        prefix = prefix_map.get(norm, 'V')
        group_index = mode_indices[norm]
        group_ref = f'{prefix}{group_index}'

        # Generate group periods (monthly)
        gp = _generate_periods_for_group(group, config, key_periods)

        # Build arrays for each input
        input_arrays: dict[int, np.ndarray] = {}
        for inp in group_inputs:
            vals = _get_values_for_input(inp, gp, group)
            arr = np.zeros(periods)
            entry_mode = inp.get('entryMode') or group.get('entryMode', 'values')

            if entry_mode == 'constant' and vals:
                arr[:] = vals[0]
            else:
                for pi, p in enumerate(gp):
                    key = f"{p['year']}-{p['month']}"
                    t = tl_lookup.get(key)
                    if t is not None and pi < len(vals):
                        arr[t] = vals[pi]

            input_arrays[inp['id']] = arr

        # Group subtotal
        subtotal = np.zeros(periods)
        for a in input_arrays.values():
            subtotal += a
        refs[group_ref] = subtotal

        # Individual refs
        for inp in group_inputs:
            if group['id'] == 100:
                inp_num = inp['id'] - 99
            else:
                inp_num = inp['id']
            item_ref = f'{group_ref}.{inp_num}'
            refs[item_ref] = input_arrays.get(inp['id'], np.zeros(periods))

    return refs


# ---------------------------------------------------------------------------
# Formula evaluator (array functions + period evaluation)
# ---------------------------------------------------------------------------

# Pattern for array functions - order matters (longer names first)
_ARRAY_FN_PATTERNS = [
    ('CUMPROD_Y', re.compile(r'CUMPROD_Y\s*\(([^)]+)\)', re.IGNORECASE)),
    ('CUMPROD', re.compile(r'CUMPROD\s*\(([^)]+)\)', re.IGNORECASE)),
    ('CUMSUM_Y', re.compile(r'CUMSUM_Y\s*\(([^)]+)\)', re.IGNORECASE)),
    ('CUMSUM', re.compile(r'CUMSUM\s*\(([^)]+)\)', re.IGNORECASE)),
    ('PREVSUM', re.compile(r'PREVSUM\s*\(([^)]+)\)', re.IGNORECASE)),
    ('PREVVAL', re.compile(r'PREVVAL\s*\(([^)]+)\)', re.IGNORECASE)),
    ('SHIFT', re.compile(r'SHIFT\s*\(\s*([^,]+)\s*,\s*(\d+)\s*\)', re.IGNORECASE)),
    ('COUNT', re.compile(r'COUNT\s*\(([^)]+)\)', re.IGNORECASE)),
]

_EXCEL_FN_MAP = {
    r'\bIF\s*\(': '_IF(',
    r'\bAND\s*\(': '_AND(',
    r'\bOR\s*\(': '_OR(',
    r'\bNOT\s*\(': '_NOT(',
    r'\bROUND\s*\(': '_ROUND(',
    r'\bMIN\s*\(': 'min(',
    r'\bMAX\s*\(': 'max(',
    r'\bABS\s*\(': 'abs(',
}

_COMPILED_EXCEL_FN = [(re.compile(k, re.IGNORECASE), v) for k, v in _EXCEL_FN_MAP.items()]

# Regex to detect references in formulas
_REF_PATTERN = re.compile(
    r'\b([VSCTIFLRM]\d+(?:\.\d+)*(?:\.(?:Start|End))?|T\.[A-Za-z]+)\b'
)

# Helpers injected into eval scope
def _IF(cond, t, f):
    return t if cond else f

def _AND(a, b):
    return 1 if (a and b) else 0

def _OR(a, b):
    return 1 if (a or b) else 0

def _NOT(a):
    return 0 if a else 1

def _ROUND(x, n=0):
    factor = 10 ** int(n)
    return round(x * factor) / factor

_EVAL_GLOBALS = {
    '__builtins__': {},
    'min': min, 'max': max, 'abs': abs,
    'Math': math,
    '_IF': _IF, '_AND': _AND, '_OR': _OR, '_NOT': _NOT, '_ROUND': _ROUND,
}


_CODE_CACHE: dict[str, Any] = {}

def _safe_eval(expr: str) -> float:
    """Safely evaluate a numeric expression using compiled code cache."""
    if not expr or not expr.strip():
        return 0.0
    try:
        code = _CODE_CACHE.get(expr)
        if code is None:
            code = compile(expr, '<formula>', 'eval')
            if len(_CODE_CACHE) < 5000:
                _CODE_CACHE[expr] = code
        result = eval(code, _EVAL_GLOBALS, {})
        if isinstance(result, (int, float)) and math.isfinite(result):
            return float(result)
        return 0.0
    except Exception:
        return 0.0


def _substitute_refs(expr: str, refs_sorted: list[tuple[str, Any]], period_idx: int) -> str:
    """Replace all ref names with their value at period_idx."""
    for ref_name, ref_regex, ref_arr in refs_sorted:
        val = float(ref_arr[period_idx]) if ref_arr is not None and period_idx < len(ref_arr) else 0.0
        val_str = f'({val})' if val < 0 else str(val)
        expr = ref_regex.sub(val_str, expr)
    return expr


def _convert_excel_fns(expr: str) -> str:
    """Convert IF, MIN, MAX etc. to Python equivalents."""
    for pattern, repl in _COMPILED_EXCEL_FN:
        expr = pattern.sub(repl, expr)
    # Convert ^ to **
    expr = expr.replace('^', '**')
    return expr


def _clean_expr(expr: str) -> str:
    """Remove disallowed characters for safe eval."""
    # Allow digits, operators, parens, dots, e (scientific), spaces, commas, comparison ops
    return re.sub(r'[^0-9+\-*/().eE\s,<>=!&|%_a-zA-Z]', '', expr)


def _np_IF(cond, t, f):
    """Vectorized IF for numpy arrays."""
    return np.where(cond, t, f)

def _np_AND(a, b):
    return np.where(np.logical_and(a, b), 1.0, 0.0)

def _np_OR(a, b):
    return np.where(np.logical_or(a, b), 1.0, 0.0)

def _np_NOT(a):
    return np.where(a, 0.0, 1.0)

def _np_ROUND(x, n=0):
    return np.round(x, int(n))

_NP_EVAL_GLOBALS = {
    '__builtins__': {},
    'np': np,
    'min': np.minimum, 'max': np.maximum, 'abs': np.abs,
    '_IF': _np_IF, '_AND': _np_AND, '_OR': _np_OR, '_NOT': _np_NOT, '_ROUND': _np_ROUND,
}


def _try_numpy_eval(expr: str, context: dict, periods: int) -> np.ndarray | None:
    """Try to evaluate an expression using numpy vectorized operations.

    Returns the result array, or None if the expression can't be vectorized
    (e.g., contains unsupported constructs).
    """
    # Find refs
    found_refs = set(_REF_PATTERN.findall(expr))
    refs_sorted = sorted(found_refs, key=len, reverse=True)

    # Build numpy expression by substituting ref names with variable names
    np_expr = expr
    local_vars: dict[str, np.ndarray] = {}

    for idx, ref in enumerate(refs_sorted):
        if ref in context:
            var_name = f'_v{idx}'
            arr = context[ref]
            if isinstance(arr, np.ndarray):
                local_vars[var_name] = arr
            else:
                local_vars[var_name] = np.array(arr, dtype=float)
            np_expr = re.sub(r'\b' + re.escape(ref) + r'\b', var_name, np_expr)

    # Replace unresolved R-refs with zeros array
    if re.search(r'\bR\d+\b', np_expr):
        local_vars['_zeros'] = np.zeros(periods)
        np_expr = re.sub(r'\bR\d+\b', '_zeros', np_expr)

    # Convert Excel functions to numpy equivalents
    np_expr = _convert_excel_fns(np_expr)

    # Convert ^ to **
    np_expr = np_expr.replace('^', '**')

    # Clean up - allow numpy-safe characters
    # More permissive than scalar eval since we control the namespace
    np_expr = re.sub(r'[^0-9+\-*/().eE\s,<>=!&|%_a-zA-Z]', '', np_expr)

    try:
        result = eval(compile(np_expr, '<np_formula>', 'eval'), _NP_EVAL_GLOBALS, local_vars)
        if isinstance(result, np.ndarray):
            # Replace nan/inf with 0
            result = np.where(np.isfinite(result), result, 0.0)
            return result
        elif isinstance(result, (int, float)):
            return np.full(periods, float(result) if math.isfinite(result) else 0.0)
        return None
    except Exception:
        return None


def _eval_expr_all_periods(expr: str, context: dict, periods: int) -> np.ndarray:
    """Evaluate a simple expression for all periods (no array functions).

    First tries numpy vectorized evaluation. Falls back to per-period eval.
    """
    # Fast path: try numpy vectorized
    result = _try_numpy_eval(expr, context, periods)
    if result is not None:
        return result

    # Slow path: per-period evaluation
    arr = np.zeros(periods)
    found_refs = set(_REF_PATTERN.findall(expr))
    refs_sorted = []
    for ref in sorted(found_refs, key=len, reverse=True):
        if ref in context:
            refs_sorted.append((ref, re.compile(r'\b' + re.escape(ref) + r'\b'), context[ref]))

    for i in range(periods):
        period_expr = _substitute_refs(expr, refs_sorted, i)
        period_expr = re.sub(r'\bR\d+\b', '0', period_expr)
        period_expr = _convert_excel_fns(period_expr)
        period_expr = _clean_expr(period_expr)
        arr[i] = _safe_eval(period_expr)

    return arr


# Array function implementations using numpy
def _cumsum(arr: np.ndarray) -> np.ndarray:
    return np.cumsum(arr)

def _cumsum_y(arr: np.ndarray, year_arr: np.ndarray) -> np.ndarray:
    """Cumulative sum at year boundaries only."""
    result = np.zeros(len(arr))
    total = 0.0
    last_year = None
    last_year_value = None
    for i in range(len(arr)):
        cy = int(year_arr[i])
        if last_year is not None and cy != last_year and last_year_value is not None:
            total += last_year_value
        result[i] = total
        if cy != last_year:
            last_year_value = arr[i]
        last_year = cy
    return result

def _cumprod(arr: np.ndarray) -> np.ndarray:
    return np.cumprod(arr)

def _cumprod_y(arr: np.ndarray, year_arr: np.ndarray) -> np.ndarray:
    """Cumulative product at year boundaries only."""
    result = np.zeros(len(arr))
    product = 1.0
    last_year = None
    last_year_value = None
    for i in range(len(arr)):
        cy = int(year_arr[i])
        if last_year is not None and cy != last_year and last_year_value is not None:
            product *= last_year_value
        result[i] = product
        if cy != last_year:
            last_year_value = arr[i]
        last_year = cy
    return result

def _shift(arr: np.ndarray, n: int) -> np.ndarray:
    result = np.zeros(len(arr))
    if n < len(arr):
        result[n:] = arr[:len(arr)-n]
    return result

def _prevsum(arr: np.ndarray) -> np.ndarray:
    result = np.zeros(len(arr))
    total = 0.0
    for i in range(len(arr)):
        result[i] = total
        total += arr[i]
    return result

def _prevval(arr: np.ndarray) -> np.ndarray:
    result = np.zeros(len(arr))
    if len(arr) > 1:
        result[1:] = arr[:-1]
    return result

def _count_nonzero(arr: np.ndarray) -> np.ndarray:
    result = np.zeros(len(arr))
    cnt = 0
    for i in range(len(arr)):
        if arr[i] != 0:
            cnt += 1
        result[i] = cnt
    return result


def _process_array_functions(formula: str, context: dict, timeline: dict) -> tuple[str, dict]:
    """Extract and evaluate array functions, replace with placeholders."""
    processed = formula
    fn_results: dict[str, np.ndarray] = {}
    counter = 0
    periods = timeline['periods']
    year_arr = timeline['year']

    for fn_name, pattern in _ARRAY_FN_PATTERNS:
        while True:
            match = pattern.search(processed)
            if not match:
                break

            if fn_name == 'SHIFT':
                inner_expr = match.group(1).strip()
                n = int(match.group(2))
                inner_arr = _eval_expr_all_periods(inner_expr, context, periods)
                result = _shift(inner_arr, n)
            elif fn_name == 'CUMSUM':
                inner_expr = match.group(1).strip()
                inner_arr = _eval_expr_all_periods(inner_expr, context, periods)
                result = _cumsum(inner_arr)
            elif fn_name == 'CUMSUM_Y':
                inner_expr = match.group(1).strip()
                inner_arr = _eval_expr_all_periods(inner_expr, context, periods)
                result = _cumsum_y(inner_arr, year_arr)
            elif fn_name == 'CUMPROD':
                inner_expr = match.group(1).strip()
                inner_arr = _eval_expr_all_periods(inner_expr, context, periods)
                result = _cumprod(inner_arr)
            elif fn_name == 'CUMPROD_Y':
                inner_expr = match.group(1).strip()
                inner_arr = _eval_expr_all_periods(inner_expr, context, periods)
                result = _cumprod_y(inner_arr, year_arr)
            elif fn_name == 'PREVSUM':
                inner_expr = match.group(1).strip()
                inner_arr = _eval_expr_all_periods(inner_expr, context, periods)
                result = _prevsum(inner_arr)
            elif fn_name == 'PREVVAL':
                inner_expr = match.group(1).strip()
                inner_arr = _eval_expr_all_periods(inner_expr, context, periods)
                result = _prevval(inner_arr)
            elif fn_name == 'COUNT':
                inner_expr = match.group(1).strip()
                inner_arr = _eval_expr_all_periods(inner_expr, context, periods)
                result = _count_nonzero(inner_arr)
            else:
                break

            placeholder = f'__ARRAYFN{counter}__'
            counter += 1
            fn_results[placeholder] = result
            processed = processed[:match.start()] + placeholder + processed[match.end():]

    return processed, fn_results


def evaluate_formula(formula: str, context: dict, timeline: dict) -> np.ndarray:
    """Evaluate a formula string into an array of period values.

    Fast path: after processing array functions, tries numpy vectorized eval.
    Slow path: falls back to per-period string substitution + eval.
    """
    if not formula or not formula.strip():
        return np.zeros(timeline['periods'])

    periods = timeline['periods']

    # Step 1: process array functions (CUMSUM, SHIFT, etc.)
    processed, array_fn_results = _process_array_functions(formula, context, timeline)

    # Step 2: try numpy vectorized evaluation (fast path)
    # Merge array function results into context for numpy eval
    if array_fn_results:
        merged_context = {**context, **array_fn_results}
    else:
        merged_context = context

    np_result = _try_numpy_eval(processed, merged_context, periods)
    if np_result is not None:
        return np_result

    # Step 3: slow path - per-period evaluation
    found_refs = set(_REF_PATTERN.findall(processed))
    refs_sorted = []
    for ref in sorted(found_refs, key=len, reverse=True):
        if ref in context:
            refs_sorted.append((ref, re.compile(r'\b' + re.escape(ref) + r'\b'), context[ref]))

    placeholder_refs = []
    for ph, arr in sorted(array_fn_results.items(), key=lambda x: len(x[0]), reverse=True):
        placeholder_refs.append((ph, re.compile(re.escape(ph)), arr))

    result = np.zeros(periods)
    for i in range(periods):
        expr = processed

        for ref_name, ref_regex, ref_arr in refs_sorted:
            val = float(ref_arr[i]) if ref_arr is not None and i < len(ref_arr) else 0.0
            val_str = f'({val})' if val < 0 else str(val)
            expr = ref_regex.sub(val_str, expr)

        for ph, ph_regex, ph_arr in placeholder_refs:
            val = float(ph_arr[i]) if i < len(ph_arr) else 0.0
            val_str = f'({val})' if val < 0 else str(val)
            expr = ph_regex.sub(val_str, expr)

        expr = re.sub(r'\bR\d+\b', '0', expr)
        expr = _convert_excel_fns(expr)
        expr = _clean_expr(expr)
        result[i] = _safe_eval(expr)

    return result


# ---------------------------------------------------------------------------
# Dependency graph + topological sort
# ---------------------------------------------------------------------------

_SHIFT_PATTERN = re.compile(
    r'(?:SHIFT\s*\(\s*([^,]+)\s*,\s*\d+\s*\)|PREVSUM\s*\(([^)]+)\)|PREVVAL\s*\(([^)]+)\))',
    re.IGNORECASE,
)

def _extract_deps(formula: str, m_ref_map: dict | None = None) -> set[str]:
    """Extract R-ref and M-ref dependencies from a formula (excluding SHIFT targets)."""
    if not formula:
        return set()

    # Rewrite M-refs to R-refs for converted modules
    rewritten = _rewrite_mrefs(formula, m_ref_map) if m_ref_map else formula

    # Remove SHIFT/PREVSUM/PREVVAL content
    without_shift = re.sub(
        r'(?:SHIFT\s*\([^)]+\)|PREVSUM\s*\([^)]+\)|PREVVAL\s*\([^)]+\))',
        '', rewritten, flags=re.IGNORECASE,
    )

    deps = set()
    for m in re.finditer(r'\bR(\d+)(?!\d)', without_shift):
        deps.add(f'R{m.group(1)}')
    for m in re.finditer(r'\bM(\d+)\.(\d+)', without_shift):
        deps.add(f'M{m.group(1)}')
    return deps


def _extract_shift_targets(formula: str) -> set[str]:
    """Extract R-refs inside SHIFT/PREVSUM/PREVVAL calls."""
    if not formula:
        return set()
    targets = set()
    for m in _SHIFT_PATTERN.finditer(formula):
        inner = m.group(1) or m.group(2) or m.group(3)
        for rm in re.finditer(r'\bR(\d+)(?!\d)', inner):
            targets.add(f'R{rm.group(1)}')
    return targets


def _rewrite_mrefs(formula: str, m_ref_map: dict | None) -> str:
    """Rewrite M-refs to R-refs using _mRefMap."""
    if not formula or not m_ref_map:
        return formula
    result = formula
    for mref in sorted(m_ref_map.keys(), key=len, reverse=True):
        rref = m_ref_map[mref]
        result = re.sub(r'\b' + re.escape(mref) + r'\b', rref, result)
    return result


def _topological_sort(graph: dict[str, set[str]]) -> list[str]:
    """Kahn's algorithm topological sort."""
    in_degree = {n: 0 for n in graph}
    reverse_adj: dict[str, list[str]] = {n: [] for n in graph}
    for node, deps in graph.items():
        for dep in deps:
            if dep in graph:
                in_degree[node] = in_degree.get(node, 0) + 1
                reverse_adj.setdefault(dep, []).append(node)

    queue = [n for n, d in in_degree.items() if d == 0]
    sorted_list = []

    while queue:
        node = queue.pop(0)
        sorted_list.append(node)
        for dependent in reverse_adj.get(node, []):
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)

    # Append remaining (cycles) at end
    remaining = [n for n in graph if n not in sorted_list]
    if remaining:
        print(f'[Engine] Warning: circular dependency detected: {remaining}')
    sorted_list.extend(remaining)

    return sorted_list


def _detect_shift_cycles(
    graph: dict[str, set[str]],
    calculations: list[dict],
    m_ref_map: dict | None,
) -> tuple[dict[str, int], dict[int, dict]]:
    """Detect SHIFT-based soft cycles. Returns (nodeToCluster, clusters)."""
    node_to_cluster: dict[str, int] = {}
    clusters: dict[int, dict] = {}

    if not calculations:
        return node_to_cluster, clusters

    def is_reachable(start: str, target: str) -> bool:
        if start == target:
            return True
        visited = {start}
        queue = [start]
        while queue:
            current = queue.pop(0)
            for dep in graph.get(current, set()):
                if dep == target:
                    return True
                if dep not in visited and dep in graph:
                    visited.add(dep)
                    queue.append(dep)
        return False

    all_cycle_sets = []
    for calc in calculations:
        node_id = f'R{calc["id"]}'
        formula = _rewrite_mrefs(calc.get('formula', ''), m_ref_map)
        shift_targets = _extract_shift_targets(formula)

        for target in shift_targets:
            if target not in graph:
                continue
            if is_reachable(target, node_id):
                # Soft cycle found
                cycle_nodes = {node_id, target}
                for n in graph:
                    if n.startswith('R') and is_reachable(target, n) and is_reachable(n, node_id):
                        cycle_nodes.add(n)
                all_cycle_sets.append(cycle_nodes)

    if not all_cycle_sets:
        return node_to_cluster, clusters

    # Merge overlapping sets
    merged: list[set[str]] = []
    for ns in all_cycle_sets:
        merged_into = None
        for i, m in enumerate(merged):
            if ns & m:
                merged_into = i
                break
        if merged_into is not None:
            merged[merged_into] |= ns
        else:
            merged.append(set(ns))

    calc_by_id = {f'R{c["id"]}': c for c in calculations}
    for cluster_id, node_set in enumerate(merged):
        members = [calc_by_id[n] for n in node_set if n in calc_by_id]
        for n in node_set:
            node_to_cluster[n] = cluster_id
        clusters[cluster_id] = {'members': members, 'internal_order': sorted(node_set)}

    return node_to_cluster, clusters


def _evaluate_cluster_period_by_period(
    cluster: dict, context: dict, timeline: dict, m_ref_map: dict | None,
) -> dict[str, np.ndarray]:
    """Evaluate a SHIFT-cycle cluster period by period."""
    periods = timeline['periods']
    members = cluster['members']
    internal_order = cluster['internal_order']

    results: dict[str, np.ndarray] = {}
    for node_id in internal_order:
        results[node_id] = np.zeros(periods)
        context[node_id] = results[node_id]

    calc_map = {f'R{c["id"]}': c for c in members}

    # Parse formulas
    parsed = {}
    for node_id in internal_order:
        calc = calc_map.get(node_id)
        if not calc or not calc.get('formula', '').strip():
            parsed[node_id] = None
            continue

        formula = _rewrite_mrefs(calc['formula'], m_ref_map)
        parsed[node_id] = formula

    # Accumulators for CUMSUM/CUMPROD/PREVSUM/COUNT in cluster mode
    # For simplicity, use the full formula evaluator per-period with growing context
    for i in range(periods):
        for node_id in internal_order:
            formula = parsed.get(node_id)
            if formula is None:
                results[node_id][i] = 0.0
                continue

            # Build a single-period evaluation
            # Replace SHIFT(X, n) with X[i-n], PREVSUM with cumulative, etc.
            # For cluster eval, we evaluate the full formula using context that has
            # partial results filled up to period i
            val = _eval_formula_at_period(formula, context, timeline, i)
            results[node_id][i] = val

    return results


def _eval_formula_at_period(formula: str, context: dict, timeline: dict, period: int) -> float:
    """Evaluate a formula at a single period index, handling array fns inline."""
    expr = formula

    # Handle PREVSUM: sum of inner for periods 0..i-1
    for m in re.finditer(r'PREVSUM\s*\(([^)]+)\)', expr, re.IGNORECASE):
        inner = m.group(1).strip()
        total = 0.0
        for j in range(period):
            total += _eval_simple_at_period(inner, context, j)
        expr = expr[:m.start()] + (f'({total})' if total < 0 else str(total)) + expr[m.end():]
        # Re-search since string changed
        return _eval_formula_at_period(expr, context, timeline, period)

    # Handle PREVVAL: inner at period i-1
    for m in re.finditer(r'PREVVAL\s*\(([^)]+)\)', expr, re.IGNORECASE):
        inner = m.group(1).strip()
        val = _eval_simple_at_period(inner, context, period - 1) if period > 0 else 0.0
        expr = expr[:m.start()] + (f'({val})' if val < 0 else str(val)) + expr[m.end():]
        return _eval_formula_at_period(expr, context, timeline, period)

    # Handle SHIFT(X, n)
    for m in re.finditer(r'SHIFT\s*\(\s*([^,]+)\s*,\s*(\d+)\s*\)', expr, re.IGNORECASE):
        inner = m.group(1).strip()
        n = int(m.group(2))
        val = _eval_simple_at_period(inner, context, period - n) if period >= n else 0.0
        expr = expr[:m.start()] + (f'({val})' if val < 0 else str(val)) + expr[m.end():]
        return _eval_formula_at_period(expr, context, timeline, period)

    # Handle CUMSUM: sum of inner for periods 0..i
    for m in re.finditer(r'CUMSUM\s*\(([^)]+)\)', expr, re.IGNORECASE):
        inner = m.group(1).strip()
        total = 0.0
        for j in range(period + 1):
            total += _eval_simple_at_period(inner, context, j)
        expr = expr[:m.start()] + (f'({total})' if total < 0 else str(total)) + expr[m.end():]
        return _eval_formula_at_period(expr, context, timeline, period)

    # Handle CUMPROD
    for m in re.finditer(r'CUMPROD\s*\(([^)]+)\)', expr, re.IGNORECASE):
        inner = m.group(1).strip()
        product = 1.0
        for j in range(period + 1):
            product *= _eval_simple_at_period(inner, context, j)
        expr = expr[:m.start()] + (f'({product})' if product < 0 else str(product)) + expr[m.end():]
        return _eval_formula_at_period(expr, context, timeline, period)

    # Handle COUNT
    for m in re.finditer(r'COUNT\s*\(([^)]+)\)', expr, re.IGNORECASE):
        inner = m.group(1).strip()
        cnt = 0
        for j in range(period + 1):
            if _eval_simple_at_period(inner, context, j) != 0:
                cnt += 1
        expr = expr[:m.start()] + str(cnt) + expr[m.end():]
        return _eval_formula_at_period(expr, context, timeline, period)

    # No more array functions - evaluate as simple expression
    return _eval_simple_at_period(expr, context, period)


def _eval_simple_at_period(expr: str, context: dict, period: int) -> float:
    """Evaluate a simple expression (no array fns) at a single period."""
    if period < 0:
        return 0.0

    found_refs = set(_REF_PATTERN.findall(expr))
    refs_sorted = sorted(found_refs, key=len, reverse=True)

    result_expr = expr
    for ref in refs_sorted:
        if ref in context:
            arr = context[ref]
            val = float(arr[period]) if arr is not None and period < len(arr) else 0.0
            val_str = f'({val})' if val < 0 else str(val)
            result_expr = re.sub(r'\b' + re.escape(ref) + r'\b', val_str, result_expr)

    result_expr = re.sub(r'\bR\d+\b', '0', result_expr)
    result_expr = _convert_excel_fns(result_expr)
    result_expr = _clean_expr(result_expr)
    return _safe_eval(result_expr)


# ---------------------------------------------------------------------------
# Module solver stubs (iterative_debt_sizing, dsrf)
# ---------------------------------------------------------------------------

def _resolve_module_input(value, context: dict, default: float = 0.0) -> float:
    """Resolve a module input: number, string number, or context reference."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        if value in context:
            arr = context[value]
            # Get first non-zero or first value
            for v in arr:
                if v != 0:
                    return float(v)
            return float(arr[0]) if len(arr) > 0 else default
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _resolve_module_input_array(value, context: dict, length: int, default: float = 0.0) -> np.ndarray:
    """Resolve a module input to a full array."""
    if isinstance(value, str) and value in context:
        return np.array(context[value], dtype=float)
    num = _resolve_module_input(value, context, default)
    return np.full(length, num)


def _is_period_end(month_idx: int, debt_period: str, timeline: dict) -> bool:
    if debt_period == 'M':
        return True
    month = int(timeline['month'][month_idx]) if month_idx < timeline['periods'] else ((month_idx % 12) + 1)
    if debt_period == 'Q':
        return month in (3, 6, 9, 12)
    if debt_period == 'Y':
        return month == 12
    return True


def _calculate_iterative_debt_sizing(inputs: dict, length: int, context: dict, timeline: dict) -> dict[str, np.ndarray]:
    """Binary search debt sizing solver."""
    contracted_cfads_ref = inputs.get('contractedCfadsRef')
    contracted_dscr = inputs.get('contractedDSCR', 1.35)
    merchant_cfads_ref = inputs.get('merchantCfadsRef')
    merchant_dscr = inputs.get('merchantDSCR', 1.50)
    cfads_ref = inputs.get('cfadsRef')
    target_dscr = inputs.get('targetDSCR', 1.4)
    debt_flag_ref = inputs.get('debtFlagRef')
    total_funding_ref = inputs.get('totalFundingRef')
    max_gearing_pct = _resolve_module_input(inputs.get('maxGearingPct', 65), context, 65)
    interest_rate_array = _resolve_module_input_array(inputs.get('interestRatePct', 5), context, length, 0)
    tenor_years = _resolve_module_input(inputs.get('tenorYears', 18), context, 18)
    debt_period = inputs.get('debtPeriod', 'Q')
    tolerance = _resolve_module_input(inputs.get('tolerance', 0.1), context, 0.1)
    max_iterations = int(_resolve_module_input(inputs.get('maxIterations', 50), context, 50))

    parsed_contracted_dscr = _resolve_module_input(contracted_dscr, context, 0)
    parsed_merchant_dscr = _resolve_module_input(merchant_dscr, context, 0)
    parsed_target_dscr = _resolve_module_input(target_dscr, context, 0)

    contracted_cfads = np.array(context.get(contracted_cfads_ref, np.zeros(length)), dtype=float) if contracted_cfads_ref else np.zeros(length)
    merchant_cfads = np.array(context.get(merchant_cfads_ref, np.zeros(length)), dtype=float) if merchant_cfads_ref else np.zeros(length)
    legacy_cfads = np.array(context.get(cfads_ref, []), dtype=float) if cfads_ref and cfads_ref in context else None

    use_new = contracted_cfads_ref or merchant_cfads_ref

    ds_capacity = np.zeros(length)
    total_cfads = np.zeros(length)
    for i in range(length):
        if use_new:
            cc = (contracted_cfads[i] / parsed_contracted_dscr) if parsed_contracted_dscr > 0 else 0
            mc = (merchant_cfads[i] / parsed_merchant_dscr) if parsed_merchant_dscr > 0 else 0
            ds_capacity[i] = cc + mc
            total_cfads[i] = contracted_cfads[i] + merchant_cfads[i]
        elif legacy_cfads is not None and i < len(legacy_cfads):
            ds_capacity[i] = (legacy_cfads[i] / parsed_target_dscr) if parsed_target_dscr > 0 else 0
            total_cfads[i] = legacy_cfads[i]

    debt_flag = np.array(context.get(debt_flag_ref, np.zeros(length)), dtype=float) if debt_flag_ref else np.zeros(length)
    debt_start = -1
    for i in range(length):
        if debt_flag[i] == 1:
            debt_start = i
            break

    if debt_start < 0:
        return {'sized_debt': np.zeros(length)}

    # Total funding
    total_funding = 0.0
    if total_funding_ref and isinstance(total_funding_ref, str) and total_funding_ref in context:
        fa = context[total_funding_ref]
        total_funding = float(fa[debt_start - 1]) if debt_start > 0 else float(fa[0])
    elif isinstance(total_funding_ref, (int, float)):
        total_funding = float(total_funding_ref)

    debt_flag_end = debt_start
    for i in range(length - 1, debt_start - 1, -1):
        if debt_flag[i] == 1:
            debt_flag_end = i
            break
    tenor_months = int(tenor_years * 12)
    debt_end = min(debt_start + tenor_months - 1, debt_flag_end, length - 1)

    # Binary search
    lower = 0.0
    upper = total_funding * (max_gearing_pct / 100)
    best_debt = 0.0

    for _ in range(max_iterations):
        if upper - lower <= tolerance:
            break
        test = (lower + upper) / 2

        # Generate schedule
        balance = test
        fully_repaid = True
        accrued_interest = 0.0
        accrued_capacity = 0.0
        accrued_cfads_val = 0.0
        ok = True

        for i in range(debt_start, min(debt_end + 1, length)):
            monthly_rate = (interest_rate_array[i] / 100 / 12)
            accrued_interest += balance * monthly_rate
            accrued_capacity += ds_capacity[i]
            accrued_cfads_val += total_cfads[i]

            is_pay = _is_period_end(i, debt_period, timeline) or i == debt_end
            if is_pay:
                remaining = 0
                for j in range(i, debt_end + 1):
                    if _is_period_end(j, debt_period, timeline) or j == debt_end:
                        remaining += 1

                interest = accrued_interest
                min_princ = balance / remaining if remaining > 0 else balance
                max_princ = max(0, accrued_capacity - interest)

                if i == debt_end:
                    princ = balance
                elif max_princ >= min_princ:
                    princ = min_princ
                else:
                    princ = max_princ
                    if princ < min_princ * 0.9:
                        ok = False

                princ = min(princ, balance)
                balance -= princ
                accrued_interest = 0.0
                accrued_capacity = 0.0
                accrued_cfads_val = 0.0

        fully_repaid = balance < 0.001
        if fully_repaid and ok:
            lower = test
            best_debt = test
        else:
            upper = test

    return {'sized_debt': np.full(length, best_debt)}


def _calculate_dsrf(inputs: dict, length: int, context: dict, timeline: dict) -> dict[str, np.ndarray]:
    """DSRF solver - facility limit, refi fees, effective margin."""
    dsrf_active = _resolve_module_input(inputs.get('dsrfActiveRef', 1), context, 1)
    if not dsrf_active:
        return {
            'facility_limit': np.zeros(length),
            'refi_fees': np.zeros(length),
            'effective_margin': np.zeros(length),
        }

    ds_ref = inputs.get('debtServiceRef')
    ops_flag_ref = inputs.get('operationsFlagRef')
    base_margin = _resolve_module_input(inputs.get('baseMarginPctRef', 1.75), context, 1.75)
    facility_months = int(_resolve_module_input(inputs.get('facilityMonthsRef', 6), context, 6))
    refi_schedule = inputs.get('refinancingSchedule', []) or []

    debt_service = np.array(context.get(ds_ref, np.zeros(length)), dtype=float) if ds_ref else np.zeros(length)
    ops_flag = np.array(context.get(ops_flag_ref, np.zeros(length)), dtype=float) if ops_flag_ref else np.zeros(length)

    ops_start = -1
    for i in range(length):
        if ops_flag[i] == 1:
            ops_start = i
            break
    if ops_start < 0:
        return {
            'facility_limit': np.zeros(length),
            'refi_fees': np.zeros(length),
            'effective_margin': np.zeros(length),
        }

    active_refis = sorted(
        [r for r in refi_schedule if r.get('active') and r.get('monthIndex', 0) > 0],
        key=lambda r: r['monthIndex'],
    )

    # Effective margin
    eff_margin = np.zeros(length)
    current_margin = base_margin
    next_refi = 0
    for i in range(length):
        if next_refi < len(active_refis) and i >= active_refis[next_refi]['monthIndex']:
            current_margin = active_refis[next_refi].get('marginPct', current_margin)
            next_refi += 1
        eff_margin[i] = current_margin

    # Facility limit
    fac_limit = np.zeros(length)
    recalc_points = [ops_start] + [r['monthIndex'] for r in active_refis if r['monthIndex'] > ops_start and r['monthIndex'] < length]
    current_limit = 0.0
    next_recalc = 0

    for i in range(length):
        if ops_flag[i] != 1:
            continue
        if next_recalc < len(recalc_points) and i >= recalc_points[next_recalc]:
            fwd_sum = sum(abs(debt_service[j]) for j in range(i, min(i + facility_months, length)))
            current_limit = fwd_sum
            while next_recalc < len(recalc_points) and recalc_points[next_recalc] <= i:
                next_recalc += 1
        fac_limit[i] = current_limit

    # Refi fees
    refi_fees = np.zeros(length)
    for r in active_refis:
        idx = r['monthIndex']
        if 0 <= idx < length and ops_flag[idx] == 1:
            fee_pct = r.get('feePct', 0) / 100
            refi_fees[idx] = fac_limit[idx] * fee_pct

    return {
        'facility_limit': fac_limit,
        'refi_fees': refi_fees,
        'effective_margin': eff_margin,
    }


# ---------------------------------------------------------------------------
# Main Engine
# ---------------------------------------------------------------------------

class GlassboxEngine:
    """
    Loads model JSON files, builds the reference map, and evaluates all calculations.

    Usage:
        engine = GlassboxEngine('/path/to/data')
        engine.run()
        # Access results
        engine.results['R4']  # Revenue array
        engine.get_result('Revenue')  # By name
    """

    def __init__(self, data_dir: str | Path | None = None, inputs_data: dict | None = None, calcs_data: dict | None = None):
        """
        Initialize engine from file paths or pre-loaded data.

        Args:
            data_dir: Path to data/ directory containing JSON files
            inputs_data: Pre-loaded model-inputs.json dict (overrides file load)
            calcs_data: Pre-loaded model-calculations.json dict (overrides file load)
        """
        if inputs_data and calcs_data:
            self._inputs_data = inputs_data
            self._calcs_data = calcs_data
        else:
            if data_dir is None:
                # Default: look for data/ relative to this file's grandparent
                data_dir = Path(__file__).parent.parent.parent / 'data'
            data_dir = Path(data_dir)
            with open(data_dir / 'model-inputs.json', 'r') as f:
                self._inputs_data = json.load(f)
            with open(data_dir / 'model-calculations.json', 'r') as f:
                self._calcs_data = json.load(f)

        self.config = self._inputs_data['config']
        self.timeline = build_timeline(self.config)
        self.context: dict[str, np.ndarray] = {}
        self.results: dict[str, np.ndarray] = {}
        self.module_outputs: dict[str, np.ndarray] = {}
        self.errors: dict[str, str] = {}

        # Build name -> id lookup for convenience
        self._calc_by_name: dict[str, dict] = {}
        for c in self._calcs_data.get('calculations', []):
            self._calc_by_name[c['name']] = c

    @property
    def periods(self) -> int:
        return self.timeline['periods']

    def get_result(self, name_or_ref: str) -> np.ndarray | None:
        """Get calculation result by name or R-ref."""
        if name_or_ref in self.results:
            return self.results[name_or_ref]
        c = self._calc_by_name.get(name_or_ref)
        if c:
            return self.results.get(f'R{c["id"]}')
        return None

    def get_input_ref(self, ref: str) -> np.ndarray | None:
        """Get an input reference array (V1.5, S1.14, C1.19, F2, etc.)."""
        return self.context.get(ref)

    def override_input(self, ref: str, value) -> None:
        """Override an input reference with a scalar or array value before running."""
        if isinstance(value, (int, float)):
            self.context[ref] = np.full(self.periods, float(value))
        elif isinstance(value, np.ndarray):
            self.context[ref] = value
        elif isinstance(value, list):
            self.context[ref] = np.array(value, dtype=float)

    def override_constant(self, ref: str, value: float) -> None:
        """Override a constant (e.g. C1.19) before running."""
        self.override_input(ref, value)

    def run(self) -> dict[str, np.ndarray]:
        """Execute the full calculation engine. Returns all results."""
        # Step 1: Build reference map
        self._build_reference_map()

        # Step 2: Build dependency graph and evaluate
        self._evaluate_all()

        return self.results

    def _build_reference_map(self) -> None:
        """Build all input references (V, S, C, F, I, T, L)."""
        inputs_data = self._inputs_data

        # Time constants
        time_refs = build_time_constants(self.timeline)
        self.context.update(time_refs)

        # Flags from key periods
        key_periods = inputs_data.get('keyPeriods', [])
        flag_refs = build_flag_refs(key_periods, self.timeline)
        self.context.update(flag_refs)

        # Indexation
        indices = inputs_data.get('indices', [])
        idx_refs = build_indexation_refs(indices, self.timeline)
        self.context.update(idx_refs)

        # Input group refs (V, S, C, L)
        input_glass = inputs_data.get('inputGlass', [])
        input_glass_groups = inputs_data.get('inputGlassGroups', [])
        group_refs = build_input_group_refs(
            input_glass, input_glass_groups, self.config,
            key_periods, self.timeline,
        )
        self.context.update(group_refs)

        # Store timeline in context for module access
        self.context['timeline'] = self.timeline

    def _evaluate_all(self) -> None:
        """Build graph, topo-sort, evaluate calculations and modules."""
        calculations = self._calcs_data.get('calculations', [])
        modules = self._calcs_data.get('modules', [])
        m_ref_map = self._calcs_data.get('_mRefMap', {})

        # Build dependency graph
        graph: dict[str, set[str]] = {}
        calc_lookup: dict[str, dict] = {}

        for calc in calculations:
            node_id = f'R{calc["id"]}'
            rewritten_formula = _rewrite_mrefs(calc.get('formula', ''), m_ref_map)
            deps = _extract_deps(rewritten_formula)
            # Filter to existing nodes only
            graph[node_id] = deps
            calc_lookup[node_id] = {**calc, '_rewritten': rewritten_formula}

        # Add non-converted modules
        module_lookup: dict[str, dict] = {}
        for idx, mod in enumerate(modules):
            if mod.get('converted') or mod.get('fullyConverted'):
                continue
            node_id = f'M{idx + 1}'
            deps = set()
            for v in (mod.get('inputs', {}) or {}).values():
                if isinstance(v, str):
                    for rm in re.finditer(r'\bR(\d+)(?!\d)', v):
                        deps.add(f'R{rm.group(1)}')
                    for mm in re.finditer(r'\bM(\d+)\.(\d+)', v):
                        deps.add(f'M{mm.group(1)}')
            graph[node_id] = deps
            module_lookup[node_id] = (mod, idx)

        # Filter deps to existing graph nodes
        all_nodes = set(graph.keys())
        for node_id in graph:
            graph[node_id] = graph[node_id] & all_nodes

        # Detect SHIFT cycles
        node_to_cluster, clusters = _detect_shift_cycles(graph, calculations, m_ref_map)

        # Add non-cyclical SHIFT deps to graph for ordering
        for calc in calculations:
            node_id = f'R{calc["id"]}'
            formula = _rewrite_mrefs(calc.get('formula', ''), m_ref_map)
            shift_targets = _extract_shift_targets(formula)
            for target in shift_targets:
                if target in graph and target != node_id:
                    # If not in same cluster, add as regular dep
                    if not (node_id in node_to_cluster and target in node_to_cluster and
                            node_to_cluster[node_id] == node_to_cluster[target]):
                        graph[node_id].add(target)

        # Augment: non-cluster nodes depending on cluster members depend on ALL members
        if node_to_cluster:
            for node_id, deps in graph.items():
                if node_id in node_to_cluster:
                    continue
                augmented = set()
                for dep in deps:
                    if dep in node_to_cluster:
                        cid = node_to_cluster[dep]
                        for m in clusters[cid]['members']:
                            augmented.add(f'R{m["id"]}')
                graph[node_id] = deps | augmented

        # Topological sort
        sorted_nodes = _topological_sort(graph)

        # Set internal order for clusters
        if clusters:
            node_pos = {n: i for i, n in enumerate(sorted_nodes)}
            for cid, cluster in clusters.items():
                cluster['internal_order'] = sorted(
                    [f'R{m["id"]}' for m in cluster['members']],
                    key=lambda n: node_pos.get(n, 0),
                )
                # Rewrite formulas
                cluster['members'] = [
                    {**c, 'formula': _rewrite_mrefs(c.get('formula', ''), m_ref_map)}
                    for c in cluster['members']
                ]

        # Evaluate in order
        evaluated_clusters: set[int] = set()
        # Find cluster trigger positions (last member in topo order)
        cluster_last_pos: dict[int, int] = {}
        for i, node_id in enumerate(sorted_nodes):
            cid = node_to_cluster.get(node_id)
            if cid is not None:
                cluster_last_pos[cid] = i
        trigger_pos: dict[int, int] = {pos: cid for cid, pos in cluster_last_pos.items()}

        for node_idx, node_id in enumerate(sorted_nodes):
            cid = node_to_cluster.get(node_id)

            if cid is not None:
                # Cluster member - evaluate only at trigger position
                tcid = trigger_pos.get(node_idx)
                if tcid is None or tcid in evaluated_clusters:
                    continue
                evaluated_clusters.add(tcid)

                cluster = clusters[tcid]
                cluster_results = _evaluate_cluster_period_by_period(
                    cluster, self.context, self.timeline, m_ref_map,
                )
                for rid, values in cluster_results.items():
                    self.results[rid] = values
                    self.context[rid] = values
                    # Populate M-ref aliases
                    for mref, rref in m_ref_map.items():
                        if rref == rid:
                            self.context[mref] = values
                            self.module_outputs[mref] = values

            elif node_id in calc_lookup:
                # Regular calculation
                calc = calc_lookup[node_id]
                formula = calc['_rewritten']
                try:
                    values = evaluate_formula(formula, self.context, self.timeline)
                    self.results[node_id] = values
                    self.context[node_id] = values
                    # Populate M-ref aliases
                    for mref, rref in m_ref_map.items():
                        if rref == node_id:
                            self.context[mref] = values
                            self.module_outputs[mref] = values
                except Exception as e:
                    self.errors[node_id] = str(e)
                    self.results[node_id] = np.zeros(self.periods)
                    self.context[node_id] = self.results[node_id]

            elif node_id in module_lookup:
                # Non-converted module (solver)
                mod, mod_idx = module_lookup[node_id]
                template_id = mod.get('templateId', '')
                mod_inputs = mod.get('inputs', {}) or {}

                if mod.get('enabled') is False:
                    continue

                if template_id == 'iterative_debt_sizing':
                    outputs = _calculate_iterative_debt_sizing(
                        mod_inputs, self.periods, self.context, self.timeline,
                    )
                elif template_id == 'dsrf':
                    outputs = _calculate_dsrf(
                        mod_inputs, self.periods, self.context, self.timeline,
                    )
                else:
                    outputs = {}

                # Map outputs to M-refs
                from .engine import _get_module_template
                template = _get_module_template(template_id)
                if template:
                    for out_idx, out_def in enumerate(template.get('outputs', [])):
                        ref = f'M{mod_idx + 1}.{out_idx + 1}'
                        arr = outputs.get(out_def['key'], np.zeros(self.periods))
                        self.module_outputs[ref] = arr
                        self.context[ref] = arr

        return self.results

    def get_all_calculation_names(self) -> list[tuple[str, str]]:
        """Return list of (R-ref, name) for all calculations."""
        return [
            (f'R{c["id"]}', c['name'])
            for c in self._calcs_data.get('calculations', [])
        ]

    def export_results(self, calc_ids: list[str] | None = None) -> dict[str, dict]:
        """
        Export results as a dict of { ref: { name, values, type } }.
        If calc_ids is None, exports all calculations.
        """
        output = {}
        calculations = self._calcs_data.get('calculations', [])
        calc_map = {f'R{c["id"]}': c for c in calculations}

        refs_to_export = calc_ids or list(self.results.keys())
        for ref in refs_to_export:
            if ref in self.results:
                calc = calc_map.get(ref, {})
                output[ref] = {
                    'name': calc.get('name', ref),
                    'formula': calc.get('formula', ''),
                    'type': calc.get('type', 'flow'),
                    'values': self.results[ref].tolist(),
                }
        return output


# Module template lookup (lightweight - just outputs list)
_MODULE_TEMPLATES_CACHE: dict[str, dict] | None = None

def _get_module_template(template_id: str) -> dict | None:
    """Get module template definition. Only needs output key list for Python engine."""
    # Minimal template definitions for non-converted modules
    templates = {
        'iterative_debt_sizing': {
            'outputs': [
                {'key': 'sized_debt', 'label': 'Sized Debt Amount'},
            ],
        },
        'dsrf': {
            'outputs': [
                {'key': 'facility_limit', 'label': 'Facility Limit'},
                {'key': 'refi_fees', 'label': 'Refinancing Fees'},
                {'key': 'effective_margin', 'label': 'Effective Margin (%)'},
            ],
        },
    }
    return templates.get(template_id)
