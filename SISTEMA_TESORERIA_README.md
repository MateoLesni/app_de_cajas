# 💰 Sistema de Tesorería - Gestión de Remesas

## Descripción General

Sistema de dos niveles para la gestión y conciliación de remesas de efectivo:

1. **Carga Individual** (`/reporteria/remesas`) - Para tesoreros
2. **Conciliación por Local** (`/reporteria/remesas-tesoreria`) - Para admin de tesorería

## Roles y Permisos

### Tesorero (role_id 8)
- **Acceso**: `/reporteria/remesas`
- **Función**: Cargar montos reales de cada remesa/bolsa
- **Restricción**: No puede editar fechas aprobadas

### Admin Tesorería (role_id 9)
- **Acceso**: `/reporteria/remesas-tesoreria`
- **Funciones**:
  - Ver resumen agrupado por local
  - Aprobar conciliaciones
  - Desaprobar conciliaciones (con registro en auditoría)

## Instalación

### 1. Crear las tablas de aprobaciones

Ejecutar el script SQL:
```bash
mysql -u usuario -p nombre_base_datos < SQL_CREATE_APROBACIONES_REMESAS.sql
```

O ejecutar directamente en MySQL:
```sql
source SQL_CREATE_APROBACIONES_REMESAS.sql
```

### 2. Modificar tabla tesoreria_recibido para remesas individuales

**IMPORTANTE:** Este paso modifica la estructura de `tesoreria_recibido` para guardar cada remesa individual en lugar de totales por local.

```bash
mysql -u usuario -p nombre_base_datos < SQL_ALTER_TESORERIA_RECIBIDO.sql
```

O ejecutar directamente:
```sql
source SQL_ALTER_TESORERIA_RECIBIDO.sql
```

Este script:
- Agrega columnas `precinto` y `nro_remesa`
- Cambia la clave única de `(local, fecha_retiro)` a `(local, fecha_retiro, precinto, nro_remesa)`
- Permite guardar el monto real de cada bolsa por separado

### 3. Verificar que existan las tablas y columnas

```sql
SHOW TABLES LIKE 'tesoreria%';
DESCRIBE tesoreria_recibido;
```

Deberías ver:
- `tesoreria_recibido` (ya existente)
- `tesoreria_aprobaciones` (nueva)
- `tesoreria_aprobaciones_audit` (nueva)

## Flujo de Trabajo

### Paso 1: Carga por Tesorero (role_id 8)

1. Ingresa a `/reporteria/remesas`
2. Selecciona la fecha de retiro
3. Ve todas las remesas individuales en tabla
4. Para cada remesa:
   - Cuenta el dinero físico de la bolsa
   - Ingresa el monto real en formato argentino (ej: `1.000,50`)
   - Presiona Enter o click en "Guardar"
5. Puede usar "Guardar Todos los Cambios" para batch save

**Formato de números:**
- Separador de miles: punto (.)
- Decimales: coma (,)
- Ejemplo: `219.000,00`

### Paso 2: Revisión y Aprobación por Admin (role_id 9)

1. Ingresa a `/reporteria/remesas-tesoreria`
2. Selecciona la fecha a revisar
3. Ve el resumen agrupado por local
4. Verifica las diferencias (faltantes/sobrantes)
5. Click en "Aprobar Conciliación"
6. La fecha queda bloqueada para edición por tesoreros

### Paso 3: Desaprobar (si es necesario)

1. Si encuentra errores después de aprobar
2. Click en "Desaprobar Conciliación"
3. Se registra en auditoría quién y cuándo desaprobó
4. Los tesoreros pueden volver a editar

## Endpoints API

### Para Tesoreros (role_id 8+)

#### Guardar Remesa
```
POST /api/tesoreria/guardar-remesa
```
Body:
```json
{
  "local": "Fabric Sushi",
  "fecha_retiro": "2025-12-27",
  "nro_remesa": "3748363",
  "precinto": "518162",
  "monto_teorico": 181100.00,
  "monto_real": 181100.00
}
```

Respuesta si está aprobado:
```json
{
  "success": false,
  "msg": "No se puede editar. La conciliación de esta fecha ya fue aprobada."
}
```

#### Obtener Remesas de una Fecha
```
GET /api/tesoreria/remesas-detalle?fecha_retiro=2025-12-27
```

#### Verificar Estado de Aprobación
```
GET /api/tesoreria/estado-aprobacion?fecha_retiro=2025-12-27
```

### Para Admin Tesorería (role_id 9)

#### Aprobar Conciliación
```
POST /api/tesoreria/aprobar-conciliacion
```
Body:
```json
{
  "fecha_retiro": "2025-12-27",
  "observaciones": "Revisado y aprobado sin observaciones"
}
```

#### Desaprobar Conciliación
```
POST /api/tesoreria/desaprobar-conciliacion
```
Body:
```json
{
  "fecha_retiro": "2025-12-27",
  "observaciones": "Error en local Ribs Infanta - requiere recarga"
}
```

## Auditoría

Todas las aprobaciones y desaprobaciones quedan registradas en `tesoreria_aprobaciones_audit`:

```sql
SELECT * FROM tesoreria_aprobaciones_audit
WHERE fecha_retiro = '2025-12-27'
ORDER BY created_at DESC;
```

Ejemplo de resultado:
```
| id | fecha_retiro | accion      | usuario        | observaciones              | created_at          |
|----|--------------|-------------|----------------|----------------------------|---------------------|
| 1  | 2025-12-27   | aprobar     | admin_tesoro   | Todo OK                    | 2025-12-27 10:30:00 |
| 2  | 2025-12-27   | desaprobar  | admin_tesoro   | Error encontrado           | 2025-12-27 14:15:00 |
| 3  | 2025-12-27   | aprobar     | admin_tesoro   | Corregido y reaprobado     | 2025-12-27 15:00:00 |
```

## Estados de Aprobación

| Estado | Descripción | Editable por Tesoreros |
|--------|-------------|------------------------|
| `pendiente` | Sin aprobar aún | ✅ Sí |
| `aprobado` | Aprobado por admin | ❌ No |
| `desaprobado` | Desaprobado por admin | ✅ Sí |

## Diferencias (Cálculo)

```
Diferencia = Monto Teórico - Monto Real

Si Diferencia > 0  → Falta dinero (rojo)
Si Diferencia < 0  → Sobra dinero (naranja)
Si Diferencia = 0  → Perfecto (gris)
```

## Colores en la Interfaz

### `/reporteria/remesas` (Carga Individual)

| Elemento | Color | Significado |
|----------|-------|-------------|
| Encabezados | Gris oscuro (#d1d5db) | Headers de tabla |
| Columnas readonly | Gris claro (#f3f4f6) | Datos inmutables |
| Columna Real | Gris medio (#e5e7eb) | Campo editable |
| Input modificado | Amarillo (#fef3c7) | Pendiente de guardar |
| Diferencia negativa | Rojo (#dc2626) | Falta dinero |
| Diferencia positiva | Naranja (#f97316) | Sobra dinero |

### `/reporteria/remesas-tesoreria` (Conciliación)

| Badge | Color | Significado |
|-------|-------|-------------|
| 📦 En Tránsito | Amarillo | No recibido aún |
| ✅ Recibido | Verde | Sin diferencias |
| ⚠️ Con Diferencia | Rojo | Hay faltantes/sobrantes |
| ✔️ Auditado | Azul | Aprobado por admin |

## Troubleshooting

### Error: "No se puede editar. La conciliación ya fue aprobada"
**Causa**: Un admin aprobó la fecha
**Solución**: Contactar al admin de tesorería para que desapruebe si es necesario editar

### Error: "Faltan datos requeridos"
**Causa**: Datos incompletos en el request
**Solución**: Verificar que local y fecha_retiro estén presentes

### Las fechas aparecen como "NaN/NaN/NaN"
**Causa**: Formato de fecha inválido
**Solución**: Verificar que las fechas en BD sean DATE válidos (YYYY-MM-DD)

## Consultas Útiles

### Ver todas las conciliaciones aprobadas
```sql
SELECT
    fecha_retiro,
    estado,
    aprobado_por,
    aprobado_at,
    observaciones
FROM tesoreria_aprobaciones
WHERE estado = 'aprobado'
ORDER BY fecha_retiro DESC;
```

### Ver remesas con diferencias de una fecha
```sql
SELECT
    t.local,
    t.fecha_retiro,
    t.monto_teorico,
    t.monto_real,
    t.diferencia,
    t.estado
FROM tesoreria_recibido t
WHERE t.fecha_retiro = '2025-12-27'
  AND ABS(t.diferencia) > 0.01
ORDER BY ABS(t.diferencia) DESC;
```

### Historial completo de una fecha
```sql
SELECT
    fecha_retiro,
    accion,
    usuario,
    observaciones,
    created_at
FROM tesoreria_aprobaciones_audit
WHERE fecha_retiro = '2025-12-27'
ORDER BY created_at ASC;
```

## Mantenimiento

### Limpiar registros antiguos de auditoría (opcional)
```sql
-- Eliminar auditorías de más de 1 año
DELETE FROM tesoreria_aprobaciones_audit
WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR);
```

### Backup de auditoría
```bash
mysqldump -u usuario -p nombre_base_datos tesoreria_aprobaciones_audit > backup_auditoria_$(date +%Y%m%d).sql
```

---

**Última actualización:** 29 de Diciembre de 2024
**Versión:** 1.0
