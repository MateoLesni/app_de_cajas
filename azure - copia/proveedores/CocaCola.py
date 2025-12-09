 # proveedores/coca_cola.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bCOCA\s*COLA\b",
    r"(?i)\bCOCA-COLA\b",
    r"(?i)\bCOCA\s*COLA\s*(?:FEMSA|COMPANY|SERVICES)?\b",
]

PROMPT = """
Proveedor: COCA COLA (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas generales:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: "81.704,32" => 81704.32 (coma decimal, punto de miles).
- Sin separadores de miles en la salida numérica.
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.
- No añadir texto fuera del JSON (sin encabezados, comentarios ni fences).

Mapeo específico (COCA COLA):
- "Codigo": tomar de la columna **Codigo** del comprobante (segunda columna del renglón).
- "Descripcion": tomar de la columna **Producto** (tercera columna).
- "Cantidad": tomar de la columna **Cantidad** (primera columna). Debe ser SOLO número (sin letras).
- "PrecioUnitario": tomar de la columna **P. Unitario**.
- "Subtotal": tomar de la columna **Subtotal**.
- "UnidadMedida": si no se indica claramente, dejar null.

Notas:
- Ignorar campos como "Cliente:" u otros metadatos; NO forman parte del JSON.
- La salida debe ser únicamente el JSON pedido, con la estructura indicada y los nombres de claves EXACTOS.
"""
