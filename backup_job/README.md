# Backup semanal de cajasdb → Google Drive

Cloud Function (Gen2) que dumpea la BD **excepto la tabla `users`**, la comprime
y la sube a una carpeta de Google Drive (Workspace). La dispara Cloud Scheduler
una vez por semana. Retención: conserva los 12 backups más recientes.

- Dump en Python puro (no usa `mysqldump`).
- Excluye `users`. Configurable con `EXCLUDE_TABLES` (csv).
- Conexión a Cloud SQL por unix socket (igual que la app).

---

## Variables / valores del proyecto

```
PROJECT   = awesome-nimbus-480121-j1
REGION    = us-central1
INSTANCE  = bd-cajas-iowa-v3
CONNNAME  = awesome-nimbus-480121-j1:us-central1:bd-cajas-iowa-v3
DB_NAME   = cajasdb
```

---

## Paso 1 — Service account dedicado

```bash
gcloud config set project awesome-nimbus-480121-j1

# Crear el SA
gcloud iam service-accounts create cajas-backup-sa \
  --display-name="Backup BD Cajas a Drive"

# Permiso para conectarse a Cloud SQL
gcloud projects add-iam-policy-binding awesome-nimbus-480121-j1 \
  --member="serviceAccount:cajas-backup-sa@awesome-nimbus-480121-j1.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

El email del SA queda:
`cajas-backup-sa@awesome-nimbus-480121-j1.iam.gserviceaccount.com`

---

## Paso 2 — Carpeta de Google Drive (Workspace)

Carpeta ya creada. **Folder ID:** `1409LfW1oi6VWpGgH-gWOBGbc-oHud_9E`

1. Compartir esa carpeta con permiso **Editor** (o agregar como miembro si es
   Unidad compartida) al email del SA:
   `cajas-backup-sa@awesome-nimbus-480121-j1.iam.gserviceaccount.com`

> El SA no tiene cuota de Drive propia. Si la carpeta está en una **Unidad
> compartida** (Shared Drive), agregar el SA como miembro con rol de gestor de
> contenido. Si está en "Mi unidad", compartirla y el archivo consumirá la cuota
> de ese usuario. El código soporta ambos casos (`supportsAllDrives=True`).

---

## Paso 3 — Guardar la contraseña de BD en Secret Manager

```bash
# Crear el secreto con la password de la BD (reemplazar por la password real de mate-dev)
printf 'LA_PASSWORD_DE_MATE_DEV' | gcloud secrets create cajas-db-pass \
  --data-file=- --replication-policy=automatic

# Permitir que el SA del backup lea ese secreto
gcloud secrets add-iam-policy-binding cajas-db-pass \
  --member="serviceAccount:cajas-backup-sa@awesome-nimbus-480121-j1.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Paso 4 — Desplegar la Cloud Function

Desde la carpeta `backup_job/` (subila a Cloud Shell o cloná el repo):

```bash
gcloud functions deploy cajas-backup \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=. \
  --entry-point=run_backup \
  --trigger-http \
  --no-allow-unauthenticated \
  --service-account=cajas-backup-sa@awesome-nimbus-480121-j1.iam.gserviceaccount.com \
  --set-cloudsql-instances=awesome-nimbus-480121-j1:us-central1:bd-cajas-iowa-v3 \
  --timeout=540 \
  --memory=1Gi \
  --set-env-vars=DB_HOST=/cloudsql/awesome-nimbus-480121-j1:us-central1:bd-cajas-iowa-v3,DB_USER=mate-dev,DB_NAME=cajasdb,DRIVE_FOLDER_ID=1409LfW1oi6VWpGgH-gWOBGbc-oHud_9E,EXCLUDE_TABLES=users,RETENTION=12 \
  --set-secrets=DB_PASS=cajas-db-pass:latest
```

> `DB_USER=mate-dev` ya está puesto. `DB_PASS` NO va en texto: se lee de Secret
> Manager vía `--set-secrets`. Nada que reemplazar en este comando.

---

## Paso 5 — Cloud Scheduler (semanal)

Necesita un SA que pueda invocar la función. Reutilizamos el mismo `cajas-backup-sa`
dándole permiso de invocación:

```bash
# Permitir que el SA invoque la propia function
gcloud run services add-iam-policy-binding cajas-backup \
  --region=us-central1 \
  --member="serviceAccount:cajas-backup-sa@awesome-nimbus-480121-j1.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# URL de la function
URL=$(gcloud functions describe cajas-backup --region=us-central1 --gen2 --format='value(serviceConfig.uri)')

# Job semanal: lunes 03:00 hora Argentina
gcloud scheduler jobs create http cajas-backup-semanal \
  --location=us-central1 \
  --schedule="0 3 * * 1" \
  --time-zone="America/Argentina/Buenos_Aires" \
  --uri="$URL" \
  --http-method=POST \
  --oidc-service-account-email=cajas-backup-sa@awesome-nimbus-480121-j1.iam.gserviceaccount.com \
  --oidc-token-audience="$URL"
```

---

## Probar a mano (sin esperar al lunes)

```bash
gcloud scheduler jobs run cajas-backup-semanal --location=us-central1
# o invocar la function directo:
curl -X POST "$URL" -H "Authorization: Bearer $(gcloud auth print-identity-token)"
```

Después verificá que aparezca `cajasdb_YYYY-MM-DD.sql.gz` en la carpeta de Drive.

---

## Restaurar un backup

El backup es un `.sql` completo (estructura `CREATE TABLE` + datos `INSERT`),
restaurable de una sola pieza.

1. Descargar el `.sql.gz` de Drive.
2. `gunzip cajasdb_YYYY-MM-DD.sql.gz`
3. `mysql -h HOST -u USER -p cajasdb < cajasdb_YYYY-MM-DD.sql`

> El backup **no incluye la tabla `users`** (se excluyó a propósito). Al restaurar
> en una base vacía, habrá que recrear/importar `users` por separado.
