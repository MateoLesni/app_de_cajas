# Gestión Centralizada de Remesas No Retiradas

## Resumen

Se implementó una interfaz centralizada para gestionar remesas no retiradas, separando la responsabilidad de **carga de datos** de la **gestión de retiros**.

## Problema que Resuelve

**Antes:**
- Los encargados debían marcar remesas como retiradas desde la caja diaria
- Alto riesgo de olvido al momento de cargar
- Baja visibilidad de remesas pendientes
- Información de retiro incompleta o inconsistente

**Ahora:**
- Las remesas no retiradas se acumulan automáticamente en una vista dedicada
- Los encargados tienen una "bandeja de pendientes" clara con badge contador
- Toda la información de retiro (fecha y nombre) es obligatoria y auditada
- Los auditores pueden ver y corregir datos de retiro de todos los locales

## Características

### ✅ Para Encargados (Nivel 2+)

- **Ver remesas no retiradas** de su local únicamente
- **Marcar como retirada** ingresando:
  - **Fecha de retiro** (obligatoria)
  - **Nombre de quien retira** (obligatorio, mín. 3 caracteres)
- **Badge contador en sidebar** que muestra cantidad de remesas pendientes en tiempo real
- **Filtros** por fecha de caja
- **Alerta visual** cuando hay remesas pendientes

### ✅ Para Auditores (Nivel 3+)

- **Ver remesas no retiradas** de todos los locales
- **Marcar como retirada** (igual que encargados)
- **Filtros avanzados**:
  - Por local
  - Por fecha de caja (desde/hasta)
- **Edición de datos** de retiro (para correcciones)
- Mismo badge contador en sidebar

### ✅ Auditoría Completa

Todas las acciones quedan registradas en `tabla_auditoria`:
- Quién marcó la remesa como retirada
- Cuándo se marcó
- Fecha de retiro ingresada
- Nombre de quien retiró
- Si se editó posteriormente (auditor)

## Acceso a la Interfaz

### Encargados
1. Iniciar sesión con usuario encargado
2. En el sidebar izquierdo, buscar **"Remesas No Retiradas"**
3. Si hay pendientes, verás un badge rojo con el número

### Auditores
1. Iniciar sesión con usuario auditor
2. En el sidebar izquierdo, buscar **"Remesas No Retiradas"**
3. Badge rojo muestra total de remesas pendientes en todos los locales

## Flujo de Uso

### 1. Cargar Remesa No Retirada (desde caja diaria)

```
Encargado carga caja diaria → Marca checkbox "Remesa no retirada"
                            ↓
           Remesa se guarda automáticamente en la base de datos
                            ↓
                   Badge en sidebar se actualiza
```

### 2. Marcar Remesa como Retirada

```
Encargado entra a "Remesas No Retiradas"
              ↓
   Ve lista de remesas pendientes de su local
              ↓
   Click en botón "Marcar Retirada"
              ↓
   Completa formulario:
   - Fecha de retiro (default: hoy)
   - Nombre de quien retira
              ↓
   Click en "Marcar como Retirada"
              ↓
   ✅ Remesa marcada y desaparece de la lista
              ↓
   Badge en sidebar se actualiza (disminuye en 1)
```

### 3. Auditor Corrige Datos de Retiro

```
Auditor entra a "Remesas No Retiradas"
              ↓
   Filtra por local si es necesario
              ↓
   Ve remesa con datos incorrectos
              ↓
   Click en botón "Editar"
              ↓
   Modifica fecha de retiro o nombre
              ↓
   ✅ Cambio queda registrado en auditoría
```

## Archivos Creados/Modificados

### Nuevos Archivos

- ✅ [`app_de_cajas/templates/remesas_no_retiradas.html`](templates/remesas_no_retiradas.html)
  - Interfaz HTML moderna con filtros y modals
  - Diseño responsive con tabla clara
  - Estados de loading, vacío y con datos

- ✅ [`app_de_cajas/static/js/remesas_no_retiradas.js`](static/js/remesas_no_retiradas.js)
  - JavaScript completo para toda la funcionalidad
  - AJAX calls a los endpoints
  - Gestión de modals y formularios
  - Validaciones en frontend

- ✅ [`REMESAS_NO_RETIRADAS_README.md`](REMESAS_NO_RETIRADAS_README.md)
  - Este archivo de documentación

### Archivos Modificados

- ✅ [`app_de_cajas/app.py`](app.py)
  - **Línea 7938-8322**: Agregado 4 nuevos endpoints:
    - `GET /remesas-no-retiradas` - Renderiza la página
    - `GET /api/remesas-no-retiradas/listar` - Lista remesas con filtros
    - `POST /api/remesas-no-retiradas/<id>/marcar-retirada` - Marca como retirada
    - `PUT /api/remesas-no-retiradas/<id>/editar` - Edita datos (solo auditores)
    - `GET /api/remesas-no-retiradas/contador` - Contador para badge

- ✅ [`app_de_cajas/templates/index_encargado.html`](templates/index_encargado.html)
  - **Línea 90-95**: Agregado link "Remesas No Retiradas" con badge contador
  - **Línea 56-76**: Agregado CSS para badge contador con animación pulse
  - **Línea 1118-1136**: Agregado script para cargar contador automáticamente

- ✅ [`app_de_cajas/templates/index_auditor.html`](templates/index_auditor.html)
  - **Línea 124-129**: Agregado link "Remesas No Retiradas" con badge contador
  - **Línea 56-76**: Agregado CSS para badge contador con animación pulse
  - **Línea 1164-1182**: Agregado script para cargar contador automáticamente

## Endpoints API

### `GET /remesas-no-retiradas`
**Acceso:** Encargados (nivel 2+) y auditores (nivel 3+)

**Respuesta:** Renderiza la página HTML

---

### `GET /api/remesas-no-retiradas/listar`
**Acceso:** Encargados (nivel 2+) y auditores (nivel 3+)

**Query params:**
- `local` (opcional, solo auditores): filtrar por local
- `fecha_desde` (opcional): filtrar desde fecha de caja
- `fecha_hasta` (opcional): filtrar hasta fecha de caja

**Respuesta:**
```json
{
  "success": true,
  "remesas": [
    {
      "id": 12345,
      "local": "Ribs Infanta",
      "caja": "Caja 1",
      "turno": "Noche",
      "fecha": "2025-12-10",
      "nro_remesa": "R-001",
      "precinto": "P12345",
      "monto": 45500.00,
      "retirada": 0,
      "retirada_por": null,
      "fecha_retirada": null,
      "usuario": "juan.encargado",
      "ult_mod": "2025-12-10T18:30:00"
    }
  ],
  "user_level": 2
}
```

**Lógica de permisos:**
- **Encargados:** Solo ven remesas de su local (`session['local']`)
- **Auditores:** Ven todas las remesas (pueden filtrar por local)

---

### `POST /api/remesas-no-retiradas/<remesa_id>/marcar-retirada`
**Acceso:** Encargados (nivel 2+) y auditores (nivel 3+)

**Body:**
```json
{
  "fecha_retirada": "2025-12-15",
  "retirada_por": "Juan Pérez"
}
```

**Validaciones:**
- `fecha_retirada` requerida
- `retirada_por` requerida (mín. 3 caracteres)
- Encargados solo pueden marcar remesas de su local
- No se puede marcar una remesa ya retirada

**Respuesta:**
```json
{
  "success": true,
  "msg": "Remesa marcada como retirada correctamente"
}
```

**Auditoría:**
Se registra en `tabla_auditoria`:
```python
{
  "accion": "UPDATE",
  "tabla": "remesas_trns",
  "registro_id": 12345,
  "usuario": "juan.encargado",
  "datos_anteriores": {
    "retirada": "0",
    "retirada_por": null,
    "fecha_retirada": null
  },
  "datos_nuevos": {
    "retirada": 1,
    "retirada_por": "Juan Pérez",
    "fecha_retirada": "2025-12-15"
  },
  "descripcion": "Remesa marcada como retirada - Local: Ribs Infanta, Fecha caja: 2025-12-10, Monto: $45500.0"
}
```

---

### `PUT /api/remesas-no-retiradas/<remesa_id>/editar`
**Acceso:** Solo auditores (nivel 3+)

**Body:**
```json
{
  "fecha_retirada": "2025-12-16",  // opcional
  "retirada_por": "María González"  // opcional
}
```

**Validaciones:**
- Al menos un campo debe ser proporcionado
- Solo auditores tienen acceso

**Respuesta:**
```json
{
  "success": true,
  "msg": "Datos de retiro actualizados correctamente"
}
```

**Auditoría:**
Se registra cada edición con usuario auditor, descripción: "Auditor editó datos de retiro"

---

### `GET /api/remesas-no-retiradas/contador`
**Acceso:** Encargados (nivel 2+) y auditores (nivel 3+)

**Respuesta:**
```json
{
  "success": true,
  "total": 3
}
```

**Lógica:**
- **Encargados:** Cuenta solo remesas de su local
- **Auditores:** Cuenta todas las remesas del sistema

---

## Estructura de Tabla

### `remesas_trns`

Campos relevantes para retiro:

```sql
id INT AUTO_INCREMENT PRIMARY KEY,
local VARCHAR(255),
caja VARCHAR(255),
turno VARCHAR(255),
fecha DATE,
nro_remesa VARCHAR(255),
precinto VARCHAR(255),
monto DECIMAL(15,2),
retirada TINYINT(1) DEFAULT 0,        -- 0 = No retirada, 1 = Retirada
retirada_por VARCHAR(255) NULL,       -- Nombre de quien retira
fecha_retirada DATE NULL,             -- Fecha en que se retiró
usuario VARCHAR(255),                 -- Usuario que cargó la remesa
ult_mod TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

**Query de remesas no retiradas:**
```sql
SELECT * FROM remesas_trns
WHERE retirada = 0 OR retirada = 'No'
ORDER BY fecha DESC, id DESC
```

---

## Flujo de Datos para Cashflow

### Importancia de `fecha_retirada` y `retirada_por`

Estos campos son **críticos** para generar reportes de cashflow precisos porque:

1. **`fecha_retirada`** indica cuándo el dinero salió físicamente del local
   - Permite saber el saldo real disponible en cada fecha
   - Diferencia entre "dinero en remesa" vs "dinero ya retirado"

2. **`retirada_por`** proporciona trazabilidad
   - Auditoría completa de quién manejó el dinero
   - Responsabilidad clara en cada retiro

### Ejemplo de Reporte de Cashflow

```sql
-- Dinero en remesas por fecha de RETIRO (no de caja)
SELECT
  fecha_retirada,
  COUNT(*) as cantidad_remesas,
  SUM(monto) as total_retirado,
  GROUP_CONCAT(retirada_por) as quienes_retiraron
FROM remesas_trns
WHERE retirada = 1
  AND fecha_retirada BETWEEN '2025-12-01' AND '2025-12-31'
GROUP BY fecha_retirada
ORDER BY fecha_retirada DESC;
```

**Resultado:**
```
fecha_retirada | cantidad_remesas | total_retirado | quienes_retiraron
2025-12-15     | 3                | 125,600.00     | Juan Pérez,María González,Pedro López
2025-12-14     | 2                | 89,200.00      | Juan Pérez,María González
2025-12-13     | 5                | 203,400.00     | Juan Pérez,Pedro López,Ana Martínez,...
```

### Solidez y Auditabilidad

✅ **Campos obligatorios:** No se puede marcar sin fecha y nombre
✅ **Validaciones frontend:** Mínimo 3 caracteres en nombre
✅ **Validaciones backend:** Fecha requerida, nombre requerido
✅ **Auditoría completa:** Cada cambio queda registrado en `tabla_auditoria`
✅ **Permisos estrictos:** Encargados solo su local, auditores pueden editar
✅ **Timestamps automáticos:** `ult_mod` se actualiza en cada cambio

---

## Validaciones

### Frontend (JavaScript)

- ✅ Fecha de retiro requerida
- ✅ Nombre de quien retira requerido (mín. 3 caracteres)
- ✅ Confirmación antes de marcar como retirada
- ✅ Solo mostrar locales disponibles según nivel de usuario

### Backend (Python)

- ✅ Usuario debe existir y tener nivel mínimo 2
- ✅ Remesa debe existir
- ✅ Remesa no debe estar ya retirada
- ✅ Encargados solo pueden marcar remesas de su local
- ✅ Fecha y nombre son campos obligatorios
- ✅ Registro completo en auditoría

---

## UI/UX

### Badge Contador

```css
.badge-counter {
  background: #dc2626;  /* Rojo */
  color: white;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 8px;
  animation: pulse 2s infinite;  /* Llama la atención */
}
```

**Comportamiento:**
- Solo aparece si hay remesas pendientes (> 0)
- Se actualiza automáticamente al cargar la página
- Efecto pulse para llamar la atención

### Alerta Visual

**Si hay pendientes:**
```
⚠️  3 Remesas Pendientes
    Tenés 3 remesas pendientes de marcar como retirada
```

**Si NO hay pendientes:**
```
✅  ¡Todo al día!
    No hay remesas pendientes de retiro
```

### Estados de la Tabla

1. **Loading:** Spinner con mensaje "Cargando remesas..."
2. **Empty:** Emoji 🎉 + mensaje positivo "¡Excelente trabajo!"
3. **Con datos:** Tabla completa con botones de acción

---

## Troubleshooting

### El badge no aparece en el sidebar

**Causa:** El endpoint `/api/remesas-no-retiradas/contador` no está retornando datos

**Solución:**
1. Abrir consola del navegador (F12)
2. Buscar errores en Network tab
3. Verificar que el usuario tiene nivel >= 2
4. Verificar que hay remesas con `retirada = 0` en la base de datos

---

### Error: "No tenés permisos para modificar remesas de otro local"

**Causa:** Un encargado está intentando marcar una remesa de un local diferente al suyo

**Solución:**
- Verificar que el usuario esté marcando remesas de su propio local
- Si es un auditor, verificar que tiene nivel 3+

---

### La fecha de retiro no se está guardando

**Causa:** El campo está vacío o mal formateado

**Solución:**
1. Verificar que el campo `<input type="date">` tiene un valor
2. Verificar formato YYYY-MM-DD
3. Revisar logs del backend para ver el valor recibido

---

### Los datos de retiro son inconsistentes

**Causa:** Se marcaron remesas antes de implementar los campos obligatorios

**Solución:**
- Los auditores pueden editar datos de retiro usando el botón "Editar"
- Completar `fecha_retirada` y `retirada_por` manualmente para remesas antiguas

---

## Migración de Datos Antiguos

Si hay remesas marcadas como retiradas (`retirada = 1`) pero sin `fecha_retirada` o `retirada_por`:

```sql
-- Ver remesas retiradas sin datos completos
SELECT id, local, fecha, monto, retirada, retirada_por, fecha_retirada
FROM remesas_trns
WHERE retirada = 1
  AND (retirada_por IS NULL OR fecha_retirada IS NULL)
ORDER BY fecha DESC;

-- Actualizar con valores por defecto (ajustar según necesidad)
UPDATE remesas_trns
SET
  fecha_retirada = DATE_ADD(fecha, INTERVAL 1 DAY),  -- Siguiente día de la caja
  retirada_por = 'MIGRACIÓN AUTOMÁTICA'
WHERE retirada = 1
  AND (retirada_por IS NULL OR fecha_retirada IS NULL);
```

---

## Próximos Pasos / Mejoras Futuras

1. **Notificaciones automáticas**: Email/SMS cuando una remesa lleva X días sin retirar
2. **Reporte de cashflow integrado**: Vista que combine fecha de caja vs fecha de retiro
3. **Exportación a Excel**: Descargar remesas no retiradas en formato Excel
4. **Gráficos**: Visualización de tendencias de retiros por local/fecha
5. **Historial de remesa**: Ver todo el ciclo de vida de una remesa (creada → retirada → editada)

---

## Conclusión

Esta implementación centraliza y fortalece la gestión de remesas no retiradas, proporcionando:

✅ **Claridad:** Los encargados saben exactamente qué deben hacer
✅ **Visibilidad:** Badge contador muestra trabajo pendiente en tiempo real
✅ **Solidez:** Campos obligatorios y validaciones estrictas
✅ **Auditabilidad:** Registro completo de todas las acciones
✅ **Escalabilidad:** Diseño preparado para reportes de cashflow avanzados

---

**Autor:** Claude Code
**Fecha:** 2025-12-15
**Versión:** 1.0
