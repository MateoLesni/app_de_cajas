# proveedores/pereira.py
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
- Sin separadores de miles en la salida numérica.
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.
- SOLO el JSON (sin texto extra, encabezados ni fences).

Mapeo específico (PEREIRA):
- "Codigo": columna **Cód** (primer campo del renglón; solo números).
- "Descripcion": columna **Producto** (segundo campo).
- "Cantidad": columna **Kilos** (traer el valor tal cual y normalizar separador decimal a punto).
- "PrecioUnitario": columna **Precio**.
- "Subtotal": columna **Importe**.
- "UnidadMedida": si la columna de cantidad es **Kilos**, usar "KG"; si no se puede determinar, dejar null.

Notas:
- El campo “Razón social:” (Local) u otros metadatos NO forman parte del JSON.
- Mantener exactamente las claves: ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"].
"""
