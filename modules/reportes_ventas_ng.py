# -*- coding: utf-8 -*-
"""
Cliente HTTP del servicio `ventas_ng`: descarga los 8 archivos del reporte
diario de ventas (6 reportes + 2 cruces) que se envian por WhatsApp.

Toda la logica de negocio (queries, unificacion de locales, cruces, render)
vive en ventas_ng. Aca solo consumimos su endpoint y devolvemos los archivos.

Config por variables de entorno:
  VENTAS_NG_URL      -> base del servicio (default: IP publica de la VM)
  VENTAS_NG_API_KEY  -> secreto compartido, va en el header X-API-Key
"""
import base64
import os
from datetime import date
from typing import List, Optional, Tuple

import requests

VENTAS_NG_URL = os.getenv("VENTAS_NG_URL", "http://35.193.252.141:8000")
VENTAS_NG_API_KEY = os.getenv("VENTAS_NG_API_KEY", "")

# La generacion tarda ~5-10s (MySQL + render PIL de 8 imagenes).
TIMEOUT_SECONDS = 90


class ReportesVentasError(Exception):
    """Error consumiendo el endpoint de ventas_ng."""


def obtener_reportes(fecha: Optional[date] = None) -> Tuple[str, List[dict]]:
    """
    Pide los reportes a ventas_ng y devuelve (fecha, archivos).

    Args:
        fecha: fecha a reportar. None = ayer (hora Argentina), igual que el
               envio automatico de las 8:00.

    Returns:
        (fecha_str, [{nombre, contenido(bytes), tipo, mime}, ...])

    Raises:
        ReportesVentasError con un mensaje apto para mostrar al usuario.
    """
    if not VENTAS_NG_API_KEY:
        raise ReportesVentasError(
            "El servicio de reportes no esta configurado (falta VENTAS_NG_API_KEY). "
            "Avisar a soporte."
        )

    params = {}
    if fecha is not None:
        params["fecha"] = fecha.isoformat()

    url = f"{VENTAS_NG_URL.rstrip('/')}/generate-reports"
    headers = {"X-API-Key": VENTAS_NG_API_KEY}

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=TIMEOUT_SECONDS)
    except requests.Timeout:
        raise ReportesVentasError(
            "El servicio de reportes tardo demasiado en responder. Reintentar en unos minutos."
        )
    except requests.RequestException as e:
        raise ReportesVentasError(f"No se pudo contactar al servicio de reportes: {e}")

    if resp.status_code == 401:
        raise ReportesVentasError(
            "Credencial invalida contra el servicio de reportes. Avisar a soporte."
        )
    if resp.status_code == 400:
        raise ReportesVentasError("Fecha invalida.")
    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = (resp.text or "")[:300]
        raise ReportesVentasError(f"El servicio de reportes respondio {resp.status_code}: {detail}")

    try:
        payload = resp.json()
        fecha_str = payload["fecha"]
        entradas = payload["archivos"]
    except Exception as e:
        raise ReportesVentasError(f"Respuesta inesperada del servicio de reportes: {e}")

    archivos = []
    for entry in entradas:
        try:
            contenido = base64.b64decode(entry["base64"])
        except Exception:
            continue
        archivos.append({
            "nombre": entry.get("nombre", "reporte.png"),
            "contenido": contenido,
            "tipo": entry.get("tipo", "reporte"),
            "mime": entry.get("mime", "image/png"),
        })

    if not archivos:
        raise ReportesVentasError("El servicio de reportes no devolvio archivos.")

    return fecha_str, archivos
