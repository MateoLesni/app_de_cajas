# proveedores/jugo_press_sa.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bJUGO\s+PRESS\s*S\.?A\.?\b",
    r"(?i)\bJUGO\s+PRESS\b",
]

PROMPT = """
Proveedor: JUGO PRESS SA (gastronómico).

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

Mapeo específico (JUGO PRESS SA):
- "Codigo": el comprobante **no usa código** → usar 0 en todas las líneas.
- "Descripcion": columna **Articulo** (segunda columna).
- "Cantidad": columna **Cantidad** (cuarta columna). Debe ser solo número; normalizar separador decimal a punto si aparece coma.
- "PrecioUnitario": columna **Precio**.
- "Subtotal": columna **Importe**.
- "UnidadMedida": si no se indica, dejar null.

Notas:
- Ignorar metadatos como “Sr.(es): …” (Local) u
"""