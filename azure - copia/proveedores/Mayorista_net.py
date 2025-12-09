# proveedores/mayorista_net.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bMAYORISTA\s+NET\b",
    r"(?i)\bMAYORISTA\s+NET\s*S\.?A\.?\b",
]

PROMPT = """
Proveedor: MAYORISTA NET (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas generales:
- No inventes ítems; mantené el orden natural de lectura.
- Números como números (no strings).
- Si un dato no es legible con certeza, usar null.
- Interpretación local: coma decimal y punto de miles (ej.: "5.142,00" => 5142.00).
- Sin separadores de miles en la salida numérica.
- Redondeo a 2 decimales para PrecioUnitario y Subtotal cuando corresponda.
- La salida debe ser **solo** el JSON, sin texto adicional ni encabezados.

Mapeo y pistas (MAYORISTA NET):
- "Codigo": código del artículo del proveedor. Formatos típicos alfanuméricos: F00098, F00516, A00645, A00801, G00498 (si no está claro, dejar null).
- "Descripcion": campo **Descripción** del producto (limpia, sin notas como “Oferta” si aparecen fuera del nombre).
- "Cantidad": priorizar **Cant.KG** si aparece en la misma línea; si no existe, usar **CANT.Uni**. Ambas aparecen luego de la descripción. Normalizar separador decimal a punto.
- "PrecioUnitario": tomar el precio unitario real del ítem. El precio **nunca** puede ser 0, 21,00 ni 10,50 (esos corresponden a IVA u otros impuestos). Si un campo está vacío, buscar el correcto en la línea del ítem.
- "Subtotal": corresponde a **Total** del renglón. En valores como "30.772.55" (múltiples puntos sin coma), interpretar como miles + 2 decimales finales → 30772.55. E
"""