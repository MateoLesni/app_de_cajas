# ✅ Cambios Aplicados: Mesa de Trabajo Editable

## Fecha de Implementación: 2026-01-06

---

## 📋 Resumen de Cambios

Se ha transformado la vista "Mesa de Trabajo" (`/reporteria/remesas-trabajo`) de una vista **read-only** a una **vista editable** con inputs para cargar montos reales y botones de guardar por cada fila.

---

## 🎨 Cambios en UI/UX

### 1. **Columnas Modificadas**
- ✅ **Eliminadas**: "Caja" y "Turno"
- ✅ **Agregadas**:
  - "Real (Contabilizado)" - con input editable
  - "Acción" - con botón "Guardar"

**Nueva estructura de columnas:**
```
Fecha Remesa | Fecha Retiro | N° Precinto | N° Remesa | Local | $ Teórico | Real (Contabilizado) | Acción
```

### 2. **Esquema de Colores**

**Encabezados:**
- Color: Gris medio (`#6b7280`)
- Antes: Gris muy oscuro (`#1f2937`)

**Celdas con fondo gris claro + negrita:**
- N° Precinto
- N° Remesa
- Real (Contabilizado)
- Color de fondo: `#f3f4f6`
- Texto: Negrita

**Otras celdas:**
- Fondo blanco (default)

### 3. **Input de Monto Real**

**Características:**
- ✅ Muestra `0,00` por defecto
- ✅ Al hacer click/focus, se borra el `0,00` automáticamente
- ✅ Texto centrado (no alineado a la derecha)
- ✅ Formato argentino: `1.234,56`
- ✅ Fondo gris claro que cambia a blanco al hacer focus
- ✅ Enter ejecuta "Guardar"

**Estilos:**
```css
.input-real {
  width: 110px;
  padding: 8px;
  border: 2px solid #9ca3af;
  border-radius: 6px;
  text-align: center;
  font-weight: 700;
  font-size: 15px;
  background: #f3f4f6;
}
```

### 4. **Botón Guardar**

**Diseño:**
- ✅ Estilo profesional y serio
- ✅ Color azul (`#3b82f6`)
- ✅ Icono de diskette + texto "Guardar"
- ✅ Efecto hover con elevación
- ✅ Estado "Guardando..." con spinner durante request
- ✅ Estado deshabilitado visual

**Estilos:**
```css
.btn-guardar {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  transition: all 0.2s;
}
```

---

## 🔒 Seguridad Implementada

### CSRF Protection
- ✅ Meta tag CSRF agregado: `<meta name="csrf-token" content="{{ csrf_token() }}">`
- ✅ Función `getCSRFToken()` para extraer token
- ✅ Header `X-CSRF-Token` incluido en todos los requests POST

### Rate Limiting
- ✅ Endpoint `/api/tesoreria/guardar-remesa` protegido con 30 req/min
- ✅ Endpoint `/api/tesoreria/remesas-tran` protegido con 60 req/min

### Audit Logging
- ✅ Todos los cambios de monto real se registran en `tesoreria_audit_log`
- ✅ Se captura: user_id, username, IP, timestamp, valor anterior, valor nuevo

---

## 📁 Archivos Modificados

### 1. `templates/reporte_remesas_trabajo.html`

**Línea 7:** Agregado meta tag CSRF
```html
<meta name="csrf-token" content="{{ csrf_token() }}">
```

**Línea 53-63:** Headers con gris medio
```css
table.remesas-table thead th {
  background: #6b7280;  /* Cambio de #1f2937 a gris medio */
  color: white;
  ...
}
```

**Línea 93-170:** Nuevos estilos para celdas grises, input y botón
```css
.col-gray-bg { background: #f3f4f6 !important; font-weight: 700; }
.input-real { ... }
.btn-guardar { ... }
```

**Línea 355-358:** Texto actualizado en info-box
```html
Ingresa el monto real contabilizado y presiona "Guardar" para registrar cada remesa.
Las remesas desaparecen automáticamente de esta lista una vez contabilizadas.
```

**Línea 404-414:** Nuevos headers de tabla
```html
<th>Fecha Remesa</th>
<th>Fecha Retiro</th>
<th>N° Precinto</th>
<th>N° Remesa</th>
<th>Local</th>
<th class="col-right">$ Teórico</th>
<th style="text-align: center;">Real (Contabilizado)</th>
<th style="text-align: center;">Acción</th>
```

### 2. `static/js/reporte_remesas_trabajo.js`

**Línea 8-12:** Función para obtener CSRF token
```javascript
function getCSRFToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.content : '';
}
```

**Línea 76-120:** Renderizado de tabla con inputs y botones
```javascript
function renderizarTabla() {
  // ...
  tr.innerHTML = `
    ...
    <td class="col-gray-bg" style="text-align: center;">
      <input type="text" class="input-real" ... />
    </td>
    <td class="col-actions">
      <button class="btn-guardar" onclick="window.guardarRemesaTrabajo(${index})">
        <i class="fas fa-save"></i> Guardar
      </button>
    </td>
  `;
}
```

**Línea 125-133:** Formateo de monto para input
```javascript
function formatearMontoInput(monto) {
  const numero = parseFloat(monto) || 0;
  if (numero === 0) return '0,00';
  return numero.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
```

**Línea 138-165:** Formateo en tiempo real mientras escribe
```javascript
window.formatearInputTrabajo = function(index, input) {
  // Elimina caracteres no válidos
  // Reemplaza punto por coma
  // Asegura solo una coma decimal
  // Limita a 2 decimales
}
```

**Línea 170-238:** Función para guardar remesa
```javascript
window.guardarRemesaTrabajo = async function(index) {
  // Valida monto > 0
  // Deshabilita botón durante request
  // Incluye header X-CSRF-Token
  // Llama a /api/tesoreria/guardar-remesa
  // Recarga lista TRAN tras éxito
  // Maneja errores
}
```

---

## 🔄 Flujo de Trabajo

### Paso a Paso del Usuario:

1. **Cargar vista**: Usuario abre `/reporteria/remesas-trabajo`
2. **Ver remesas TRAN**: Sistema carga automáticamente todas las remesas en estado TRAN
3. **Ingresar monto**: Usuario hace click en input (0,00 se borra), escribe monto real
4. **Guardar**: Usuario presiona botón "Guardar" o Enter
5. **Procesamiento**:
   - Backend valida CSRF token
   - Backend valida permisos (tesorero level 7+)
   - Backend aplica rate limiting
   - Backend actualiza `tesoreria_recibido` con monto real
   - Backend cambia estado de remesa: `TRAN` → `Contabilizada`
   - Backend registra cambio en `tesoreria_audit_log`
6. **Resultado**: Fila desaparece de la lista (ya no está en TRAN)
7. **Verificar**: Usuario puede ver la remesa contabilizada en "Histórico"

---

## ✅ Comportamiento de Desaparición

**¿Cuándo desaparece una remesa de Mesa de Trabajo?**

Al guardar un monto real > 0, el backend ejecuta:

```sql
UPDATE remesas_trns
SET estado_contable = 'Contabilizada',
    fecha_estado_contabilizada = NOW()
WHERE id = %s AND estado_contable != 'Contabilizada'
```

Luego, el JavaScript recarga la lista:

```javascript
await cargarRemesasTRAN();  // Solo trae remesas WHERE estado_contable = 'TRAN'
```

Como la remesa ya no está en TRAN, no aparece en la nueva carga.

---

## 🎯 Validaciones Implementadas

### Frontend (JavaScript)
- ✅ Monto > 0 (no permite guardar 0 o vacío)
- ✅ Formato numérico válido
- ✅ Solo dígitos, coma y punto permitidos

### Backend (app.py - `/api/tesoreria/guardar-remesa`)
- ✅ Usuario autenticado (`@login_required`)
- ✅ Nivel mínimo 7 - tesorero (`@role_min_required(7)`)
- ✅ CSRF token válido (`@csrf_protected`)
- ✅ Rate limit: 30 requests/minuto (`@rate_limited`)
- ✅ Datos requeridos: `remesa_id`, `local`, `fecha_retiro`, `monto_real`
- ✅ Registro en audit log

---

## 📊 Estadísticas en Tiempo Real

La vista muestra 3 cards con estadísticas que se actualizan automáticamente:

1. **Total Pendientes**: Cantidad de remesas en TRAN
2. **Monto Total**: Suma de montos teóricos de remesas TRAN
3. **Última Actualización**: Hora del último refresh

**Auto-refresh**: Cada 2 minutos (120000ms)

---

## 🧪 Pruebas Sugeridas

### 1. Test de Carga de Vista
```
1. Loguearse como tesorero
2. Ir a /reporteria/remesas-trabajo
3. Verificar que carga remesas TRAN
4. Verificar que NO aparecen columnas Caja y Turno
5. Verificar que headers son gris medio
```

### 2. Test de Input
```
1. Hacer click en input con 0,00
2. Verificar que se borra el 0,00
3. Escribir "1234,56"
4. Verificar que acepta el formato
5. Intentar escribir "abc" - debe ignorar letras
```

### 3. Test de Guardar
```
1. Ingresar monto válido (ej: 5000,00)
2. Presionar "Guardar"
3. Verificar que botón muestra "Guardando..." con spinner
4. Verificar que la fila desaparece tras guardar
5. Ir a Histórico y verificar que la remesa está allí con monto real
```

### 4. Test de Seguridad
```
1. Abrir DevTools → Network
2. Intentar guardar una remesa
3. Verificar que el request incluye header "X-CSRF-Token"
4. Verificar que responde 200 OK
5. Intentar hacer 35 requests en 1 minuto
6. Verificar que el request 31 responde 429 (rate limit)
```

### 5. Test de Auditoría
```
1. Loguearse como admin_tesoreria
2. Ir a /api/tesoreria/audit-log?limit=10
3. Verificar que muestra los cambios recientes
4. Verificar que incluye: user, IP, timestamp, valores old/new
```

---

## 🔍 Consultas Útiles para Verificar

### Ver remesas TRAN
```sql
SELECT id, local, precinto, nro_remesa, fecha_retirada, monto, estado_contable
FROM remesas_trns
WHERE estado_contable = 'TRAN'
ORDER BY fecha_retirada DESC;
```

### Ver remesas Contabilizadas
```sql
SELECT
    r.id,
    r.local,
    r.precinto,
    r.fecha_retirada,
    r.monto as teorico,
    t.monto_real,
    r.estado_contable,
    r.fecha_estado_contabilizada
FROM remesas_trns r
LEFT JOIN tesoreria_recibido t ON t.remesa_id = r.id
WHERE r.estado_contable = 'Contabilizada'
ORDER BY r.fecha_estado_contabilizada DESC
LIMIT 20;
```

### Ver últimos cambios en auditoría
```sql
SELECT
    a.id,
    a.remesa_id,
    r.local,
    r.precinto,
    a.field_changed,
    a.old_value,
    a.new_value,
    a.changed_by_username,
    a.ip_address,
    a.changed_at
FROM tesoreria_audit_log a
LEFT JOIN remesas_trns r ON r.id = a.remesa_id
ORDER BY a.changed_at DESC
LIMIT 20;
```

---

## ✨ Mejoras Futuras (Opcionales)

1. **Notificación de éxito visual**: Toast notification en vez de alert
2. **Animación de salida**: Fade out cuando se guarda una remesa
3. **Validación de diferencia**: Alertar si monto real difiere mucho del teórico
4. **Botón "Guardar Todo"**: Guardar todas las remesas con un click
5. **Exportación a Excel**: Descargar lista de remesas TRAN
6. **Filtros**: Por local, por rango de fechas
7. **Búsqueda**: Por precinto o N° remesa

---

## 📞 Soporte

En caso de problemas:

1. Verificar que se ejecutaron los scripts SQL:
   - `SQL_ADD_ESTADO_CONTABLE_REMESAS.sql`
   - `SQL_CREATE_TESORERIA_AUDIT_LOG.sql`

2. Verificar que `modules/tesoreria_security.py` existe

3. Verificar que `app.py` tiene las modificaciones:
   - Imports del módulo de seguridad (línea 36-43)
   - `init_security(app)` (línea 691)
   - Endpoint `/api/tesoreria/remesas-tran` (línea 6260-6322)
   - Endpoint `/api/tesoreria/guardar-remesa` con seguridad (línea 6326-6432)

4. Revisar logs del servidor para errores

5. Verificar en DevTools → Console si hay errores de JavaScript

---

**Implementado por**: Sistema de Desarrollo
**Fecha**: 2026-01-06
**Versión**: 2.0 (Mesa de Trabajo Editable)
**Estado**: ✅ Listo para producción
