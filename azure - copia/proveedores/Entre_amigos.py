# proveedores/kunze_srl.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bKUNZE\s*SRL\b",
    r"(?i)\bKUNZE\b",
]

PROMPT = """
Proveedor: KUNZE SRL (gastronómico).

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

Mapeo específico (KUNZE SRL):
- "Codigo": el comprobante **no utiliza código** → usar 0 en todas las líneas.
- "Descripcion": columna **Descripcion** (segunda columna).
- "Cantidad": columna **Cantidad** (puede representar KG o unidades). Transcribir el valor y normalizar separador decimal a punto.
- "PrecioUnitario": columna **Precio**.
- "Subtotal": columna **Subtotal**.
- "UnidadMedida": si no se indica, dejar null.

Notas:
- En algunos OCR los campos numéricos pueden aparecer antes de la descripción: asegurarse de asociar correctamente cada valor con su descripción y NO duplicar ítems.
- Si tras revisar el OCR un dato falta, dejar 0 (para números) o null (cuando aplique), sin inventar.
"""
