# Guía de Uso: Sistema de Logs de Sincronización con Oppen

## Descripción

El sistema de logs de sincronización registra automáticamente todos los intentos de sincronización con la API de Oppen, permitiendo rastrear éxitos, fallas y errores en producción.

## Tabla: `oppen_sync_log`

### Estructura

```sql
CREATE TABLE oppen_sync_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sync_type ENUM('factura', 'cuenta_corriente', 'recibo') NOT NULL,
    registro_id INT NULL,
    local VARCHAR(100) NOT NULL,
    fecha DATE NOT NULL,
    fecha_auditado DATE NOT NULL,
    local_auditado VARCHAR(100) NOT NULL,
    status ENUM('success', 'failed', 'pending') NOT NULL,
    sernr_oppen INT NULL,
    error_message TEXT NULL,
    request_payload JSON NULL,
    response_payload JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    retry_count INT DEFAULT 0,
    last_retry_at TIMESTAMP NULL
);
```

### Campos Clave

- **sync_type**: Tipo de registro sincronizado
  - `factura`: Facturas A, B o Z
  - `cuenta_corriente`: Facturas de cuentas corrientes
  - `recibo`: Recibo diario que vincula todas las facturas

- **fecha_auditado** y **local_auditado**: **CRÍTICO** - Permiten filtrar logs por el evento de auditoría específico

- **status**: Estado del intento
  - `success`: Sincronizado exitosamente
  - `failed`: Falló el intento
  - `pending`: Pendiente (para futuros reintentos)

- **sernr_oppen**: Número interno de Oppen (solo si fue exitoso)

- **error_message**: Mensaje de error detallado (solo si falló)

- **request_payload** y **response_payload**: JSON con datos enviados/recibidos (para debugging)

## Instalación

1. **Ejecutar el script de migración:**

```sql
-- En MySQL Workbench o cliente de MySQL
SOURCE CREATE_OPPEN_SYNC_LOG.sql;
```

O copiar y pegar el contenido del archivo en tu cliente SQL.

2. **Verificar que la tabla fue creada:**

```sql
DESCRIBE oppen_sync_log;
SHOW INDEX FROM oppen_sync_log;
```

## Uso

### El sistema registra automáticamente

Una vez instalada la tabla, **no se requiere ninguna acción manual**. El sistema automáticamente registrará:

1. **Al marcar un local como auditado** → Se registran intentos de:
   - Sincronización de facturas A/B/Z
   - Creación de facturas de Cuentas Corrientes
   - Creación del recibo diario

2. **Cada intento incluye**:
   - Timestamp exacto
   - Local y fecha del registro
   - Local y fecha de auditoría (para vincular al evento de cierre)
   - Estado (éxito/fallo)
   - SerNr de Oppen (si fue exitoso)
   - Mensaje de error completo (si falló)
   - Payloads request/response (para debugging avanzado)

## Consultas Útiles

### 1. Ver todos los logs de un cierre específico

```sql
SELECT
    id,
    sync_type,
    registro_id,
    status,
    sernr_oppen,
    error_message,
    created_at
FROM oppen_sync_log
WHERE local_auditado = 'BT212'
  AND fecha_auditado = '2026-02-03'
ORDER BY created_at DESC;
```

### 2. Ver solo intentos fallidos de una auditoría

```sql
SELECT
    sync_type,
    registro_id,
    error_message,
    created_at
FROM oppen_sync_log
WHERE local_auditado = 'BT212'
  AND fecha_auditado = '2026-02-03'
  AND status = 'failed'
ORDER BY created_at DESC;
```

### 3. Ver resumen de éxitos/fallas por tipo para un cierre

```sql
SELECT
    sync_type,
    status,
    COUNT(*) as cantidad
FROM oppen_sync_log
WHERE local_auditado = 'BT212'
  AND fecha_auditado = '2026-02-03'
GROUP BY sync_type, status;
```

### 4. Ver logs recientes (últimas 24 horas)

```sql
SELECT
    sync_type,
    local,
    fecha,
    status,
    error_message,
    created_at
FROM oppen_sync_log
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY created_at DESC;
```

### 5. Buscar un registro específico por ID

```sql
SELECT
    *
FROM oppen_sync_log
WHERE sync_type = 'cuenta_corriente'
  AND registro_id = 12345;
```

### 6. Ver todos los fallos de hoy

```sql
SELECT
    local_auditado,
    fecha_auditado,
    sync_type,
    COUNT(*) as fallos
FROM oppen_sync_log
WHERE DATE(created_at) = CURDATE()
  AND status = 'failed'
GROUP BY local_auditado, fecha_auditado, sync_type
ORDER BY fallos DESC;
```

### 7. Ver detalles completos de un error específico (con payloads)

```sql
SELECT
    sync_type,
    registro_id,
    error_message,
    request_payload,
    response_payload,
    created_at
FROM oppen_sync_log
WHERE id = 123;
```

## Casos de Uso

### Escenario 1: Auditor reporta que faltan facturas en Oppen

1. Obtener local y fecha del cierre:
   ```sql
   SELECT * FROM oppen_sync_log
   WHERE local_auditado = 'LOCAL_X'
     AND fecha_auditado = '2026-02-03';
   ```

2. Verificar si hay errores:
   ```sql
   SELECT * FROM oppen_sync_log
   WHERE local_auditado = 'LOCAL_X'
     AND fecha_auditado = '2026-02-03'
     AND status = 'failed';
   ```

3. Revisar el error específico para determinar causa raíz

### Escenario 2: Monitoring diario de sincronización

```sql
-- Ver resumen de sincronizaciones de hoy
SELECT
    DATE(created_at) as fecha,
    status,
    COUNT(*) as cantidad
FROM oppen_sync_log
WHERE DATE(created_at) = CURDATE()
GROUP BY DATE(created_at), status;
```

### Escenario 3: Debugging de error recurrente

```sql
-- Buscar todos los casos de un error específico
SELECT
    local_auditado,
    fecha_auditado,
    sync_type,
    registro_id,
    error_message
FROM oppen_sync_log
WHERE error_message LIKE '%Error de conexión%'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY created_at DESC;
```

## Ventajas del Sistema

1. **Auditoría Completa**: Cada intento de sincronización queda registrado permanentemente

2. **Debugging Facilitado**: Los payloads completos permiten reproducir errores exactos

3. **Vinculación a Cierres**: Usando `fecha_auditado` y `local_auditado`, puedes encontrar todos los logs relacionados a un cierre específico

4. **Monitoring Proactivo**: Puedes crear queries periódicas para detectar problemas antes de que los usuarios los reporten

5. **Histórico**: Los logs nunca se borran, permitiendo análisis retrospectivo

## Mantenimiento

### Limpieza de logs antiguos (opcional)

Si los logs crecen demasiado, puedes eliminar logs antiguos (por ejemplo, mayores a 6 meses):

```sql
DELETE FROM oppen_sync_log
WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH)
  AND status = 'success';  -- Solo eliminar éxitos, mantener errores
```

### Estadísticas de la tabla

```sql
-- Ver tamaño de la tabla
SELECT
    table_name,
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
FROM information_schema.TABLES
WHERE table_schema = DATABASE()
  AND table_name = 'oppen_sync_log';

-- Contar registros
SELECT COUNT(*) FROM oppen_sync_log;

-- Ver distribución por status
SELECT status, COUNT(*) as cantidad
FROM oppen_sync_log
GROUP BY status;
```

## Próximos Pasos (Futuro)

En el futuro se podría implementar:

1. **UI de visualización**: Dashboard para ver logs desde la web
2. **Alertas automáticas**: Enviar email/notificación cuando hay errores
3. **Reintentos automáticos**: Botón para reintentar sincronizaciones fallidas
4. **Reportes**: Generar reportes de sincronización por período

## Notas Importantes

- Los logs NO afectan el funcionamiento normal del sistema
- Si hay un error guardando el log, el sistema continúa normalmente
- Los payloads JSON pueden ser grandes para recibos con muchos PayModes
- La tabla tiene índices optimizados para búsquedas rápidas por fecha/local de auditoría
