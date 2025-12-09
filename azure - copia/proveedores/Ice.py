# proveedores/ice_dream_srl.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bICE\s+DREAM\s*SRL\b",
    r"(?i)\bICE\s+DREAM\b",
]

PROMPT = """
Proveedor: ICE DREAM SRL (gastronómico).

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

Mapeo específico (ICE DREAM SRL):
- "Codigo": columna **Codigo** del comprobante.
- "Descripcion": columna **Producto** (tercera columna).
- "Cantidad": columna **Cantidad** (segunda columna). Debe ser solo número; normalizar separador decimal a punto si aparece coma.
- "PrecioUnitario": columna **P. Unitario**.
- "Subtotal": columna **Importe**.
- "UnidadMedida": si no se indica, dejar null.

Notas:
- Ignorar metadatos como “Cliente” y similares; NO forman parte del JSON.
- Usar exactamente las claves: ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"].
"""
