# modules/files_gcs.py
# -*- coding: utf-8 -*-
import os, re, uuid, mimetypes, unicodedata, logging
import datetime as dt
from flask import Blueprint, request, jsonify, session, current_app
from werkzeug.utils import secure_filename

from google.cloud import storage
from google.api_core import exceptions as gapi_exc

try:
    # En local podés usar .env; en Cloud Run no afecta
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

bp_files = Blueprint("files", __name__)
logger = logging.getLogger("files_gcs")

# ===================== Config =====================
BUCKET_NAME  = os.environ.get("GCS_BUCKET", "")
SIGNED_TTL   = int(os.environ.get("GCS_SIGNED_URL_TTL", "600"))  # segundos
# Ampliado por si suben HEIC/PDF (si no los querés, sacalos)
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"}

# ===================== Dependencias inyectadas =====================
_login_required     = None
_get_db_connection  = None
_can_edit           = None
_get_user_level     = None
_normalize_fecha    = None

def inject_dependencies(
    *,
    login_required,
    get_db_connection,
    can_edit,
    get_user_level,
    _normalize_fecha_fn
):
    """
    Llamar desde app.py ANTES de registrar el blueprint:
        from modules import files_gcs
        files_gcs.inject_dependencies(
            login_required=login_required,
            get_db_connection=get_db_connection,
            can_edit=can_edit,
            get_user_level=get_user_level,
            _normalize_fecha_fn=_normalize_fecha,
        )
        app.register_blueprint(files_gcs.bp_files, url_prefix="/files")
    """
    global _login_required, _get_db_connection, _can_edit, _get_user_level, _normalize_fecha
    _login_required    = login_required
    _get_db_connection = get_db_connection
    _can_edit          = can_edit
    _get_user_level    = get_user_level
    _normalize_fecha   = _normalize_fecha_fn

    _wrap_endpoint_with_login("files.upload")
    _wrap_endpoint_with_login("files.list_files")
    _wrap_endpoint_with_login("files.delete_item")

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
    Usa EXCLUSIVAMENTE ADC (Application Default Credentials)
    que provee Cloud Run con la service account asignada.
    Ignora variables de credenciales si alguien las dejó seteadas.
    """
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
    """
    Estructura: local/tab/yyyy/mm/dd/caja/turno/
    scope: 'day' | 'month' | 'year'
    """
    local = _slug(ctx["local"])
    tab   = _slug(ctx["tab"])
    caja  = _slug(ctx.get("caja", ""))
    turno = _slug(ctx.get("turno", ""))
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
    """
    Genera Signed URL (requiere roles/iam.serviceAccountTokenCreator
    en la service account del servicio de Cloud Run).
    Si falla, el caller lo captura y puede continuar.
    """
    return blob.generate_signed_url(
        version="v4",
        expiration=dt.timedelta(seconds=SIGNED_TTL),
        method="GET",
        response_disposition=f'inline; filename="{filename}"',
    )

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
    """
    FormData:
      files[] (1..n)
      tab, local, caja, turno, fecha (YYYY-MM-DD)
      [opcional] entity_type, entity_id
    """
    if not BUCKET_NAME:
        return jsonify(success=False, msg="GCS_BUCKET no configurado"), 500

    ctx = {k: (request.form.get(k, "").strip()) for k in ("tab", "local", "caja", "turno", "fecha")}
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

            # Subida
            blob.upload_from_file(f.stream, content_type=mime)
            created_blobs.append(blob)

            # Tamaño (best-effort)
            try:
                blob.reload()
                size_bytes = int(blob.size or 0)
            except Exception:
                size_bytes = None

            # Insert en BD
            cur.execute(
                """
                INSERT INTO imagenes_adjuntos
                (tab, local, caja, turno, fecha,
                 entity_type, entity_id,
                 gcs_path, original_name, mime, size_bytes,
                 checksum_sha256, subido_por, estado)
                VALUES
                (%s,%s,%s,%s,%s,
                 %s,%s,
                 %s,%s,%s,%s,
                 %s,%s,'active')
                """,
                (
                    ctx["tab"], ctx["local"], ctx["caja"], ctx["turno"], ctx["fecha"],
                    entity_type, entity_id,
                    blob_name, original, mime, size_bytes,
                    None,
                    session.get("username") or "sistema",
                ),
            )

            # Firmado (best-effort)
            view_url = None
            try:
                view_url = _signed_get(blob, name)
            except Exception:
                current_app.logger.exception("No se pudo firmar URL tras upload para %s", blob_name)

            uploaded.append({"name": original, "path": blob_name, "view_url": view_url})

        conn.commit()
        return jsonify(success=True, items=uploaded)

    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        # Borrado best-effort de blobs huérfanos
        for b in created_blobs:
            try:
                b.delete()
            except Exception:
                current_app.logger.warning("No se pudo borrar blob huérfano %s", getattr(b, "name", "?"))
        current_app.logger.exception("files.upload falló")
        return jsonify(success=False, msg=str(e)), 500

    finally:
        try:
            cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

@bp_files.route("/list", methods=["GET"])
def list_files():
    """
    scope=day|month|year (default: day)
    Reqs (day):   tab, local, fecha, caja, turno
    Reqs (month/year): tab, local, fecha

    Parámetros extra (opcionales):
      - debug=1 -> adjunta diagnóstico (prefix, ctx, count)
      - loose=1 -> si no encuentra en 'day', intenta fallback en 'month' filtrando el día
    """
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
            items = []
            count = 0
            # usar client.list_blobs() o bucket.list_blobs(); ambos válidos
            for b in bucket.list_blobs(prefix=pfx):
                count += 1
                orig = (b.metadata or {}).get("original_name") or b.name.rsplit("__", 1)[-1]
                # firmar best-effort
                view_url = None
                try:
                    view_url = _signed_get(b, orig)
                except Exception:
                    # Si falla, no romper el listado
                    current_app.logger.exception("No se pudo firmar URL para %s", b.name)
                items.append({
                    "id": b.name,
                    "name": orig,
                    "view_url": view_url,
                    "bytes": b.size or 0,
                    "mime": b.content_type or "image/*",
                    "path": b.name,
                })
            return items, count

        out, cnt = _list_with_prefix(prefix)
        current_app.logger.info("files.list found=%d prefix=%s", cnt, prefix)

        # Fallback opcional a nivel mes, filtrando el día exacto, por si caja/turno no coincidieron
        if not out and scope == "day" and loose:
            yyyy, mm, dd = _ymd_parts(ctx["fecha"])
            month_prefix = _prefix(ctx, scope="month")  # local/tab/YYYY/MM/
            current_app.logger.info("files.list loose=1 trying month prefix=%s (día=%s)", month_prefix, dd)
            tmp, cnt2 = _list_with_prefix(month_prefix)
            # filtrar por /dd/ en el path para no traer otros días
            out = [it for it in tmp if f"/{dd}/" in it["id"]]
            current_app.logger.info("files.list loose results=%d (pre=%d)", len(out), cnt2)

        if debug:
            return jsonify(success=True, items=out, debug={"prefix": prefix, "scope": scope, "ctx": ctx, "count": len(out)})

        return jsonify(success=True, items=out)

    except Exception as e:
        current_app.logger.exception("files.list falló")
        return jsonify(success=False, msg=str(e)), 500

@bp_files.route("/item", methods=["DELETE"])
def delete_item():
    """
    DELETE /files/item?id=<blob_name>
    """
    if not BUCKET_NAME:
        return jsonify(success=False, msg="GCS_BUCKET no configurado"), 500

    if not all([_get_db_connection, _can_edit, _get_user_level, _normalize_fecha]):
        return jsonify(success=False, msg="Dependencias no inicializadas"), 500

    local_ses = (session.get('local') or '').strip()
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

        conn = _get_db_connection()
        try:
            allowed = _can_edit(conn, _get_user_level(), local_b, caja_b, nfecha, turno_b)
        finally:
            try:
                conn.close()
            except Exception:
                pass

        if not allowed:
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        blob.delete()
        return jsonify(success=True)

    except gapi_exc.GoogleAPICallError as e:
        return jsonify(success=False, msg=f"GCS error: {e}"), 502
    except Exception as e:
        return jsonify(success=False, msg=str(e)), 500
