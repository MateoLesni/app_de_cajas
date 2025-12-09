# proveedores/quilmes.py
# -*- coding: utf-8 -*-

PATTERNS = [
    r"(?i)\bQUILMES\b",
    r"(?i)CERVECER[ÍI]A\s+Y\s+MALTER[ÍI]A\s+QUILMES",
    "QUIL",
    "ERES",
    "FC"
]

PROMPT = """
Proveedor: QUILMES (gastronómico).

Objetivo: devolver SOLO un JSON cuya RAÍZ sea una **lista** de objetos con las claves EXACTAS:
["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]

Reglas generales de salida:
- Devolvés ÚNICAMENTE el JSON (sin texto extra ni fences).
- Cada objeto representa una línea de detalle de la factura.
- Respetá el orden natural de lectura de los ítems.
- Si un dato NO es legible con certeza, usar null.
- Formato numérico: interpretar coma como separador decimal y punto como separador de miles
  (p. ej. "81.704,32" => 81704.32). En la salida: sin separadores de miles y con **punto** decimal.
- Redondear a 2 decimales solo cuando corresponda (PrecioUnitario y Subtotal).

Columnas de la factura QUILMES (mapeo estricto):
- "Codigo": tomar de la columna **COD** (tercera columna del renglón). Debe ser número entero sin puntos ni comas.
  Si contiene "." o "," no es un código válido -> devolver null.
- "Descripcion": tomar de la columna **DESCRIPCION** (texto del producto).
- "Cantidad": tomar de la columna **BULTOS** (primera columna). Extraer el número tal como aparece (puede ser entero o con decimales).
- "PrecioUnitario": tomar de la columna **PRECIO UNI**. 
  **No** usar "PREC.UNI.FINAL" ni "PREC.UNI. FINAL" ni "PRECIO FINAL".
  Si coexistieran "PRECIO UNI" y "PREC.UNI.FINAL", elegir SIEMPRE "PRECIO UNI".
- "Subtotal": tomar de la columna **SUBTOTAL** (antes de impuestos).
- "UnidadMedida": tomar de la columna **UNI** (segunda columna, suele ser "PACK", "CAJA", "UNID", etc.).

Criterios de extracción:
- Considerá solo las líneas de detalle (no subtotales, totales, leyendas ni pie).
- Ignorar columnas de descuento, impuestos (IVA, IMP.INTERNO, INT.NO GRAV.), totales y precios finales.
- No inventes ítems: si una fila está cortada o es ilegible, devolvé ese registro con los campos que sí estén seguros y el resto en null.
- Algunas descripciones pueden incluir números, "PET", "LATA", "PACK", etc.: todo eso pertenece a "Descripcion".

Validaciones:
- "Codigo" debe ser un entero positivo (sin separadores).
- "Cantidad", "PrecioUnitario" y "Subtotal" deben ser numéricos. Si viene "-": usar null.
- Mantener exactamente las claves: ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"].
"""
