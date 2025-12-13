# 🚀 Instalación del Sistema de Anticipos Recibidos

## Resumen del Sistema

El sistema de Anticipos Recibidos permite:

**PARTE 1: Creación (admin_anticipos)**
- Usuarios con rol `admin_anticipos` pueden crear/editar/eliminar anticipos
- Pueden trabajar con TODOS los locales
- Solo tienen acceso a la interfaz de gestión de anticipos

**PARTE 2: Consumo (cajeros)**
- Los anticipos aparecen automáticamente en las cajas cuando:
  - El `local` del anticipo coincide con el local de la caja
  - La `fecha_evento` del anticipo coincide con la fecha de operación
- Los cajeros pueden:
  - **Consumir**: Cuando el cliente vino y consumió el anticipo
  - **Eliminar de caja**: Cuando el cliente no vino a esa caja específica
- Una vez consumido en una caja, desaparece de todas las demás

---

## 📋 Pasos de Instalación

### 1. Ejecutar Script SQL

Ejecutar el archivo `setup_admin_anticipos.sql` en la base de datos MySQL:

```bash
mysql -u tu_usuario -p nombre_de_bd < setup_admin_anticipos.sql
```

Este script:
- ✅ Crea el rol `admin_anticipos` (nivel 5)
- ✅ Crea el usuario `admin_anticipos` con contraseña temporal
- ✅ Asigna permisos a la página de gestión

### 2. Primer Login del Usuario admin_anticipos

1. Ir a la página de login del sistema
2. Ingresar:
   - **Usuario**: `admin_anticipos`
   - **Contraseña**: Cualquier contraseña que elijas (ej: `admin123`)
3. El sistema detectará que es el primer login y establecerá esa contraseña como definitiva
4. Serás redirigido a `/gestion-anticipos`

### 3. Verificar Funcionamiento

#### 3.1 Para admin_anticipos:

1. Login con usuario `admin_anticipos`
2. Deberías ver la interfaz de "Gestión de Anticipos"
3. Crear un anticipo de prueba:
   - Fecha de Pago: Hoy
   - Fecha de Evento: Mañana
   - Cliente: "Test Cliente"
   - Local: Seleccionar un local real
   - Importe: 5000
   - Medio de Pago: MercadoPago (opcional)
   - Guardar

#### 3.2 Para cajeros:

1. Login con un cajero del mismo local que usaste en el anticipo
2. Ir a "Carga de datos"
3. Seleccionar:
   - Caja: Cualquiera
   - Fecha: La fecha_evento del anticipo creado
   - Turno: Cualquiera
4. Ir al tab "Anticipos"
5. Deberías ver el anticipo creado con opciones:
   - ✅ "Consumir Anticipo"
   - ❌ "No vino a esta caja"

#### 3.3 Probar Consumo:

1. Click en "Consumir Anticipo"
2. Confirmar
3. El anticipo debe desaparecer de la lista de disponibles
4. Debe aparecer en "Anticipos Consumidos en esta Caja"

---

## 🗂️ Archivos del Sistema

### Backend (app.py)
- **Líneas 136-144**: Mapeo de rol `admin_anticipos`
- **Líneas 2419-2745**: Endpoints de gestión (crear/listar/editar/eliminar)
- **Líneas 2751-3163**: Endpoints de consumo (disponibles/consumir/eliminar_de_caja)
- **Líneas 6867-6872**: Ruta `/gestion-anticipos`
- **Líneas 6997-7004**: Validación para crear usuarios admin_anticipos

### Frontend - Gestión
- **templates/gestion_anticipos.html**: Interfaz completa para admin_anticipos
- **static/js/gestion_anticipos.js**: Lógica de gestión

### Frontend - Consumo (Cajeros)
- **static/js/anticipos_v2.js**: Nueva interfaz para cajeros en "Carga de datos"
- **templates/index.html (línea 962)**: Referencia actualizada a `anticipos_v2.js`

### Base de Datos
Las tablas fueron creadas previamente:
- `anticipos_recibidos`: Anticipos creados
- `anticipos_estados_caja`: Estado por caja individual
- `anticipos_audit`: Auditoría completa

---

## 🔐 Permisos y Niveles

| Rol | Nivel | Puede Crear Anticipos | Puede Consumir | Acceso a Otros Módulos |
|-----|-------|----------------------|----------------|------------------------|
| `cajero` | 1 | ❌ | ✅ | Carga de datos |
| `encargado` | 2 | ❌ | ✅ | Carga de datos, Resumen local |
| `auditor` | 3 | ❌ | ✅ | Todos los locales |
| `jefe_auditor` | 4 | ❌ | ✅ | Todos los locales + Gestión usuarios |
| `admin_anticipos` | 5 | ✅ | ❌ | **SOLO** Gestión de Anticipos |

---

## 🎯 Casos de Uso

### Caso 1: Cliente hace reserva con seña

1. **Recepción del pago** (admin_anticipos):
   - Admin recibe $10,000 por MercadoPago
   - Crea anticipo:
     - Fecha Pago: 2025-12-01
     - Fecha Evento: 2025-12-15
     - Cliente: Juan Pérez
     - Local: Ribs Infanta
     - Importe: 10000
     - Medio Pago: MercadoPago
     - Nº Transacción: MP123456

2. **Día del evento** (cajeros):
   - Fecha: 2025-12-15
   - Todos los cajeros de "Ribs Infanta" ven el anticipo en su tab
   - Cliente llega a Caja 1
   - Cajero de Caja 1 hace click en "Consumir Anticipo"
   - El anticipo desaparece de Caja 2, 3, 4, etc.
   - Se registra que fue consumido en Caja 1

### Caso 2: Cliente no se presenta

- Cajero hace click en "No vino a esta caja"
- El anticipo desaparece solo de ESA caja
- Sigue visible en otras cajas del local
- Si el cliente no se presenta en ninguna caja, el admin_anticipos puede:
  - Editar fecha_evento para otra fecha
  - O eliminarlo globalmente

---

## 🔍 Auditoría

Todas las operaciones quedan registradas en:

1. **Tabla `auditoria`** (general):
   - Quién creó/editó/eliminó cada anticipo
   - Timestamp en zona horaria Argentina
   - IP y user agent

2. **Tabla `anticipos_audit`** (específica):
   - Datos antes/después en JSON
   - Acciones: creado, editado, eliminado_global, consumido, eliminado_de_caja
   - Contexto completo: local, caja, fecha, turno

Para consultar auditoría:
```sql
-- Ver todas las operaciones sobre un anticipo
SELECT * FROM anticipos_audit
WHERE anticipo_id = 123
ORDER BY timestamp_accion DESC;

-- Ver quién consumió anticipos hoy
SELECT
    aa.anticipo_id,
    ar.cliente,
    ar.importe,
    aa.local,
    aa.caja,
    aa.usuario,
    aa.timestamp_accion
FROM anticipos_audit aa
JOIN anticipos_recibidos ar ON ar.id = aa.anticipo_id
WHERE aa.accion = 'consumido'
  AND DATE(aa.timestamp_accion) = CURDATE()
ORDER BY aa.timestamp_accion DESC;
```

---

## 🐛 Troubleshooting

### Problema: Usuario admin_anticipos no puede acceder

**Solución**: Verificar que existe la página en la BD:
```sql
SELECT * FROM pages WHERE slug = 'gestion-anticipos';
```

Si no existe:
```sql
INSERT INTO pages (slug, name) VALUES ('gestion-anticipos', 'Gestión de Anticipos');
```

### Problema: Los anticipos no aparecen en las cajas

**Verificar**:
1. El `local` del anticipo coincide con el local de la caja
2. La `fecha_evento` coincide con la fecha seleccionada
3. El anticipo está en estado `pendiente`
4. No existe registro en `anticipos_estados_caja` para esa caja/fecha

**Query diagnóstica**:
```sql
SELECT
    ar.*,
    aec.caja,
    aec.estado as estado_en_caja
FROM anticipos_recibidos ar
LEFT JOIN anticipos_estados_caja aec ON aec.anticipo_id = ar.id
WHERE ar.local = 'TU_LOCAL'
  AND ar.fecha_evento = 'TU_FECHA';
```

### Problema: Error al crear anticipo

**Verificar rol en BD**:
```sql
SELECT r.name, r.level
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE u.username = 'admin_anticipos';
```

Debe retornar: `admin_anticipos`, nivel `5`

---

## 📞 Soporte

Para consultas o problemas:
1. Revisar logs del servidor en `logs/server_YYYYMMDD.log`
2. Revisar console del navegador (F12)
3. Verificar tabla `anticipos_audit` para ver qué pasó
4. Consultar con el equipo de desarrollo

---

✅ **Sistema listo para usar!**
