# -*- coding: utf-8 -*-
# proveedores/ajo.py
#
# Este plugin se activa cuando el nombre del archivo de la factura
# matchea alguno de los patrones en PATTERNS.
# El flujo principal leerá PROMPT y lo concatenará al prompt base
# antes de llamar a Gemini para extracción FULL.

# Coincidencias contra el nombre del archivo (re.search con flags=re.I)
PATTERNS = [
    r"(?i)Ajo",
]

# Prompt específico para este proveedor.
# NOTA: En este flujo NO se usa {download_url}; la imagen/PDF se pasa como bytes.
PROMPT = """
Estás en rol de un analista de datos que extrae DETALLE DE ÍTEMS desde la imagen/PDF de una factura gastronómica de este proveedor.

Salidas y formato EXIGIDOS (muy importante):
- Debes devolver SOLO un JSON cuya RAÍZ sea un **array** (lista) de objetos.
- Cada objeto DEBE tener EXACTAMENTE estas claves:
  ["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal","UnidadMedida"]
- Los campos numéricos ("Cantidad","PrecioUnitario","Subtotal") DEBEN ser números (no strings).
- Mantener el orden natural de lectura de los ítems tal como aparecen en la factura.
- Si un dato no es legible con certeza, usa null.

Mapeo de campos desde la factura/imagen:
- "Codigo"   ← columna/etiqueta de ID o SKU (ej. "ECOM035", "ECOM107"). Si hay prefijos/ruido, toma el código limpio.
- "Descripcion" ← descripción del producto (texto de ítem).
- "Cantidad" ← cantidad comprada (unidades o kilos). No uses el campo "Unidad" para transformar el número.
- "PrecioUnitario" ← precio por unidad (o por kilo). 
- "Subtotal" ← total de la línea del ítem.
- "UnidadMedida" ← por ejemplo "UNI", "KILOS", "CJ", etc. Si no está explícito, usa null.

Reglas de normalización (muy importantes):
- No modifiques el contenido semántico del OCR, solo normalizá números para que sean válidos.
- Interpreta formatos con separadores locales:
  * "81.704,32" debe interpretarse como 81704.32  (coma decimal, punto de miles).
  * "1.0" es 1.0.
  * NO uses separadores de miles en la salida; solo punto decimal si hace falta.
- Redondeos:
  * "PrecioUnitario" y "Subtotal" redondeados a 2 decimales.
  * "Cantidad" puede tener decimales si corresponde (ej. kilos).
- Consistencia matemática:
  * Asegurá SIEMPRE que Subtotal = Cantidad * PrecioUnitario (redondeando a 2 decimales).
  * Si no podés leer con certeza "PrecioUnitario" pero sí "Cantidad" y "Subtotal",
    podés derivar "PrecioUnitario" = Subtotal / Cantidad (2 decimales).
  * Si no podés garantizar la relación, deja los campos dudosos en null y conserva lo legible.

Pistas de producto para ubicar correctamente la descripción (ejemplos frecuentes de este proveedor):
- Pan de Pebete, Baby Ribs Ahumado, Pulled Bites, Patitas de Pollo, Salsa Cheddar, Salsa BBQ Baby,
  Ali oli / All Oli, Bbq Black, Salsa Coleslaw, Salsa de remolacha, Empanadas de Carne,
  Recargo 15% por refuerzo, Queso Pategras, SAL DE HAMBURGUESA,
  Mantel Grande (parafinado con logo), MEDALLON DE HAMBURGUESA,
  Beef Ahumado (pulled), Spare Ribs Ahumadas, St. Louis ahumadas,
  Salsa lomo / beef, Hummus, Pepinos encurtido seco, Locro, SALSA DE HAMBURGUESA,
  Queso Crispy, Pan de papa, PAN CON SESAMO PARA HAMBURGUESA,
  Panceta para hamburguesa, Lomo Ahumado (Porcionado), Sal de papas fritas,
  Mantel Tetra 5%co, Tortilla de Maíz / Tortilla de Miel, Pulled Pork,
  AROS DE CEBOLLA, Buzo para personal (S/M).
- Estas referencias son solo guías para que ubiques la columna de descripción en caso de que el OCR desacomode columnas.

Ejemplo de salida JSON (solo ilustrativo; no devuelvas comentarios ni texto fuera del JSON):
[
  {
    "Codigo": "ECOM035",
    "Descripcion": "Pan de Pebete",
    "Cantidad": 40.0,
    "PrecioUnitario": 1234.50,
    "Subtotal": 49380.00,
    "UnidadMedida": "UNI"
  }
]

RESTRICCIONES CRÍTICAS:
- No devuelvas CSV, ni markdown, ni texto adicional. SOLO el JSON pedido.
- No agregues encabezados ni claves extra.
- No inventes líneas que no estén en la factura.
- Si un valor está ausente o ilegible, usa null.
"""
