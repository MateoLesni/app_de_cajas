# proveedores/deposito_central.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bDEP[ÓO]SITO\s+CENTRAL\b",
    r"(?i)\bDEP[ÓO]SITO\s+CENTRAL\s*S\.?A\.?",
    "Deposito"
]

PROMPT = """
Proveedor: DEPÓSITO CENTRAL (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas generales:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: coma decimal y punto de miles. Ej.: "81.704,32" => 81704.32.
- Sin separadores de miles en la salida numérica.
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.
- SOLO el JSON (sin texto extra, encabezados ni fences).

Mapeo específico (DEPÓSITO CENTRAL):
- "Codigo": columna **Codigo** (primer columna de la tabla).
- "Descripcion": columna **DESCRIPCION**.
- "Cantidad": columna **Cantidad** (tercera columna). Normalizar coma/punto decimal.
- "PrecioUnitario": columna **Precio Neto Unitario**.
- "Subtotal": columna **Total Neto**.
- "UnidadMedida": si no aparece, dejar null.

Casos especiales de "Subtotal" (Total Neto) con múltiples puntos:
- Si el valor tiene más de un punto y no hay coma (p. ej. "18.974.700"), interpretarlo como miles + 2 decimales finales:
  - "18.974.700" → 18974.00
  - "5.234.800"  → 5234.80
- Regla: eliminar puntos de miles y considerar los **últimos dos dígitos** como decimales cuando aplique.
- Nunca devolver montos con más de una coma ni con decimales absurdos.

Notas:
- Si falta algún dato tras revisar el OCR, dejar 0 o null según corresponda (no inventar).
"""
