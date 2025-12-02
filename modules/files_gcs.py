# modules/files_gcs.py
# -*- coding: utf-8 -*-
import os, re, uuid, mimetypes, unicodedata, logging
import datetime as dt
import io
import zipfile
from flask import Blueprint, request, jsonify, session, current_app, redirect, Response
from werkzeug.utils import secure_filename
from urllib.parse import quote

from google.cloud import storage
from google.api_core import exceptions as gapi_exc

try:
    from dotenv import load_dotenv  # no afecta en Cloud Run
    load_dotenv()
except Exception:
    pass

bp_files = Blueprint("files", __name__)
logger = logging.getLogger("files_gcs")

# ===================== Config =====================
# NUEVO: flags para distinguir local vs nube sin romper prod
ENV = (os.environ.get("ENV") or "").strip().lower()      # dev | prod | local (opcional)
LOCAL_MODE = (os.environ.get("LOCAL_MODE") or "").strip().lower() in ("1", "true", "yes") or ENV in ("dev", "local")
LOCAL_SA_PATH = (os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_LOCAL") or os.path.join(os.getcwd(), "secrets", "sa-cajas.json"))

BUCKET_NAME  = os.environ.get("GCS_BUCKET", "")
SIGNED_TTL   = int(os.environ.get("GCS_SIGNED_URL_TTL", "600"))
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"}

# ===================== Dependencias inyectadas =====================
_login_required     = None
_get_db_connection  = None
_can_edit           = None
_get_user_level     = None
_normalize_fecha    = None
_get_local_param    = None

def inject_dependencies(*, login_required, get_db_connection, can_edit, get_user_level, _normalize_fecha_fn, get_local_param=None):
    global _login_required, _get_db_connection, _can_edit, _get_user_level, _normalize_fecha, _get_local_param
    _login_required    = login_required
    _get_db_connection = get_db_connection
    _can_edit          = can_edit
    _get_user_level    = get_user_level
    _normalize_fecha   = _normalize_fecha_fn
    _get_local_param   = get_local_param
    _wrap_endpoint_with_login("files.upload")
    _wrap_endpoint_with_login("files.list_files")
    _wrap_endpoint_with_login("files.delete_item")
    _wrap_endpoint_with_login("files.view_item")
    _wrap_endpoint_with_login("files.download_all_media")

def _wrap_endpoint_with_login(endpoint_name: str):
    if _login_required is None:
        return
    vf = bp_files.view_functions.get(endpoint_name)
    if vf is None:
        return
    bp_files.view_functions[endpoint_name] = _login_required(vf)

# ===================== Helpers =====================
def _client():
    """
    NUEVO: Cliente Storage que:
    - En local (LOCAL_MODE=True) intenta usar ./secrets/sa-cajas.json (o GOOGLE_APPLICATION_CREDENTIALS_LOCAL).
    - Si no existe el JSON, o en prod, usa ADC (lo mismo que Cloud Run: service account del servicio).
    - Limpia variables conflictivas cuando no corresponde.
    """
    # si estamos en local y existe el JSON, lo usamos
    if LOCAL_MODE and LOCAL_SA_PATH and os.path.exists(LOCAL_SA_PATH):
        # set temporal para este proceso
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = LOCAL_SA_PATH
        try:
            current_app.logger.info(f"[GCS] Modo LOCAL: usando SA JSON {LOCAL_SA_PATH}")
        except Exception:
            logger.info(f"[GCS] Modo LOCAL: usando SA JSON {LOCAL_SA_PATH}")
        return storage.Client()

    # si estamos en local pero NO hay JSON, avisamos y caemos a ADC
    if LOCAL_MODE and (not os.path.exists(LOCAL_SA_PATH)):
        try:
            current_app.logger.warning(f"[GCS] Modo LOCAL sin JSON ({LOCAL_SA_PATH}); usando ADC fallback.")
        except Exception:
            logger.warning(f"[GCS] Modo LOCAL sin JSON ({LOCAL_SA_PATH}); usando ADC fallback.")

    # en prod (o local sin json), garantizamos ADC (service account de Cloud Run)
    for k in ("GOOGLE_APPLICATION_CREDENTIALS", "GCP_SA_KEY_FILE", "GCP_SA_KEY_JSON"):
        os.environ.pop(k, None)
    return storage.Client()  # ADC

def _slug(texto: str) -> str:
    s = (texto or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "x"

def _safe_file(name: str) -> str:
    name = secure_filename(name) or "adjunto"
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:180]

def _ymd_parts(fecha_yyyy_mm_dd: str):
    if not fecha_yyyy_mm_dd or not re.match(r"^\d{4}-\d{2}-\d{2}$", fecha_yyyy_mm_dd):
        raise ValueError("Fecha inválida: se espera YYYY-MM-DD")
    y, m, d = fecha_yyyy_mm_dd.split("-")
    return y, m, d

def _prefix(ctx: dict, scope: str = "day") -> str:
    local = _slug(ctx["local"]); tab = _slug(ctx["tab"])
    caja  = _slug(ctx.get("caja", "")); turno = _slug(ctx.get("turno", ""))
    yyyy, mm, dd = _ymd_parts(ctx["fecha"])
    base = f"{local}/{tab}/{yyyy}"
    if scope in ("month", "day"):
        base += f"/{mm}"
    if scope == "day":
        base += f"/{dd}"
        if caja:  base += f"/{caja}"
        if turno: base += f"/{turno}"
    if not base.endswith("/"):
        base += "/"
    return base

def _signed_get(blob, filename):
    return blob.generate_signed_url(
        version="v4",
        expiration=dt.timedelta(seconds=SIGNED_TTL),
        method="GET",
        response_disposition=f'inline; filename="{filename}"',
    )

def _make_view_fields(blob, orig_filename: str):
    """Devuelve view_path (siempre utilizable) y view_url (best-effort firmado)."""
    view_path = f"/files/view?id={quote(blob.name, safe='')}"
    try:
        view_url = _signed_get(blob, orig_filename)
    except Exception:
        current_app.logger.exception("No se pudo firmar URL para %s", blob.name)
        view_url = view_path  # fallback seguro (redirige/ sirve el binario)
    return view_path, view_url

def _infer_ctx_from_blobname(name: str):
    parts = (name or "").split("/")
    if len(parts) < 5:
        return None
    local = parts[0]
    yyyy, mm, dd = parts[2], parts[3], parts[4]
    fecha = f"{yyyy}-{mm}-{dd}"
    caja  = parts[5] if len(parts) > 5 else ""
    turno = parts[6] if len(parts) > 6 else ""
    return {"local": local, "fecha": fecha, "caja": caja, "turno": turno}

# ===================== Endpoints =====================

@bp_files.route("/upload", methods=["POST"])
def upload():
    if not BUCKET_NAME:
        return jsonify(success=False, msg="GCS_BUCKET no configurado"), 500

    ctx = {k: (request.form.get(k, "").strip()) for k in ("tab", "local", "caja", "turno", "fecha")}
    current_app.logger.info(f"[Upload] Contexto recibido: tab='{ctx['tab']}' (len={len(ctx['tab'])}), local='{ctx['local']}', caja='{ctx['caja']}', turno='{ctx['turno']}', fecha='{ctx['fecha']}'")
    if not all(ctx.values()):
        return jsonify(success=False, msg="Faltan tab/local/caja/turno/fecha"), 400

    entity_type = (request.form.get("entity_type") or "").strip() or None
    entity_id   = request.form.get("entity_id")
    try:
        entity_id = int(entity_id) if entity_id not in (None, "", "null") else None
    except Exception:
        entity_id = None

    try:
        _ymd_parts(ctx["fecha"])
    except Exception as e:
        return jsonify(success=False, msg=str(e)), 400

    files = request.files.getlist("files[]") or request.files.getlist("files")
    if not files:
        return jsonify(success=False, msg="Sin archivos"), 400

    client   = _client()
    bucket   = client.bucket(BUCKET_NAME)
    pref     = _prefix(ctx, scope="day")
    uploaded = []
    created_blobs = []

    if _get_db_connection is None:
        return jsonify(success=False, msg="Dependencias no inicializadas"), 500
    conn = _get_db_connection()
    cur  = conn.cursor()

    try:
        for f in files:
            original = f.filename or "adjunto"
            mime = f.mimetype or mimetypes.guess_type(original)[0] or "application/octet-stream"
            if mime not in ALLOWED_MIME:
                raise ValueError(f"MIME no permitido: {mime}")

            name = _safe_file(original)
            blob_name = pref + f"{uuid.uuid4().hex}__{name}"
            blob = bucket.blob(blob_name)
            blob.metadata = {
                **ctx,
                "original_name": original,
                "entity_type": entity_type or "",
                "entity_id": str(entity_id or "")
            }
            blob.upload_from_file(f.stream, content_type=mime)
            created_blobs.append(blob)

            try:
                blob.reload()
                size_bytes = int(blob.size or 0)
            except Exception:
                size_bytes = None

            cur.execute(
                """
                INSERT INTO imagenes_adjuntos
                (tab, local, caja, turno, fecha,
                 entity_type, entity_id,
                 gcs_path, original_name, mime, size_bytes,
                 checksum_sha256, subido_por, estado)
                VALUES
                (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active')
                """,
                (
                    ctx["tab"], ctx["local"], ctx["caja"], ctx["turno"], ctx["fecha"],
                    entity_type, entity_id,
                    blob_name, original, mime, size_bytes,
                    None, session.get("username") or "sistema",
                ),
            )

            view_path, view_url = _make_view_fields(blob, name)
            uploaded.append({"name": original, "path": blob_name, "view_url": view_url, "view_path": view_path})

        conn.commit()
        return jsonify(success=True, items=uploaded)

    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        for b in created_blobs:
            try: b.delete()
            except Exception:
                current_app.logger.warning("No se pudo borrar blob huérfano %s", getattr(b, "name", "?"))
        current_app.logger.exception("files.upload falló")
        return jsonify(success=False, msg=str(e)), 500
    finally:
        try: cur.close()
        except Exception: pass
        try: conn.close()
        except Exception: pass

@bp_files.route("/list", methods=["GET"])
def list_files():
    if not BUCKET_NAME:
        return jsonify(success=False, msg="GCS_BUCKET no configurado"), 500

    scope = (request.args.get("scope") or "day").lower().strip()
    if scope not in ("day", "month", "year"):
        scope = "day"

    ctx = {
        "tab":   request.args.get("tab", "").strip(),
        "local": request.args.get("local", "").strip(),
        "caja":  request.args.get("caja", "").strip(),
        "turno": request.args.get("turno", "").strip(),
        "fecha": request.args.get("fecha", "").strip(),
    }
    debug = (request.args.get("debug") or "0").strip() == "1"
    loose = (request.args.get("loose") or "0").strip() == "1"

    required = ("tab", "local", "fecha") if scope in ("month", "year") else ("tab", "local", "fecha", "caja", "turno")
    faltantes = [k for k in required if not ctx[k]]
    if faltantes:
        return jsonify(success=False, msg=f"Faltan parámetros: {', '.join(faltantes)}"), 400

    try:
        _ymd_parts(ctx["fecha"])
        client = _client()
        bucket = client.bucket(BUCKET_NAME)
        prefix = _prefix(ctx, scope=scope)
        current_app.logger.info("files.list prefix=%s scope=%s ctx=%s", prefix, scope, ctx)

        def _list_with_prefix(pfx: str):
            items, count = [], 0
            for b in bucket.list_blobs(prefix=pfx):
                count += 1
                orig = (b.metadata or {}).get("original_name") or b.name.rsplit("__", 1)[-1]
                view_path, view_url = _make_view_fields(b, orig)
                items.append({
                    "id": b.name,
                    "name": orig,
                    "view_url": view_url,     # nunca "null": si no firma, apunta a /files/view?id=...
                    "view_path": view_path,   # endpoint interno
                    "bytes": b.size or 0,
                    "mime": b.content_type or "image/*",
                    "path": b.name,
                })
            return items, count

        out, cnt = _list_with_prefix(prefix)
        current_app.logger.info("files.list found=%d prefix=%s", cnt, prefix)

        if not out and scope == "day" and loose:
            yyyy, mm, dd = _ymd_parts(ctx["fecha"])
            month_prefix = _prefix(ctx, scope="month")
            tmp, _ = _list_with_prefix(month_prefix)
            out = [it for it in tmp if f"/{dd}/" in it["id"]]

        if debug:
            return jsonify(success=True, items=out, debug={"prefix": prefix, "scope": scope, "ctx": ctx, "count": len(out)})

        return jsonify(success=True, items=out)

    except Exception as e:
        current_app.logger.exception("files.list falló")
        return jsonify(success=False, msg=str(e)), 500

@bp_files.route("/view", methods=["GET"])
def view_item():
    """
    /files/view?id=<blob_name>
    - Si puede, redirige a Signed URL (302).
    - Si no puede firmar, sirve el binario directo con mime correcto.
    """
    if not BUCKET_NAME:
        return jsonify(success=False, msg="GCS_BUCKET no configurado"), 500

    blob_name = (request.args.get("id") or "").strip()
    if not blob_name:
        return jsonify(success=False, msg="Falta id"), 400

    try:
        client = _client()
        bucket = client.bucket(BUCKET_NAME)
        blob   = bucket.get_blob(blob_name)
        if not blob:
            return jsonify(success=False, msg="No encontrado"), 404

        filename = (blob.metadata or {}).get("original_name") or blob.name.rsplit("__", 1)[-1]

        # 1) Intentar URL firmada
        try:
            url = _signed_get(blob, filename)
            return redirect(url, code=302)
        except Exception:
            current_app.logger.exception("No se pudo firmar; sirviendo binario directo %s", blob.name)

        # 2) Fallback: servir binario directo con MIME robusto
        data = blob.download_as_bytes()

        # Resolver mime de forma segura
        lower = filename.lower()
        if   lower.endswith((".jpg", ".jpeg", ".jfif", ".pjpeg", ".pjp")): mime = "image/jpeg"
        elif lower.endswith(".png"):  mime = "image/png"
        elif lower.endswith(".webp"): mime = "image/webp"
        elif lower.endswith(".heic"): mime = "image/heic"
        elif lower.endswith(".pdf"):  mime = "application/pdf"
        else:
            mime = blob.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"

        headers = {
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=60",
            "X-Content-Type-Options": "nosniff",
        }
        return Response(data, mimetype=mime, headers=headers)

    except gapi_exc.GoogleAPICallError as e:
        return jsonify(success=False, msg=f"GCS error: {e}"), 502
    except Exception as e:
        return jsonify(success=False, msg=str(e)), 500


@bp_files.route("/item", methods=["DELETE"])
def delete_item():
    if not BUCKET_NAME:
        return jsonify(success=False, msg="GCS_BUCKET no configurado"), 500
    if not all([_get_db_connection, _can_edit, _get_user_level, _normalize_fecha]):
        return jsonify(success=False, msg="Dependencias no inicializadas"), 500

    # Para auditores (nivel 3): usa parámetro 'local', para otros niveles: usa session
    local_ses = (_get_local_param() if _get_local_param else session.get('local') or '').strip()
    user      = (session.get('username') or '').strip()
    if not local_ses or not user:
        return jsonify(success=False, msg="Faltan datos de sesión (usuario/local)."), 401

    blob_name = (request.args.get('id') or '').strip()
    if not blob_name:
        return jsonify(success=False, msg="Falta id del ítem"), 400

    try:
        client = _client()
        bucket = client.bucket(BUCKET_NAME)
        blob   = bucket.get_blob(blob_name)
        if not blob:
            return jsonify(success=False, msg="Imagen no encontrada"), 404

        md = blob.metadata or {}
        local_b = (md.get('local') or '').strip()
        caja_b  = (md.get('caja') or '').strip()
        turno_b = (md.get('turno') or '').strip()
        fecha_b = (md.get('fecha') or '').strip()

        if not (local_b and fecha_b):
            inferred = _infer_ctx_from_blobname(blob.name)
            if not inferred:
                return jsonify(success=False, msg="No se pudo determinar el contexto del adjunto"), 409
            local_b = inferred["local"]; caja_b = inferred["caja"]; turno_b = inferred["turno"]; fecha_b = inferred["fecha"]

        try:
            nfecha = _normalize_fecha(fecha_b)
        except Exception:
            nfecha = fecha_b

        if local_ses.strip().lower() != local_b.strip().lower():
            return jsonify(success=False, msg="No permitido para este local"), 403

        # Validar permisos para eliminar imágenes
        user_level = _get_user_level()

        # Nivel 3 (auditor) NO puede eliminar imágenes
        if user_level >= 3:
            return jsonify(success=False, msg="Los auditores no pueden eliminar imágenes"), 403

        # Para niveles 1 y 2, validar con can_edit
        conn = _get_db_connection()
        try:
            # Firma correcta: can_edit(conn, local, caja, turno, fecha, user_level)
            allowed = _can_edit(conn, local_b, caja_b, turno_b, nfecha, user_level)
        finally:
            try: conn.close()
            except Exception: pass

        if not allowed:
            msg = "No permitido (caja cerrada)" if user_level == 1 else "No permitido (local cerrado)"
            return jsonify(success=False, msg=msg), 403

        blob.delete()
        return jsonify(success=True)

    except gapi_exc.GoogleAPICallError as e:
        return jsonify(success=False, msg=f"GCS error: {e}"), 502
    except Exception as e:
        return jsonify(success=False, msg=str(e)), 500

# (estas importaciones ya estaban al final de tu archivo original)
from flask import Blueprint, request, jsonify, session, current_app
from datetime import datetime, date

def _lvl():
    try:
        return int(session.get("role_level") or 0)
    except Exception:
        return 0

def _norm_fecha_str(s):
    if isinstance(s, (date, datetime)):
        return s.strftime("%Y-%m-%d")
    s = (s or "").strip()
    try:
        return datetime.strptime(s, "%Y-%m-%d").strftime("%Y-%m-%d")
    except Exception:
        return None

@bp_files.route("/summary_media", methods=["GET"])
def files_summary_media():
    """
    Devuelve imágenes del día agrupadas por 'tab' (remesas, ventas_z, etc.).
    Params: local, fecha (YYYY-MM-DD)
    """
    if not BUCKET_NAME:
        return jsonify(error="GCS_BUCKET no configurado"), 500
    if _get_db_connection is None:
        return jsonify(error="Dependencias no inicializadas"), 500

    local = (request.args.get("local") or "").strip()
    fecha_s = _norm_fecha_str(request.args.get("fecha"))
    if not local or not fecha_s:
        return jsonify(error="Parámetros insuficientes: local y fecha"), 400

    # Seguridad por rol
    if _lvl() < 3:
        ses_local = (session.get("local") or "").strip()
        if not ses_local or ses_local.lower() != local.lower():
            return jsonify(error="No autorizado para el local solicitado"), 403

    TAB_ORDER = [
        ("remesas",     "Remesas"),
        ("ventas_z",    "Ventas Z"),
        ("mercadopago", "Mercado Pago"),
        ("tarjeta",     "Tarjeta"),
        ("rappi",       "Rappi"),
        ("pedidosya",   "PedidosYa"),
        ("gastos",      "Gastos"),
        ("cuenta_cte",  "Cuenta Cte."),
    ]

    conn = _get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT tab, gcs_path, original_name, mime, size_bytes
            FROM imagenes_adjuntos
            WHERE local=%s
              AND DATE(fecha)=%s
              AND estado='active'
            ORDER BY id DESC
        """, (local, fecha_s))
        rows = cur.fetchall() or []

        # Inicializamos grupos
        groups = {k: {"label": lbl, "items": []} for k, lbl in TAB_ORDER}

        # Construcción con view_path + view_url usando helper
        client = _client()
        bucket = client.bucket(BUCKET_NAME)

        for tab, path, orig, mime, sizeb in rows:
            key = (tab or "").strip().lower() or "otros"
            if key not in groups:
                groups[key] = {"label": tab or "Otros", "items": []}

            blob = bucket.blob(path)

            # Verificar que el archivo existe en GCS antes de incluirlo
            if not blob.exists():
                current_app.logger.warning(f"Archivo en BD pero no existe en GCS: {path}")
                continue  # Saltar este archivo

            safe_name = orig or path.rsplit("__", 1)[-1]

            view_path, signed_url = _make_view_fields(blob, safe_name)

            groups[key]["items"].append({
                "id": path,
                "name": safe_name,
                "view_url": signed_url,   # puede ser fallback a /files/view
                "view_path": view_path,
                "bytes": int(sizeb or 0),
                "mime": mime or "image/*",
                "path": path,
            })

        # Ordenar salida
        ordered = []
        already = set()
        for k, lbl in TAB_ORDER:
            g = groups.get(k, {"label": lbl, "items": []})
            ordered.append({"key": k, "label": g["label"], "count": len(g["items"]), "items": g["items"]})
            already.add(k)
        for k, g in groups.items():
            if k not in already:
                ordered.append({"key": k, "label": g["label"], "count": len(g["items"]), "items": g["items"]})

        return jsonify(local=local, fecha=fecha_s, groups=ordered)

    except Exception as e:
        current_app.logger.exception("files.summary_media falló")
        try: conn.rollback()
        except: ...
        return jsonify(error=str(e)), 500
    finally:
        try: cur.close()
        except: ...
        try: conn.close()
        except: ...


@bp_files.route("/download_all_media", methods=["GET"])
def download_all_media():
    """
    Descarga todas las imágenes del día en un ZIP organizado por carpetas.
    Params: local, fecha (YYYY-MM-DD)

    Estructura del ZIP:
    {local}_{fecha}/
        remesas/
            imagen1.jpg
            imagen2.jpg
        ventas_z/
            imagen1.jpg
        tarjeta/
            ...
    """
    if not BUCKET_NAME:
        return jsonify(error="GCS_BUCKET no configurado"), 500
    if _get_db_connection is None:
        return jsonify(error="Dependencias no inicializadas"), 500

    local = (request.args.get("local") or "").strip()
    fecha_s = _norm_fecha_str(request.args.get("fecha"))
    if not local or not fecha_s:
        return jsonify(error="Parámetros insuficientes: local y fecha"), 400

    # Seguridad por rol
    if _lvl() < 3:
        ses_local = (session.get("local") or "").strip()
        if not ses_local or ses_local.lower() != local.lower():
            return jsonify(error="No autorizado para el local solicitado"), 403

    conn = _get_db_connection()
    cur = conn.cursor()
    try:
        # Obtener todas las imágenes del local/fecha
        cur.execute("""
            SELECT tab, gcs_path, original_name
            FROM imagenes_adjuntos
            WHERE local=%s
              AND DATE(fecha)=%s
              AND estado='active'
            ORDER BY tab, id
        """, (local, fecha_s))
        rows = cur.fetchall() or []

        if not rows:
            return jsonify(error="No hay imágenes para descargar"), 404

        # Crear ZIP en memoria
        zip_buffer = io.BytesIO()
        client = _client()
        bucket = client.bucket(BUCKET_NAME)

        # Nombre de la carpeta raíz: {local}_{fecha}
        safe_local = re.sub(r'[^\w\s-]', '', local).strip().replace(' ', '_')
        root_folder = f"{safe_local}_{fecha_s}"

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Contador para evitar duplicados de nombre
            file_counters = {}

            for tab, gcs_path, original_name in rows:
                try:
                    # Descargar blob desde GCS
                    blob = bucket.blob(gcs_path)
                    if not blob.exists():
                        logger.warning(f"Blob no existe en GCS: {gcs_path}")
                        continue

                    file_data = blob.download_as_bytes()

                    # Determinar nombre de archivo
                    safe_name = original_name or gcs_path.rsplit("__", 1)[-1]

                    # Determinar carpeta
                    folder_name = (tab or "otros").strip().lower()

                    # Evitar duplicados agregando contador si es necesario
                    base_path = f"{root_folder}/{folder_name}/{safe_name}"
                    if base_path in file_counters:
                        file_counters[base_path] += 1
                        name_parts = safe_name.rsplit('.', 1)
                        if len(name_parts) == 2:
                            safe_name = f"{name_parts[0]}_{file_counters[base_path]}.{name_parts[1]}"
                        else:
                            safe_name = f"{safe_name}_{file_counters[base_path]}"
                        base_path = f"{root_folder}/{folder_name}/{safe_name}"
                    else:
                        file_counters[base_path] = 0

                    # Agregar al ZIP
                    zip_file.writestr(base_path, file_data)

                except Exception as e:
                    logger.error(f"Error descargando blob {gcs_path}: {e}")
                    continue

        # Preparar respuesta
        zip_buffer.seek(0)
        zip_filename = f"{safe_local}_{fecha_s}.zip"

        return Response(
            zip_buffer.getvalue(),
            mimetype='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename="{zip_filename}"',
                'Content-Type': 'application/zip'
            }
        )

    except Exception as e:
        current_app.logger.exception("files.download_all_media falló")
        try: conn.rollback()
        except: ...
        return jsonify(error=str(e)), 500
    finally:
        try: cur.close()
        except: ...
        try: conn.close()
        except: ...
