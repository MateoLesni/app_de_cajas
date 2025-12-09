# proveedores/pereira_total_sin_imp.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bPEREIRA\b",
    r"(?i)\bPEREIRA\s*S\.?A\.?\b",
]

PROMPT = """
Proveedor: PEREIRA (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas generales:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: coma decimal y punto de miles (ej.: "5.142,00" => 5142.00).
- En la salida numérica: sin separadores de miles y con punto como separador decimal.
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.
- SOLO el JSON (sin texto extra, encabezados ni fences).

Mapeo específico (PEREIRA):
- "Codigo": columna **Código** (primera columna del renglón; debe ser numérico sin puntos ni comas).
- "Descripcion": columna **Descripción** (segunda columna).
- "Cantidad": columna **Cantidad** (tercera columna; traer solo número y normalizar coma/punto).
- "PrecioUnitario": columna **I.Unitario**.
- "Subtotal": columna **Total S/Imp.** (importe del renglón sin impuestos).
- "UnidadMedida": si no hay indicación clara, dejar null (lo completamos luego).

Notas:
- Campos como “Razón social:” (Local) u otros metadatos NO forman parte del JSON.
- Mantener **exactamente** las claves: ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"].
"""
