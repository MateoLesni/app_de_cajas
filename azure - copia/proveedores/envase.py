# proveedores/todo_envase.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bTODO\s+ENVASE\b",
    r"(?i)\bTODO\s+ENVASE\s*S\.?A\.?",
    r"(?i)\bTODOENVASE\b",
]

PROMPT = """
Proveedor: TODO ENVASE (gastronómico).

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

Mapeo específico (TODO ENVASE):
- "Codigo": columna **N° Articulo** (primer columna).
- "Descripcion": columna **Articulo Descripción**.
- "Cantidad": columna **Unidades** (solo número; normalizar separador decimal a punto si aplica).
- "PrecioUnitario": columna **P. Unitario**.
- "Subtotal": columna **Importe**.
- "UnidadMedida": si no se indica, dejar null.

Notas:
- El campo “Local” fijo **TOSTADO** NO forma parte del JSON pedido aquí.
- No agregar ni quitar claves: usar exactamente ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"].
"""
