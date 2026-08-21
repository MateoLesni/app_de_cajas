# -*- coding: utf-8 -*-
"""
Cloud Function (Gen2) — Backup semanal de la BD cajasdb a Google Drive.

- Dumpea TODA la base EXCEPTO la tabla `users` (datos sensibles).
- Genera un .sql en Python puro (no depende de mysqldump, que no existe en el
  runtime de Cloud Functions), lo comprime en .sql.gz y lo sube a una carpeta
  de Google Drive (Workspace) via la Drive API.
- Retencion: conserva los 12 backups mas recientes en esa carpeta y borra el resto.

La dispara Cloud Scheduler (semanal) con un POST HTTP.

Variables de entorno esperadas:
  DB_HOST           -> socket Cloud SQL: /cloudsql/PROJECT:REGION:INSTANCE
  DB_USER, DB_PASS, DB_NAME
  DRIVE_FOLDER_ID   -> ID de la carpeta de Drive (compartida con el SA)
  EXCLUDE_TABLES    -> opcional, csv de tablas a excluir (default: "users")
  RETENTION         -> opcional, cuantos backups conservar (default: 12)
"""
import os
import gzip
import io
import datetime

import pymysql
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import google.auth


def _env(name, default=None, required=False):
    v = os.environ.get(name, default)
    if required and not v:
        raise RuntimeError(f"Falta variable de entorno {name}")
    return v


def _connect():
    """Conecta a Cloud SQL por unix socket (igual que la app)."""
    host = _env("DB_HOST", required=True)   # /cloudsql/PROJECT:REGION:INSTANCE
    return pymysql.connect(
        unix_socket=host,
        user=_env("DB_USER", required=True),
        password=_env("DB_PASS", required=True),
        database=_env("DB_NAME", "cajasdb"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.Cursor,
    )


def _sql_escape(value):
    """Escapa un valor Python a literal SQL."""
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return "0x" + value.hex()
    if isinstance(value, datetime.datetime):
        return "'" + value.strftime("%Y-%m-%d %H:%M:%S") + "'"
    if isinstance(value, datetime.date):
        return "'" + value.strftime("%Y-%m-%d") + "'"
    if isinstance(value, datetime.timedelta):
        return "'" + str(value) + "'"
    s = str(value)
    s = s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r").replace("\x00", "")
    return "'" + s + "'"


def _dump_database(conn, exclude_tables):
    """Genera el dump SQL completo (CREATE + INSERTs) como texto, excepto exclude_tables."""
    out = io.StringIO()
    out.write("-- Backup cajasdb generado por Cloud Function\n")
    out.write(f"-- Fecha: {datetime.datetime.utcnow().isoformat()}Z (UTC)\n")
    out.write(f"-- Tablas excluidas: {', '.join(sorted(exclude_tables)) or '(ninguna)'}\n")
    out.write("SET FOREIGN_KEY_CHECKS=0;\n")
    out.write("SET NAMES utf8mb4;\n\n")

    cur = conn.cursor()
    # Solo BASE TABLE (excluye VIEWs: no tienen datos propios y su definer puede
    # estar roto en Cloud SQL, dando Access denied al hacer SELECT sobre ellas).
    cur.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)
    tablas = [r[0] for r in cur.fetchall()]

    BATCH = 500
    for tabla in tablas:
        if tabla in exclude_tables:
            out.write(f"-- (excluida: {tabla})\n\n")
            continue

        # CREATE TABLE (cursor de metadata)
        cur.execute(f"SHOW CREATE TABLE `{tabla}`")
        create_row = cur.fetchone()
        create_sql = create_row[1] if create_row else None
        out.write(f"DROP TABLE IF EXISTS `{tabla}`;\n")
        if create_sql:
            out.write(create_sql + ";\n\n")

        # DATA — cursor propio para el streaming, para no dejar resultados sin leer
        dcur = conn.cursor()
        dcur.execute(f"SELECT * FROM `{tabla}`")
        cols = [d[0] for d in dcur.description]
        col_list = ", ".join(f"`{c}`" for c in cols)
        escritas = 0
        while True:
            rows = dcur.fetchmany(BATCH)
            if not rows:
                break
            values = []
            for row in rows:
                vals = ", ".join(_sql_escape(v) for v in row)
                values.append(f"({vals})")
            out.write(f"INSERT INTO `{tabla}` ({col_list}) VALUES\n")
            out.write(",\n".join(values))
            out.write(";\n")
            escritas += len(rows)
        dcur.close()
        if escritas == 0:
            out.write(f"-- `{tabla}` sin filas\n")
        out.write("\n")

    out.write("SET FOREIGN_KEY_CHECKS=1;\n")
    cur.close()
    return out.getvalue()


def _drive_service():
    """Cliente de Drive usando las credenciales del service account de la function."""
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/drive"])
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _upload_to_drive(service, folder_id, filename, data_bytes):
    media = MediaIoBaseUpload(io.BytesIO(data_bytes),
                              mimetype="application/gzip", resumable=False)
    meta = {"name": filename, "parents": [folder_id]}
    f = service.files().create(body=meta, media_body=media,
                               fields="id, name, createdTime",
                               supportsAllDrives=True).execute()
    return f


def _apply_retention(service, folder_id, keep):
    """Deja solo los `keep` backups mas recientes en la carpeta; borra el resto."""
    q = f"'{folder_id}' in parents and trashed = false and name contains 'cajasdb_'"
    res = service.files().list(q=q, orderBy="createdTime desc",
                               fields="files(id, name, createdTime)",
                               pageSize=100, supportsAllDrives=True,
                               includeItemsFromAllDrives=True).execute()
    files = res.get("files", [])
    borrados = []
    for f in files[keep:]:
        service.files().delete(fileId=f["id"], supportsAllDrives=True).execute()
        borrados.append(f["name"])
    return borrados


def run_backup(request):
    """Entry point HTTP de la Cloud Function."""
    exclude = set(x.strip() for x in _env("EXCLUDE_TABLES", "users").split(",") if x.strip())
    retention = int(_env("RETENTION", "12"))
    folder_id = _env("DRIVE_FOLDER_ID", required=True)

    conn = _connect()
    try:
        sql_text = _dump_database(conn, exclude)
    finally:
        conn.close()

    gz = gzip.compress(sql_text.encode("utf-8"))
    fecha = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    filename = f"cajasdb_{fecha}.sql.gz"

    service = _drive_service()
    subido = _upload_to_drive(service, folder_id, filename, gz)
    borrados = _apply_retention(service, folder_id, retention)

    msg = (f"OK backup '{subido['name']}' (id {subido['id']}), "
           f"{len(gz)} bytes comprimidos, excluidas={sorted(exclude)}, "
           f"retencion={retention}, borrados={len(borrados)}")
    print(msg)
    return (msg, 200)
