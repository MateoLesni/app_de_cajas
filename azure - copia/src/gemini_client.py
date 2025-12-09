"""
Gemini API client for invoice extraction
Clean version without hardcoded API keys
"""
import json
import re
from typing import List, Dict, Any
from google.generativeai import configure, GenerativeModel
from src.config import Config

# Configure Gemini with API key from environment
configure(api_key=Config.GEMINI_API_KEY)

# Initialize model
model = GenerativeModel("gemini-2.0-flash")

# Expected keys in invoice items
EXPECTED_KEYS = {"Codigo", "Descripcion", "Cantidad", "PrecioUnitario", "Subtotal"}


def _extract_json_block(text: str) -> str:
    """Extract JSON from Gemini response, removing markdown code blocks"""
    if text is None:
        raise ValueError("Empty response from Gemini")

    text = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE)
    text = text.replace("```", "").strip()
    m = re.search(r"(\{.*\}|\[.*\])", text, flags=re.DOTALL)
    return m.group(1).strip() if m else text.strip()


def _coerce_items_schema(data: Any) -> List[Dict]:
    """Convert Gemini response to expected invoice items format"""
    if isinstance(data, dict):
        if "items" in data and isinstance(data["items"], list):
            data = data["items"]
        elif set(data.keys()) & EXPECTED_KEYS:
            data = [data]
        else:
            raise ValueError("JSON object doesn't contain 'items' or item fields")

    if not isinstance(data, list):
        raise ValueError("JSON root must be a list or object with 'items'")

    items: List[Dict] = []
    for idx, elem in enumerate(data, start=1):
        if isinstance(elem, str):
            try:
                elem = json.loads(elem)
            except Exception as e:
                raise ValueError(f"Item {idx} is unparseable string: {e}")

        if not isinstance(elem, dict):
            raise ValueError(f"Item {idx} is not a dict")

        item = {k: elem.get(k, None) for k in EXPECTED_KEYS}
        items.append(item)

    return items


def _call_gemini(prompt: str, image_part: Dict, temperature: float = 0.1) -> str:
    """Call Gemini API with prompt and image"""
    resp = model.generate_content(
        [prompt, image_part],
        generation_config={
            "temperature": temperature,
            "max_output_tokens": 4096,
            "response_mime_type": "application/json",
        }
    )

    raw = getattr(resp, "text", None)
    if not raw and hasattr(resp, "candidates") and resp.candidates and resp.candidates[0].content.parts:
        raw = resp.candidates[0].content.parts[0].text
    if not raw:
        raise ValueError("Gemini returned empty response")

    return raw


def extract_invoice_items(image_bytes: bytes, mime_type: str, extra_prompt: str = "") -> List[Dict]:
    """
    Extract invoice items from image using Gemini API

    Args:
        image_bytes: Image file bytes
        mime_type: MIME type (image/jpeg, image/png, application/pdf)
        extra_prompt: Additional supplier-specific prompt

    Returns:
        List of invoice items with keys: Codigo, Descripcion, Cantidad, PrecioUnitario, Subtotal
    """
    image_part = {"mime_type": mime_type, "data": image_bytes}

    prompt_base = (
        "Sos un extractor de ítems de una factura. Recibís una imagen/PDF de factura.\n"
        "Devolvés SOLO un JSON (sin texto adicional) con una **lista** de objetos con estas claves EXACTAS:\n"
        '["Codigo","Descripcion","Cantidad","PrecioUnitario","Subtotal"]\n'
        "Reglas:\n"
        "- No inventes líneas; solo las presentes en la factura.\n"
        "- Para cada ítem: Subtotal = Cantidad * PrecioUnitario (redondeo 2 decimales).\n"
        "- Si algún dato no se puede leer con certeza, devolvelo como null.\n"
        "- Campos numéricos como números (no strings).\n"
        "- La raíz del JSON debe ser SIEMPRE un array. No envuelvas en objetos.\n"
        "- Mantener el orden natural de lectura."
    )

    if extra_prompt:
        prompt_base += "\n\n**Contexto específico del proveedor:**\n" + extra_prompt

    # Attempt 1
    raw1 = _call_gemini(prompt_base, image_part, temperature=0.1)
    print(f"    [Gemini RAW len={len(raw1)}] {raw1[:300].replace(chr(10),' ')}{'...' if len(raw1)>300 else ''}")

    try:
        js1 = _extract_json_block(raw1)
        data1 = json.loads(js1)
        items1 = _coerce_items_schema(data1)
        return items1
    except Exception as e1:
        print(f"    [Gemini parse] attempt 1 failed: {e1}")

    # Attempt 2 (stricter)
    prompt_retry = prompt_base + "\n\nIMPORTANTE: si no podés devolver un ARRAY JSON de ítems con esas claves, devolvé `[]`."
    raw2 = _call_gemini(prompt_retry, image_part, temperature=0.0)
    print(f"    [Gemini RAW(retry) len={len(raw2)}] {raw2[:300].replace(chr(10),' ')}{'...' if len(raw2)>300 else ''}")

    js2 = _extract_json_block(raw2)
    data2 = json.loads(js2)
    items2 = _coerce_items_schema(data2)
    return items2
