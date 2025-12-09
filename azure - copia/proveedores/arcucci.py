# proveedores/arcucci.py
# -*- coding: utf-8 -*-
import pandas as pd
from typing import List, Dict, Tuple

PATTERNS = [
    r"(?i)\bARCUCCI\b",
    r"(?i)ARCUCCI\s*S\.?A\.?",
]

PROMPT = """
Proveedor: ARCUCCI (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: "81.704,32" => 81704.32 (coma decimal, punto de miles).
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.

Mapeo y pistas (ARCUCCI):
- "Codigo": números que aparecen antes de la descripción (sin separadores).
- "Descripcion": artículos de limpieza/packaging, etc. No confundir con código.
- "Cantidad": número después de la descripción (formato típico "3,00" => 3.00).
- "PrecioUnitario": si no se ve, puede quedar null.
- "Subtotal": total de la línea.
- "UnidadMedida": si no aparece, podés dejar null (lo completamos luego).
"""

def _to_float_local(x):
    if x is None: return None
    if isinstance(x, (int, float)): return float(x)
    s = str(x).strip()
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    return float(s) if s else None

def transform_azure(items: List[Dict]) -> List[Dict]:
    """
    Normaliza SIEMPRE lo que venga de Azure para ARCUCCI:
      - UnidadMedida por defecto 'UNI' si viene vacía.
      - PrecioUnitario := Subtotal / Cantidad (si qty>0 y hay subtotal), aunque ya exista.
      - Subtotal := Cantidad * PrecioUnitario (redondeado a 2).
    """

    def _to_float_local(x):
        if x is None: return None
        if isinstance(x, (int, float)): return float(x)
        s = str(x).strip()
        if "," in s:
            s = s.replace(".", "").replace(",", ".")
        return float(s) if s else None

    df = pd.DataFrame(items)
    for col in ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]:
        if col not in df.columns:
            df[col] = None

    # Unidad por defecto
    df["UnidadMedida"] = df["UnidadMedida"].apply(lambda x: x if x not in (None, "", " ") else "UNI")

    qty  = df["Cantidad"].apply(_to_float_local)
    sub  = df["Subtotal"].apply(_to_float_local)

    # SIEMPRE recalcular PrecioUnitario cuando hay datos suficientes
    mask = qty.notna() & sub.notna() & (qty > 0)
    df.loc[mask, "PrecioUnitario"] = (sub[mask] / qty[mask]).round(2)

    # Recalcular Subtotal con el nuevo precio para asegurar consistencia
    price = df["PrecioUnitario"].apply(_to_float_local)
    mask2 = qty.notna() & price.notna()
    df.loc[mask2, "Subtotal"] = (qty[mask2] * price[mask2]).round(2)

    return df.to_dict(orient="records")


# --- 3) Transformación post-Gemini ---
def transform_items(items: List[Dict]) -> List[Dict]:
    """
    Post-Gemini: fijar PrecioUnitario = Subtotal / Cantidad (si aplica) y Unidad='UNI' si falta.
    """
    df = pd.DataFrame(items)
    for col in ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]:
        if col not in df.columns:
            df[col] = None

    qty  = df["Cantidad"].apply(_to_float_local)
    sub  = df["Subtotal"].apply(_to_float_local)

    mask = qty.notna() & sub.notna() & (qty > 0)
    df.loc[mask, "PrecioUnitario"] = (sub[mask] / qty[mask]).round(2)
    df.loc[mask, "Subtotal"] = (qty[mask] * df.loc[mask, "PrecioUnitario"]).round(2)

    df["UnidadMedida"] = df["UnidadMedida"].apply(lambda x: x if x else "UNI")

    return df.to_dict(orient="records")
