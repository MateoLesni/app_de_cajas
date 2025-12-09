# proveedores/buenos_ayres_vinos_y_bebidas_sa.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bBUENOS\s+AYRES\s+VINOS\s+Y\s+BEBIDAS\s+S\.?A\.?\b",
    r"(?i)\bBUENOS\s+AYRES\s+VINOS\s+Y\s+BEBIDAS\b",
]

PROMPT = """
Proveedor: BUENOS AYRES VINOS Y BEBIDAS SA (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: "81.704,32" => 81704.32 (coma decimal, punto de miles).
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.

Mapeo y pistas (BUENOS AYRES VINOS Y BEBIDAS SA):
- "Codigo": corresponde a la columna **CODIGO** (primer campo del renglón).
- "Descripcion": corresponde a la columna **DETALLE** (tercer campo del renglón).
- "Cantidad": corresponde a la columna **BULTOS/UNID.** (copiar tal cual, normalizando separador decimal a punto).
- "PrecioUnitario": corresponde a la columna **P.UNITARIO**.
- "Subtotal": corresponde a la columna **TOTAL** de cada producto.
- "UnidadMedida": si no se indica, dejar null.

Notas:
- El campo "Local" (texto que sigue a "Nombre Fantasia:") no forma parte del JSON pedido aquí.
- No usar separadores de miles.
- SOLO el JSON, sin texto adicional, encabezados ni comentarios.
"""
