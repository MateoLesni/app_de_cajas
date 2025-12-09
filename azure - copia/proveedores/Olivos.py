# proveedores/jumbalay.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bJUMBALAY\b",
    r"(?i)\bJUMBALAY\s*S\.?A\.?\b",
]

PROMPT = """
Proveedor: JUMBALAY (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas generales:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: coma decimal y punto de miles (ej.: "5.142,00" => 5142.00).
- Sin separadores de miles en la salida numérica.
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.
- SOLO el JSON (sin texto extra, encabezados ni fences).

Mapeo específico (JUMBALAY):
- "Codigo": columna **Código** (segunda columna del renglón).
- "Descripcion": columna **Descripción**.
- "Cantidad": columna **Cant.** (primer columna; solo número, normalizar separador decimal a punto si aparece coma).
- "PrecioUnitario": columna **Precio Unitario**.
- "Subtotal": columna **Subtotal (- Descuento)** (última columna del renglón).
- "UnidadMedida": si no se indica con certeza, dejar null.

Notas:
- El “Local” fijo **TOSTADO** y otros metadatos NO forman parte del JSON pedido acá.
- Mantener exactamente las claves: ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"].
"""
