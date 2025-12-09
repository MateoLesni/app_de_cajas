# proveedores/avez.py
# -*- coding: utf-8 -*-
import pandas as pd
from typing import List, Dict

PATTERNS = [
    r"(?i)\bAVEZ\b",
    r"(?i)AVEZ\s*S\.?A\.?",
]

PROMPT = """
Proveedor: AVEZ (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: "81.704,32" => 81704.32 (coma decimal, punto de miles).
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.

Mapeo y pistas (AVEZ):
- "Codigo": columna/etiqueta COD o CODIGO (números sin separadores).
- "Descripcion": columna DETALLE (tercer columna típica).
- "Cantidad": columna CANT. (puede venir como "18,000"), normalizar coma decimal.
- "PrecioUnitario": columna UNITARIO.
- "Subtotal": columna TOTAL.
- "UnidadMedida": si no aparece, usar "KG" por defecto.

Salida:
- SOLO el JSON (sin texto adicional ni encabezados).
"""

