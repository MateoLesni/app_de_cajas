# proveedores/distribuidora_el_criollo.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bDISTRIBUIDORA\s+EL\s+CRIOLLO\b",
    r"(?i)\bEL\s+CRIOLLO\s+DISTRIBUIDORA\b",
]

PROMPT = """
Proveedor: DISTRIBUIDORA EL CRIOLLO (gastronómico).

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

Mapeo específico (DISTRIBUIDORA EL CRIOLLO):
- "Codigo": **no se muestra en la factura** → usar 0 en todas las líneas.
- "Descripcion": columna **Descripción** (tercer campo).
- "Cantidad": columna **Cant./KG** (copiar el valor y normalizar el separador decimal a punto).
- "PrecioUnitario": columna **P.U.** (normalizar separador decimal a punto).
- "Subtotal": columna **Total** del renglón (normalizar separador decimal a punto).
- "UnidadMedida": si no se indica con certeza (kg, uni, etc.), dejar null.

Notas:
- El campo "Cliente:" u otros metadatos NO forman parte del JSON.
- La salida debe ser únicamente el JSON con las claves EXACTAS indicadas.
"""
