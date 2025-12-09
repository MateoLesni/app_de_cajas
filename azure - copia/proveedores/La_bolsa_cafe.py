# proveedores/la_bolsa_cafe.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bLA\s+BOLSA\s+CAF[EÉ]\b",
    r"(?i)\bLA\s+BOLSA\s+CAF[EÉ]\s*S\.?A\.?",
]

PROMPT = """
Proveedor: LA BOLSA CAFÉ (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: "81.704,32" => 81704.32 (coma decimal, punto de miles).
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.

Mapeo y pistas (LA BOLSA CAFÉ):
- "Codigo": corresponde a la columna **Cod. Art** del comprobante.
- "Descripcion": corresponde a la columna **Detalle** (segunda columna).
- "Cantidad": corresponde a la columna **Cantidad** (tercera columna). Puede venir con coma o punto como separador decimal, normalizar a punto.
- "PrecioUnitario": corresponde a la columna **Precio Unitario**.
- "Subtotal": corresponde a la columna **Importe**.
- "UnidadMedida": si no aparece, dejar null.

Notas:
- El campo "Local" (texto que sigue a "Señor(es):") no forma parte del JSON pedido aquí.
- No usar separadores de miles.
- SOLO el JSON, sin texto adicional, encabezados ni comentarios.
"""
