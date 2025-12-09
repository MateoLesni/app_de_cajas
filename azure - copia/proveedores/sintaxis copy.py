# -*- coding: utf-8 -*-
# proveedores/sintaxis.py
#
# Plugin para proveedor "Sintaxis" en el formato nuevo del flujo.
# El core utilizará:
#   - PATTERNS: detección por nombre de archivo
#   - PROMPT:   contexto extra para extracción FULL con Gemini (JSON)
#   - transform_azure (opcional): normaliza salida de Azure ANTES de decidir Gemini
#   - transform_items (opcional): normaliza salida de Gemini
#
# Esquema esperado por el core (por ítem):
# ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

from typing import List, Dict
import pandas as pd

# ---- Coincidencias por nombre de archivo (case-insensitive) ----
PATTERNS = [
    r"(?i)\bSintaxis\b",
]

# ---- Prompt JSON para Gemini (no CSV) ----
PROMPT = """
Proveedor: Sintaxis.

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Mapeo en esta factura:
- "Codigo": corresponde a la columna "Código" (si no existe, usar null).
- "Descripcion": corresponde a la columna "Descripción" (solo la descripción del producto).
- "Cantidad": corresponde a la columna "Cantidad".
- "PrecioUnitario": corresponde a "P. Lista".
- "Subtotal": corresponde a "Total".
- "UnidadMedida": si no está explícita, usar null.

Reglas:
- Devolver SOLO el JSON pedido (sin texto/markdown extra).
- Números como números (no strings). Interpretación local: "1.234,56" => 1234.56 (coma decimal, punto de miles).
- No usar separadores de miles en la salida; solo punto como separador decimal si hace falta.
- Redondear "PrecioUnitario" y "Subtotal" a 2 decimales cuando corresponda.
- Mantener el orden natural de lectura (una línea por producto).
- Si un dato no es legible con certeza, usar null.
- Consistencia: Subtotal = Cantidad * PrecioUnitario (2 decimales). Si no podés garantizarla, priorizá valores legibles sin inventar.
- Ignorar remitos, totales globales, descuentos y notas al pie.
- El "Local" (cliente) no forma parte de cada ítem; no incluirlo en estos campos.
"""

# ------------------------------------------------------------
# Helpers locales mínimos
# ------------------------------------------------------------
def _to_float_local(x):
    """Convierte '1.234,56'->1234.56, '6,00'->6.0; tolerante a $ y espacios."""
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip().replace("$", "").replace(" ", "")
    if s == "":
        return None
    # coma decimal y punto de miles
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    # múltiples puntos: conservar el último como decimal
    if s.count(".") > 1:
        parts = s.split(".")
        s = "".join(parts[:-1]) + "." + parts[-1]
    try:
        return float(s)
    except Exception:
        return None

def _ensure_schema(df: pd.DataFrame) -> pd.DataFrame:
    for col in ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]:
        if col not in df.columns:
            df[col] = None
    return df

# ------------------------------------------------------------
# 1) Transformación sobre AZURE (opcional)
# ------------------------------------------------------------
def transform_azure(items: List[Dict]) -> List[Dict]:
    """
    Normaliza salida de Azure para Sintaxis:
      - Convierte Cantidad/PrecioUnitario/Subtotal a float robusto.
      - Si hay (Cantidad>0 y Subtotal), fija PrecioUnitario = Subtotal/Cantidad.
      - Recalcula Subtotal = Cantidad * PrecioUnitario (2 decimales).
      - UnidadMedida por defecto 'UNI' si viene vacía.
    """
    if not items:
        return items

    df = _ensure_schema(pd.DataFrame(items))

    qty  = df["Cantidad"].apply(_to_float_local)
    unit = df["PrecioUnitario"].apply(_to_float_local)
    sub  = df["Subtotal"].apply(_to_float_local)

    # Precio derivado desde subtotal/cantidad cuando haya datos
    mask_price = qty.notna() & sub.notna() & (qty > 0)
    df.loc[mask_price, "PrecioUnitario"] = (sub[mask_price] / qty[mask_price]).round(2)

    # Recalcular subtotal con el precio final
    unit = df["PrecioUnitario"].apply(_to_float_local)
    mask_sub = qty.notna() & unit.notna()
    df.loc[mask_sub, "Subtotal"] = (qty[mask_sub] * unit[mask_sub]).round(2)

    # Unidad por defecto
    df["UnidadMedida"] = df["UnidadMedida"].apply(lambda x: x if x not in (None, "", " ") else "UNI")

    return df.to_dict(orient="records")

# ------------------------------------------------------------
# 2) Transformación POST-Gemini (opcional)
# ------------------------------------------------------------
def transform_items(items: List[Dict]) -> List[Dict]:
    """
    Normaliza salida de Gemini para Sintaxis:
      - Convierte Cantidad/PrecioUnitario/Subtotal a float robusto.
      - PrecioUnitario := Subtotal/Cantidad (si aplica).
      - Recalcula Subtotal = Cantidad * PrecioUnitario (2 decimales).
      - UnidadMedida por defecto 'UNI' si viene vacía.
    """
    if not items:
        return items

    df = _ensure_schema(pd.DataFrame(items))

    qty  = df["Cantidad"].apply(_to_float_local)
    unit = df["PrecioUnitario"].apply(_to_float_local)
    sub  = df["Subtotal"].apply(_to_float_local)

    # Derivar precio desde subtotal/cantidad cuando sea posible
    mask_price = qty.notna() & sub.notna() & (qty > 0)
    df.loc[mask_price, "PrecioUnitario"] = (sub[mask_price] / qty[mask_price]).round(2)

    # Recalcular subtotal para asegurar consistencia
    unit = df["PrecioUnitario"].apply(_to_float_local)
    mask_sub = qty.notna() & unit.notna()
    df.loc[mask_sub, "Subtotal"] = (qty[mask_sub] * unit[mask_sub]).round(2)

    # Unidad por defecto
    df["UnidadMedida"] = df["UnidadMedida"].apply(lambda x: x if x not in (None, "", " ") else "UNI")

    return df.to_dict(orient="records")
