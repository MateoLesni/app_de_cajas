# proveedores/verduleria.py
# -*- coding: utf-8 -*-
"""
Plugin mínimo para tickets de verdulería/frutería.
- Detecta por nombre de archivo.
- No define PROMPT específico (no fuerza Gemini).
- Hace una normalización muy leve de la descripción en transform_azure.
"""
import re
from typing import List, Dict

# Coincidencias típicas en nombres de archivo:
#   "Verduleria 66", "Verdulería", "Frutería", etc.
PATTERNS = [
    r"(?i)\bverduler(ía|ia)\b",
    r"(?i)\bverduler(ía|ia)\s*\d{1,3}\b",
    r"(?i)\bfruter(ía|ia)\b",
    r"(?i)\bverduler(a)?\s*66\b",
]

# Sin prompt específico: dejamos cadena vacía para no romper el import ni forzar cambios
PROMPT = ""

def transform_azure(items: List[Dict]) -> List[Dict]:
    """
    Normalización leve para evitar falsos vacíos en la descripción:
    - Aplana saltos de línea y espacios duplicados.
    - Mantiene numéricos tal cual (el sanitizado robusto ya lo hace el core).
    """
    out: List[Dict] = []
    for it in items:
        desc = it.get("Descripcion")
        if desc is None:
            desc_str = ""
        else:
            desc_str = str(desc).replace("\r\n", " ").replace("\n", " ")
            desc_str = re.sub(r"\s+", " ", desc_str).strip()

        out.append({
            "Codigo": it.get("Codigo"),
            "Descripcion": desc_str,
            "Cantidad": it.get("Cantidad"),
            "PrecioUnitario": it.get("PrecioUnitario"),
            "Subtotal": it.get("Subtotal"),
        })
    return out

# Si quisieras postprocesar lo que venga de Gemini (no necesario):
# def transform_items(items: List[Dict]) -> List[Dict]:
#     return items

# Si quisieras una regla especial para decidir FULL (no necesario; usamos la default corregida):
# def should_full_handoff_custom(items: List[Dict]):
#     return False, []
