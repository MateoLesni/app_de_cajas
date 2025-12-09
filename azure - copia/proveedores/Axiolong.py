# proveedores/axionlog.py
import re
import pandas as pd

PATTERNS = [
    re.compile(r"AXIONLOG", re.IGNORECASE),
    re.compile(r"Cliente:\s*", re.IGNORECASE),
]

PROMPT = """
Eres un Data Entry profesional. Vas a procesar una factura gastronómica
y devolver su contenido en formato JSON, como una lista de objetos con estas claves:

["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas estrictas:
- No inventes información. Si no encuentras un valor, usa 0 o "" según corresponda.
- No modifiques los textos del OCR, solo limpia espacios innecesarios.
- "Codigo" → corresponde a la columna Artículo.
- "Descripcion" → corresponde a la columna Descripción.
- "Cantidad" → corresponde a la columna Cantidad, solo el número.
- "PrecioUnitario" → corresponde a la columna P. Unitario.
- "Subtotal" → corresponde a la columna Neto.
- "UnidadMedida" → dejar vacío ("") si no está presente en la factura.
- Devuelve solo JSON válido. No pongas texto adicional.

Texto OCR:
\"\"\"{texto_ocr}\"\"\"
"""

