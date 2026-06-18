# CLAUDE.md — Guía maestra del proyecto

Este archivo es el contexto principal para futuras sesiones de Claude. Cubre arquitectura, roles, integraciones y todas las decisiones técnicas relevantes.

Para Oppen API específicamente, ver: [OPPEN_API_DOCUMENTACION.md](./OPPEN_API_DOCUMENTACION.md).

---

## 1. Visión general del proyecto

**App de cajas** — Sistema web (Flask + MySQL) para que los locales gastronómicos del grupo carguen el cierre diario de cajas: ventas Z, tarjetas, MercadoPago, remesas (efectivo), cuentas corrientes, gastos, anticipos. Auditoría posterior por el equipo de Cajas. Integración con Oppen para crear facturas y recibos automáticamente al auditar.

**Working directory**: `app_de_cajas/`
**Repo**: `https://github.com/MateoLesni/app_de_cajas`
**Branch principal**: `main`
**Producción**: Cloud Run `app-cajas-us` (proyecto GCP `awesome-nimbus-480121-j1`, región `us-central1`)
**BD producción**: Cloud SQL MySQL 8 — instancia `bd-cajas-iowa-v3`, BD `cajasdb`
**Dominio**: `boxng.com.ar`

---

## 2. Stack técnico

- **Backend**: Flask (Python 3.13), gunicorn, `app.py` monolítico (~13.500 líneas) + módulos en `modules/`
- **Frontend**: HTML/Jinja2 + CSS custom (sin frameworks) + Vanilla JS en `static/js/`
- **BD**: MySQL 8 (Cloud SQL en producción, Docker/proxy localmente)
- **Imágenes**: GCS bucket `imagenes-cajas-prod-v2`
- **Auth**: bcrypt + Flask session
- **Deploy**: Cloud Build trigger en commit a `main` → script manual lanza Cloud Run con la última imagen

### Entrypoint y deploy

- `Procfile`: `web: gunicorn -b :$PORT app:app --workers=2 --threads=8 --timeout=120`
- Cloud Run actual: 2 CPU, 1Gi RAM, max 3 instancias, concurrency 80
- Cloud SQL actual: `db-custom-2-8192` (2 vCPU, 8GB RAM) — antes era `db-f1-micro` y se saturaba con encargados multi-local
- Deploy: el usuario lo hace desde un script en la shell de GCP (no por gcloud directo). Hay que pushear a `main`, esperar que Cloud Build buildee, y correr el script

---

## 3. Roles y permisos

Los roles viven en la tabla `roles` (columnas: `id`, `name`, `level`). `role_level` es lo que controla los `@role_min_required(N)` y se inyecta en todas las plantillas Jinja2 como `session['role_level']`.

| Nivel | Nombre | Descripción |
|---|---|---|
| 1 | `cajero` | Carga su caja. Ve solo su local |
| 2 | `encargado` | Cierra el local. Ve solo sus locales asignados |
| 2 | `administrativo` | Variante de encargado |
| 3 | `auditor` | Audita. Ve todos los locales |
| 4 | `anticipos` | Solo carga anticipos en locales asignados (allowlist en `login_required`) |
| 5 | `jefe_auditor` | (raro) |
| 6 | `admin_anticipos` | Gestiona anticipos en todos los locales |
| 7 | `tesoreria` | Va a `/tesoreria/home` |
| 9 | `reporteria` | **Solo** `/ventas-extras` (allowlist en `login_required`). Para reportes gerenciales que no afectan cajas |
| 10 | `soporte` | Desarrollo: reabrir cajas, des-auditar, ver auditoría del sistema, ver Panel de Control |

### Redirect después del login (en `redirect_after_login`)

```
lvl >= 10                            → /soporte
role == 'reporteria'                 → /ventas-extras
lvl >= 7                             → /tesoreria/home
lvl == 4 o 6                         → /gestion-anticipos
lvl == 2                             → /encargado
lvl >= 3                             → /auditor
default                              → / (cajero)
```

### Allowlists en `login_required`

- **Anticipos (nivel 4 y 6)**: solo pueden acceder a una lista hardcodeada de endpoints (`/gestion-anticipos`, `/api/anticipos_recibidos/*`, etc.)
- **Reportería (rol `reporteria`)**: solo `/ventas-extras` + sus APIs + logout + static

Cualquier intento de navegar fuera redirige (si es GET HTML) o devuelve 403 (si es API).

---

## 4. Estructura de tablas principales

### Tablas operativas

- `locales` — `local`, `cantidad_cajas`, `turnos` (string, puede ser `"Turno noche"` o `"Turno día"`)
- `users` — `id` (UUID), `username`, `password` (bcrypt), `role_id`, `local` (default), `society`, `status`, `first_login`
- `user_locales` — para usuarios con múltiples locales (encargados Recital, anticipos, etc.)
- `roles` — `id`, `name`, `level`
- `terminales` — `local`, `terminal`, `creada_por`, `fecha_creacion`
- `labels_oppen` — `local`, `cod_oppen` (ej: ALMF01, CRZ02, TSTTR01)

### Tablas de transacciones (suffix `_trns`)

Todas con `local`, `caja`, `turno`, `fecha`, `usuario`, `estado` (`'ok'` o `'revision'` o `'eliminado'`):

- `ventas_trns` — venta_total_sistema (la Z). Tiene `fecha_carga` que **DEBE** insertarse con `NOW()` explícito (la columna usa `DEFAULT CURRENT_TIMESTAMP` que ignora el `SET time_zone` de la sesión)
- `tarjetas_trns` — tarjeta, terminal, lote, monto, monto_tip
- `mercadopago_trns` — importe, terminal, tipo (`'NORMAL'` o `'TIP'`)
- `rappi_trns`, `pedidosya_trns` — monto
- `remesas_trns` — nro_remesa, precinto, monto, divisa, monto_usd, cotizacion_divisa, total_conversion, retirada, **`origen_anticipo_id`** (NULL para remesas normales; ID del anticipo si fue auto-creada al cargar un anticipo en efectivo)
- `gastos_trns` — tipo (FK a `tipos_gastos`), monto
- `facturas_trns` — tipo (`'A'`, `'B'`, `'Z'`, `'CC'`), punto_venta, nro_factura, monto, **`sernr_oppen`** (BIGINT), **`total_oppen`** (DECIMAL 15,2 — lo que devolvió Oppen al crear, puede diferir 1 ctvo de `monto` por redondeo IVA)
- `cuentas_corrientes_trns` — monto, cliente_id, estado, `sernr_oppen` (BIGINT)

### Tablas de snapshots (suffix `snap_*`)

Cuando se cierra un local, se snapshotean los datos para preservar la imagen exacta del cierre:
- `snap_ventas`, `snap_tarjetas`, `snap_mercadopago`, `snap_rappi`, `snap_pedidosya`, `snap_gastos`, `snap_facturas`
- **NO existen** `snap_remesas` ni `snap_anticipos` (siempre se leen de tablas normales)

### Cierres y auditoría

- `cierres_locales` — `local`, `fecha`, `closed_at` (NOW Argentina), `closed_by`
- `locales_auditados` — `local`, `fecha`, `auditado_por`, `fecha_auditoria` (NOW Argentina), **`sernr_recibo_oppen`** (BIGINT)
- `cajas_estado` — estado por caja/turno/fecha (`estado = 0` cerrada, `= 1` abierta), con `cerrada_en`, `cerrada_por`
- `auditoria` — log de todas las operaciones (INSERT, UPDATE, DELETE, REOPEN_BOX, REOPEN_LOCAL, UNAUDIT_LOCAL, CREATE_BOX). `accion` es VARCHAR (no ENUM)

### Anticipos

- `anticipos_recibidos` — anticipo en sí: fecha_pago, fecha_evento, importe, divisa, cotizacion_divisa, cliente, medio_pago_id, local, caja, turno, estado (`'pendiente'`, `'consumido'`, `'eliminado_global'`)
- `anticipos_estados_caja` — uno por cada vez que se consume un anticipo en una caja, con `importe_consumido` ya convertido a ARS (clave para el cálculo de cajas — ver "anticipos USD" más abajo)
- `medios_anticipos` — catálogo (Efectivo, Lemon, MercadoPago, Passline, Transferencia). El campo `es_efectivo = 1` define si dispara la creación de remesa automática
- `anticipos_borrados` — backup soft-delete. **Atención**: la columna `importe` es DECIMAL(10,2). Si el anticipo es muy grande, falla. Ya se amplió a DECIMAL(15,2)

### Imágenes

- `imagenes_adjuntos` — `tab` (`'remesas'`, `'ventas_z'`, `'tarjeta'`, `'mercadopago'`, `'rappi'`, `'pedidosya'`, `'gastos'`, `'ctas_ctes'`), `local`, `caja`, `turno`, `fecha`, `entity_type`, `entity_id`, `gcs_path`, `estado` (`'active'` o `'deleted'`)

### Reportería

- `ventas_extras` (creada con migración 09) — local, fecha, monto (puede ser negativo), motivo, usuario, estado (`'activo'` o `'eliminado'`), con campos de auditoría completos (created_at, updated_at, deleted_at, motivos). Usada por el rol `reporteria` (nivel 9) y consumida por un proyecto externo de reportería gerencial

---

## 5. Lógica crítica de cálculo de cajas

El cierre de caja compara **Venta Total** (Z del sistema) vs **Total Cobrado** (suma de medios de cobro). La **Diferencia** debe ser ~0.

### Total Cobrado = suma de:
- Efectivo (remesas, **excluyendo las que tienen `origen_anticipo_id` no NULL** — son la remesa espejo del anticipo)
- Tarjetas
- MercadoPago (tipo='NORMAL')
- Rappi
- PedidosYa
- Cuenta Corriente (facturas tipo='CC' viejas + `cuentas_corrientes_trns` nuevas con `estado='ok'`)
- Gastos
- **Anticipos consumidos** — siempre se usa `anticipos_estados_caja.importe_consumido` (ya está en ARS aunque el anticipo sea USD)
- **NO se restan** los anticipos recibidos en efectivo (decisión de octubre 2025: anticipos quedan fuera del cálculo de caja)

### Discovery / Diferencia
- **Discovery** = `venta_total_sistema - total_facturas_zab`. Puede ser **negativo** si las facturas exceden la venta (caso `Cruza Recoleta`). NO se forzaba a `max(..., 0)` — hay un fix explícito que lo permite negativo.
- **Diferencia de caja** = `total_cobrado - venta_total_sistema`. Es separada del Discovery.

### Bug histórico: anticipos USD per-caja
En `_get_diferencias_detalle()` (la query de diferencia por caja/turno), se usaba `ar.importe` (monto USD crudo: ej 10000 USD), lo que daba diferencias fantasma gigantes (-11.5M). El fix: usar `aec.importe_consumido` (ya en ARS), igual que el cálculo global. **Si volvés a tocar diferencias por caja, NO uses `ar.importe`.**

---

## 6. Anticipos en efectivo (flujo crítico)

Cuando se carga un anticipo con medio de pago `Efectivo` (es decir, `medios_anticipos.es_efectivo = 1`):

1. Se inserta en `anticipos_recibidos` con caja, turno, fecha_pago
2. **Se auto-crea una remesa espejo** en `remesas_trns` con `origen_anticipo_id = anticipo.id`, mismo monto/divisa/cotización
3. **Se vincula la imagen del comprobante** del anticipo como imagen de la remesa (en `imagenes_adjuntos` con `tab='remesas'`, `entity_type='remesa_anticipo'`)
4. La remesa espejo aparece en la caja pero **NO se suma al efectivo** del cierre (porque tiene `origen_anticipo_id`)
5. La remesa espejo es **inmodificable desde la caja** (hay que editar el anticipo)
6. Al eliminar el anticipo: se borra la remesa, se borra la imagen vinculada, y el anticipo queda `estado='eliminado_global'` en `anticipos_borrados`

### Detalles importantes

- El **turno** de la remesa creada debe ser el turno real del local (consultar `locales.turnos`), no `'UNI'`. Hay código que maneja esto.
- El **cursor** para leer la imagen del anticipo debe ser `dictionary=True`, sino `img_row['gcs_path']` rompe silenciosamente.
- La query que excluye estas remesas usa `(origen_anticipo_id IS NULL)` — en todos los lugares donde se calcula efectivo.

---

## 7. Timezones (importantísimo)

**Política**: todo en Argentina UTC-3.

- La sesión de MySQL se setea con `SET time_zone = '-03:00'` en `get_db_connection()`
- `NOW()` en MySQL respeta esa sesión → devuelve Argentina
- **`DEFAULT CURRENT_TIMESTAMP` en columnas NO respeta la sesión** → usa el GLOBAL time_zone del servidor (UTC en Cloud SQL)
- Por eso `ventas_trns.fecha_carga` (que tenía DEFAULT) se cambió a usar `NOW()` explícito en el INSERT
- `auditoria.fecha_hora` también usa `NOW()`
- En Python: **nunca** usar `datetime.now(tz_arg)` para insertar en BD — usar `NOW()` de MySQL

**Si en el futuro reportan timestamps adelantados 3 horas**: probablemente sea otra columna con `DEFAULT CURRENT_TIMESTAMP`. Cambiar el INSERT para setear con `NOW()` explícito o ampliar el `database-flag` `default_time_zone=-03:00` en la instancia Cloud SQL (requiere restart).

### Frontend
Cuando JS recibe un DATETIME del backend, viene como `"2026-06-04 01:17:47"` (sin TZ info) o `"... GMT"` (formato HTTP). **No hacer `new Date()` + `toLocaleString({ timeZone: ... })`** porque convierte mal. La función `formatFecha` en `auditoria_sistema.js` parsea el string directamente sin conversión.

---

## 8. Integración Oppen

**Ver [OPPEN_API_DOCUMENTACION.md](./OPPEN_API_DOCUMENTACION.md) para la documentación completa de la API de Oppen** (payloads, errores, mapeos).

### Cosas clave a recordar

- URL producción: `https://ng.oppen.io` — URL test: `https://ngprueba.oppen.io` (la instancia test se apaga sola)
- Configurada en `modules/oppen_integration.py` (constante `BASE_URL`)
- Solo `Costa7070` se excluye de la sincronización automática (lista `LOCALES_SIN_OPPEN`)
- Cuando se audita un local: se crean facturas A/B/Z → CC → recibo
- **El recibo NO se puede vincular a facturas creadas DESPUÉS** (caso reportado: auditor marcó auditado y después cargó una factura más → quedó suelta en Oppen)
- Clientes especiales: Tostado → `CUIT0`, Milvidas → `ZT11111`, resto → `C00001`
- Discovery se ajusta automáticamente para que el balance del recibo cierre exacto al centavo

---

## 9. Módulos y archivos relevantes

```
app_de_cajas/
├── app.py                          ← monolítico, ~13.500 líneas. Casi todas las rutas
├── Procfile                        ← entrypoint gunicorn
├── modules/
│   ├── oppen_integration.py        ← cliente API Oppen
│   ├── tabla_auditoria.py          ← Blueprint /api/tabla_auditoria + /auditoria_sistema
│   ├── files_gcs.py                ← upload, view, signed URLs de GCS
│   └── ... (otros helpers)
├── templates/                      ← Jinja2 HTML (uno por página, no usan base común)
│   ├── index.html (cajero)
│   ├── index_encargado.html
│   ├── index_auditor.html
│   ├── soporte.html
│   ├── panel_control.html          ← grilla heatmap de estados por local/fecha (soporte/auditor)
│   ├── auditoria_sistema.html
│   ├── ventas_extras.html          ← Reportería (rol nivel 9)
│   ├── gestion_anticipos.html
│   ├── resumen_local.html
│   ├── tesoreria_*.html
│   └── ...
├── static/
│   ├── css/styles.css              ← estilos globales
│   └── js/                         ← un .js por página
└── migrations/                     ← SQL incremental (no se aplican solas en producción)
```

### Archivos con mayor cuidado

- **`app.py`**: monolítico, modificar con cuidado. Las rutas están agrupadas por feature pero no estrictamente. Usar grep antes de agregar nuevas.
- **`modules/oppen_integration.py`**: cualquier cambio acá impacta facturas reales en producción. SIEMPRE probar primero apuntando a `ngprueba.oppen.io`.

---

## 10. Producción y operación

### Acceso a Cloud Run y Cloud SQL

- Proyecto: `awesome-nimbus-480121-j1`
- Servicio: `app-cajas-us` (us-central1)
- Instancia SQL: `bd-cajas-iowa-v3`
- Service Account de Cloud Run: `cajas-app-sa@awesome-nimbus-480121-j1.iam.gserviceaccount.com`
- Bucket GCS: `imagenes-cajas-prod-v2`

### Cómo leer logs

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND textPayload=~"Oppen"' \
  --project=awesome-nimbus-480121-j1 --limit=50 --freshness=2h \
  --format="value(timestamp,textPayload)"
```

Los `logger.info` con emojis a veces no aparecen en Cloud Logging (encoding raro). Mejor usar `print()` para debug que se vea en logs.

### Acceso de analistas externos a la BD

- Se creó usuario MySQL `gestion_ng` con `GRANT SELECT ON cajasdb.ventas_trns`
- Política de contraseñas Cloud SQL: no puede contener el username
- Se conectan vía **Cloud SQL Auth Proxy** (NO autorizando IPs — frágil) con service account `gestion-ng-readonly`
- Si necesitan acceso a otra tabla, agregar otro `GRANT SELECT ON cajasdb.<tabla>`
- En la PC del analista, el proxy ocupa un puerto local (3306 o 3307 si está en uso) y se conectan a `localhost`

---

## 11. Patrones recurrentes en el código

### Auto-migración inline

Hay varios INSERTs que verifican si una columna existe y la crean si no (`ALTER TABLE ... ADD COLUMN`). Se hace dentro del request handler con `INFORMATION_SCHEMA.COLUMNS`. No es ideal pero es lo que hay. Ejemplos:
- `remesas_trns.origen_anticipo_id`
- `facturas_trns.total_oppen`
- `locales_auditados.sernr_recibo_oppen`

### Excluir locales en queries

Hay varias queries que excluyen locales hardcoded. Listado actual (en `app.py` del Panel de Control):

```python
LOCALES_EXCLUIDOS = [
    'Local_Test',
    'Modulo 1', 'Modulo 2', 'Modulo 3', 'Modulo 4',
    'Eventos Polo', 'Fabric Dique', 'Imagina Bocha Cumpleaños',
    'Imagina Bocha Web', 'Catering NG', 'Blue Horse',
    'Parrilla Take Away', 'Heladeria AT Love', 'Nomade', 'Polo House',
]
# y locales con 'Recital' en el nombre (LIKE '%Recital%')
```

Nota: para `NOT IN` con tupla en MySQL connector, hay que **expandir a placeholders manualmente** (no acepta `NOT IN %s` con tupla directa).

### Logging

```python
print(f"🔄 ...")    # va a Cloud Logging
logger.info(...)    # a veces se pierde
logger.error(...)   # va a Cloud Logging
```

---

## 12. Tips de operación

### Cuando un auditor reporta un problema

1. Revisar primero los logs de Cloud Run filtrando por el local/fecha mencionados
2. Si involucra Oppen: chequear `oppen_sync_log` en BD
3. Si involucra cálculos: revisar `_get_diferencias_detalle` y la query global de `api_resumen_local`

### Cuando se pide excluir locales del Panel de Control

Editar `LOCALES_EXCLUIDOS` en `app.py` (buscá la lista, está en una sola función). Agregar el local exacto. Si son varios con patrón común, agregar otro `AND local NOT LIKE '%X%'`.

### Cuando se reporta lentitud

1. Verificar tier de Cloud SQL (`gcloud sql instances describe`). El `db-f1-micro` se satura.
2. Verificar config de Cloud Run (CPU/RAM). Encargados multi-local hacen muchas queries simultáneas.
3. Mirar si el `redirect_after_login` no entra en un loop o algo raro

### Cuando rompe algo con `Out of range value for column`

Es una columna DECIMAL chica. Ampliarla con ALTER TABLE. Casos conocidos: `anticipos_borrados.importe` (era DECIMAL(10,2)), `*.sernr_oppen` (debe ser BIGINT, no INT, porque los SerNr de Oppen pasan los 10 dígitos).

---

## 13. Reglas para mí (el agente)

- **No mencionar "ultracode", "ultrareview" ni nada de ese estilo** salvo que el user pregunte. El user opera con Claude Code estándar.
- **Antes de tocar producción**: confirmar con el user antes de cualquier acción destructiva (DELETE, DROP, force push, etc.)
- **Para cambios en Oppen**: avisar siempre cuando se cambia la URL (test vs prod) y confirmar antes de pushear con URL productiva
- **Comentarios en código**: mantener mínimos. El user prefiere código limpio sin comentarios explicativos obvios
- **No crear `.md` adicionales** salvo que el user lo pida. Toda la doc consolidada acá
- **Idioma**: el user habla en argentino. Responder en argentino, semi-profesional técnico
- **Pushear sin avisar el resultado**: el user prefiere que pushee directo cuando me lo pide. No explicar lo que hice salvo error
- **Auditoría de timestamps**: si toco timestamps, recordar que la regla es Argentina siempre, usar `NOW()` de MySQL
