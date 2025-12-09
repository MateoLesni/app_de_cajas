"""
Utility functions for invoice processing
"""
import re
import math
from typing import List, Dict, Tuple, Optional
from decimal import Decimal, InvalidOperation


def has_digits(s: str) -> bool:
    """Check if string contains any digits"""
    return any(ch.isdigit() for ch in s)


def to_float(x):
    """
    Convert to float if possible. Accepts:
      - int/float/Decimal
      - numpy numeric
      - str with symbols ($, spaces, thousands . and decimal ,)
    Returns float or None. If no digits in string, returns None.
    """
    if x is None:
        return None
    if isinstance(x, float):
        return x
    if isinstance(x, int):
        return float(x)
    if isinstance(x, Decimal):
        try:
            return float(x)
        except (ValueError, InvalidOperation):
            return None

    try:
        import numpy as np
        if isinstance(x, (np.integer, np.floating)):
            return float(x)
    except Exception:
        pass

    if isinstance(x, str):
        s = x.strip()
        if s == "":
            return None
        if not has_digits(s):
            return None
        s = s.replace("$", "").replace("\u00A0", " ").strip()
        s = re.sub(r"(?<=\d)\.(?=\d{3}\b)", "", s)
        s = s.replace(",", ".")
        s = s.replace(" ", "")
        try:
            return float(s)
        except Exception:
            return None
    return None


def is_nan(v) -> bool:
    """Check if value is NaN"""
    try:
        return isinstance(v, float) and math.isnan(v)
    except Exception:
        return False


def is_empty_numeric(val) -> bool:
    """
    True only if really empty:
      - None or "" → True
      - String without digits (e.g. "-", "n/a") → True
      - NaN → True
      - Any value with digits (includes "0", "0,00", "$ 0") → False if parses
    """
    if val is None:
        return True
    if isinstance(val, str):
        if val.strip() == "":
            return True
        if not has_digits(val):
            return True
    f = to_float(val)
    if f is None:
        return True
    return is_nan(f)


def normalize_desc(desc) -> str:
    """Normalize description text"""
    if desc is None:
        return ""
    s = str(desc)
    s = s.replace("\r\n", " ").replace("\n", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def unwrap_azure_num(x):
    """
    Extract float from Azure values:
    - CurrencyValue (has .amount) -> float(amount)
    - int/float/Decimal -> float
    - str -> to_float(str)
    - others -> to_float(x)
    """
    if x is None:
        return None
    amt = getattr(x, "amount", None)
    if amt is not None:
        try:
            return float(amt)
        except Exception:
            pass
    if isinstance(x, (int, float, Decimal)):
        try:
            return float(x)
        except Exception:
            return None
    return to_float(x)


def sanitize_azure_items(items: List[Dict]) -> List[Dict]:
    """Sanitize items from Azure Form Recognizer"""
    out = []
    for it in items:
        desc = normalize_desc(it.get("Descripcion"))
        qty = to_float(it.get("Cantidad"))
        unit = to_float(it.get("PrecioUnitario"))
        sub = to_float(it.get("Subtotal"))

        if (sub is None or is_nan(sub)) and (qty is not None and not is_nan(qty)) and (unit is not None and not is_nan(unit)):
            sub = round(qty * unit, 2)

        out.append({
            "Codigo": it.get("Codigo"),
            "Descripcion": desc,
            "Cantidad": qty,
            "PrecioUnitario": unit,
            "Subtotal": sub,
        })
    return out


def should_full_handoff_default(items: List[Dict]) -> Tuple[bool, List[str]]:
    """
    Default validation to decide if we should use Gemini FULL

    Returns:
        (should_handoff, reasons)
    """
    reasons: List[str] = []
    EPS = 0.01

    for idx, it in enumerate(items, start=1):
        desc = normalize_desc(it.get("Descripcion"))
        if desc == "":
            reasons.append(f"Row {idx}: Empty description")
            return True, reasons

        qty_raw = it.get("Cantidad")
        unit_raw = it.get("PrecioUnitario")
        sub_raw = it.get("Subtotal")

        if is_empty_numeric(qty_raw) or is_empty_numeric(unit_raw) or is_empty_numeric(sub_raw):
            reasons.append(
                f"Row {idx}: Empty/unconvertible numeric field "
                f"(qty={qty_raw}, unit={unit_raw}, subtotal={sub_raw})"
            )
            return True, reasons

        qty = to_float(qty_raw)
        unit = to_float(unit_raw)
        sub = to_float(sub_raw)

        if qty is None or unit is None or sub is None or is_nan(qty) or is_nan(unit) or is_nan(sub):
            reasons.append(
                f"Row {idx}: NaN/unconvertible numeric field "
                f"(qty={qty_raw}, unit={unit_raw}, subtotal={sub_raw})"
            )
            return True, reasons

        calc = round(unit * qty, 2)
        sub_r = round(sub, 2)
        if abs(calc - sub_r) > EPS:
            reasons.append(
                f"Row {idx}: unit*qty - subtotal out of tolerance "
                f"({unit}*{qty}={calc} vs {sub_r}, diff={calc - sub_r})"
            )
            return True, reasons

    return False, reasons
