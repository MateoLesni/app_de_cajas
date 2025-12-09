# proveedores/fresco_pez_sa.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bFRESCO\s+PEZ\b",
    r"(?i)\bFRESCO\s+PEZ\s*S\.?A\.?\b",
]

PROMPT = """
Proveedor: FRESCO PEZ S.A. (gastronómico).

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

Mapeo específico (FRESCO PEZ):
- "Codigo": columna **Articulo** (segunda columna).
- "Descripcion": columna **Descripción**.
- "Cantidad": columna **Cantidad** (primera columna). Debe ser solo número; normalizar separador decimal a punto si aparece coma.
- "PrecioUnitario": columna **Precio unit.**.
- "Subtotal": columna **Importe**.
- "UnidadMedida": si no se indica, dejar null.

Notas:
- Ignorar metadatos como “Nombre de fantasia” y similares; NO forman parte del JSON.
- Usar exactamente las claves: ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"].
"""
