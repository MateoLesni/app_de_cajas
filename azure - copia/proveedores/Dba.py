# proveedores/distribuidoras_dba.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bDBA\b",
    r"(?i)\bD\.?B\.?A\.?\b",
    r"(?i)\bDISTRIBUIDORAS?\s+DBA\b",
]

PROMPT = """
Proveedor: DISTRIBUIDORAS DBA (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas generales:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: "81.704,32" => 81704.32 (coma decimal, punto de miles).
- Sin separadores de miles en la salida numérica.
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.
- NO agregar texto fuera del JSON (sin encabezados, comentarios ni fences).

Mapeo específico (DISTRIBUIDORAS DBA):
- "Codigo": el comprobante **no muestra código** → usar 0 en todas las líneas.
- "Descripcion": columna **Descripción** (segunda columna).
- "Cantidad": columna **Cantidad** (primera columna). Debe ser solo número.
- "PrecioUnitario": columna **Precio s/Impuestos** (sexta columna del ítem).
- "Subtotal": columna **Subtotal** del renglón.
- "UnidadMedida": si no se indica, dejar null.

Notas:
- El campo "Cliente:" u otros metadatos NO forman parte del JSON pedido aquí.
- La salida debe ser únicamente el JSON con las claves EXACTAS indicadas.
"""
