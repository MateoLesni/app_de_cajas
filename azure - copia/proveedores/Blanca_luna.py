# proveedores/blanca_luna.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bBLANCA\s+LUNA\b",
    r"(?i)\bBLANCA\s*LUNA\s*S\.?A\.?",
]

PROMPT = """
Proveedor: BLANCA LUNA (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: "81.704,32" => 81704.32 (coma decimal, punto de miles).
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.

Mapeo y pistas (BLANCA LUNA):
- "Codigo": es el código del proveedor (alfanumérico), por ejemplo 8544AC, 5001AC, 5386AC, 9570EN, etc. Suele aparecer ANTES de la descripción.
- "Descripcion": corresponde a la **Descripcion** del ítem. Si en el OCR aparece la palabra "Oferta" dentro de la descripción, NO incluirla (recortarla).
- "Cantidad": corresponde a la columna **CANT.1** (número inmediatamente posterior al código del proveedor). Puede venir como "50,00" o "50.00"; normalizar el separador decimal a punto.
- "PrecioUnitario": corresponde a la columna **Precio** del ítem (normalizar separador a punto).
- "Subtotal": corresponde a la columna **Importe** del ítem (normalizar separador a punto; sin separador de miles).
- "UnidadMedida": si no se identifica con certeza, usar null.

Notas adicionales:
- "Cantidad" es siempre el segundo valor de la línea (primero va el código alfanumérico, luego la cantidad).
- No confundir el código (alfanumérico) con cantidades (solo números).
- El campo "Local" y otros metadatos NO forman parte del JSON pedido aquí.
- SOLO el JSON (sin texto adicional, encabezados, ni comentarios).
"""
