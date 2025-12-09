# -*- coding: utf-8 -*-
# proveedores/le_soleil.py
#
# Plugin mínimo para proveedor "Le Soleil".
# Solo define:
#   - PATTERNS: detección por nombre de archivo
#   - PROMPT:   contexto extra para extracción FULL con Gemini (JSON)
#
# Nota: No incluye transform_azure / transform_items / reglas custom.
#       El core únicamente concatenará este PROMPT cuando deba usar Gemini.

# ---- Coincidencias por nombre de archivo (case-insensitive) ----
PATTERNS = [
    r"(?i)\bLe\s*Soleil\b",
    r"(?i)\bSoleil\b",
]

# ---- Prompt JSON para Gemini (no CSV) ----
PROMPT = """
Proveedor: Le Soleil.

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Layout típico y mapeo de columnas:
- "Codigo": columna "Código".
- "Descripcion": columna "Descripción".
- "Cantidad": columna "Cant. Kg/Lt" (usar SOLO el número, sin texto como 'Kg', 'Lt' o 'UN').
- "PrecioUnitario": columna "Precio".
- "Subtotal": columna "Importe" (total por ítem).
- "UnidadMedida": si aparece (p.ej. 'Kg', 'Lt', 'UN'), usarla; si no está explícita, devolver null.

Reglas:
- Devolver ÚNICAMENTE el JSON pedido (sin texto adicional, sin markdown).
- Los campos numéricos deben ser números (no strings).
- Interpretación local de números: "1.234,56" => 1234.56 (coma decimal, punto de miles).
- En la salida NO usar separadores de miles; solo punto para decimales cuando corresponda.
- Mantener el orden natural de lectura (una línea por producto).
- Si un dato no es legible con certeza, usar null.
- Ignorar remitos, totales globales, descuentos y notas al pie.
"""
