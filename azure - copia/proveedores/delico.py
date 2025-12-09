# -*- coding: utf-8 -*-
# proveedores/le_soleil.py
#
# Plugin para "Proveeduría / Le Soleil".
# - Detecta por nombre de archivo.
# - PROMPT para Gemini (si se usa FULL).
# - transform_azure: fuerza Cantidad = Subtotal / PrecioUnitario (cuando ambos existan).
#
# No define transform_items ni reglas custom de FULL.

import re
from typing import List, Dict, Optional
from decimal import Decimal, InvalidOperation

# -------------------------
# Detección por nombre
# -------------------------
PATTERNS = [
'delico', 'deliko']        

# -------------------------
# Prompt para Gemini (JSON)
# -------------------------
PROMPT = """
Proveedor: Proveeduría Le Soleil.

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Layout típico y mapeo de columnas:
- "Codigo": columna "Código".
- "Descripcion": columna "Descripción".
- "Cantidad": columna "Cant. Kg/Lt" (usar SOLO el número, sin texto como 'Kg', 'Lt' o 'UN').
- "PrecioUnitario": columna "Precio".
- "Subtotal": columna "Importe" (total por ítem).
- "UnidadMedida": si aparece (p.ej. 'Kg', 'Lt', 'UN'), usarla; si no está explícita, devolver null.

Reglas:
- Devolver ÚNICAMENTE el JSON pedido (sin texto adicional, sin markdown).
- Los campos numéricos deben ser números (no strings).
- Interpretación local de números: "1.234,56" => 1234.56 (coma decimal, punto de miles).
- En la salida NO usar separadores de miles; solo punto para decimales cuando corresponda.
- Mantener el orden natural de lectura (una línea por producto).
- Si un dato no es legible con certeza, usar null.
- Ignorar remitos, totales globales, descuentos y notas al pie.
"""

# -------------------------
# Helpers locales
# -------------------------
_NUM_THOUSANDS = re.compile(r"(?<=\d)\.(?=\d{3}\b)")

def _to_float_local(x: Optional[object]) -> Optional[float]:
    """Convierte a float si es posible; acepta int/float/Decimal/str con formato local."""
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
    if isinstance(x, str):
        s = x.strip()
        if s == "":
            return None
        # quitar $, NBSP, miles y normalizar coma decimal
        s = s.replace("$", "").replace("\u00A0", " ")
        s = _NUM_THOUSANDS.sub("", s)  # 1.234,56 -> 1234,56
        s = s.replace(",", ".").replace(" ", "")
        try:
            return float(s)
        except Exception:
            return None
    return None

def _normalize_desc(desc: Optional[object]) -> str:
    s = "" if desc is None else str(desc)
    s = s.replace("\r\n", " ").replace("\n", " ")
    return re.sub(r"\s+", " ", s).strip()

# -------------------------
# Transformación sobre AZURE
# -------------------------
def transform_azure(items: List[Dict]) -> List[Dict]:
    """
    Para Proveeduría:
    - Fuerza Cantidad = Subtotal / PrecioUnitario cuando ambos existan y el unit != 0.
    - Si no se puede calcular, deja la cantidad original.
    - Aplica normalización leve de descripción.
    """
    out: List[Dict] = []
    for it in items:
        unit = _to_float_local(it.get("PrecioUnitario"))
        sub  = _to_float_local(it.get("Subtotal"))

        # cálculo de cantidad: Subtotal / UnitPrice
        if unit is not None and unit != 0 and sub is not None:
            qty = round(sub / unit, 3)  # 3 decimales para Kg/Lt
        else:
            qty = _to_float_local(it.get("Cantidad"))

        out.append({
            "Codigo":         it.get("Codigo"),
            "Descripcion":    _normalize_desc(it.get("Descripcion")),
            "Cantidad":       qty,
            "PrecioUnitario": unit if unit is not None else it.get("PrecioUnitario"),
            "Subtotal":       sub  if sub  is not None else it.get("Subtotal"),
        })
    return out

# (Opcional) Post-procesamiento de Gemini:
# def transform_items(items: List[Dict]) -> List[Dict]:
#     return items

# (Opcional) Regla FULL personalizada:
# def should_full_handoff_custom(items: List[Dict]):
#     return False, []
