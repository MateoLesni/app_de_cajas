# 🔍 Sistema de Filtros - Reporte de Remesas para Tesorería

## 📋 Descripción General

El reporte de Remesas para Tesorería ahora incluye un sistema de filtros avanzado que permite a los usuarios de tesorería encontrar rápidamente la información que necesitan sin recargar datos desde el servidor.

---

## ✨ Funcionalidades Implementadas

### 1. **Filtro por Local**
- **Ubicación:** Primera columna de filtros
- **Tipo:** Dropdown dinámico
- **Comportamiento:**
  - Se llena automáticamente con los locales disponibles en el reporte cargado
  - Muestra "Todos los locales" por defecto
  - Al seleccionar un local, muestra solo las filas de ese local
  - Aplica filtro instantáneamente sin recargar desde API

### 2. **Filtro por Estado**
- **Ubicación:** Segunda columna de filtros
- **Tipo:** Dropdown estático
- **Opciones:**
  - 📦 En Tránsito (`en_transito`)
  - ✅ Recibido (`recibido`)
  - ⚠️ Con Diferencia (`con_diferencia`)
  - ✔️ Auditado (`auditado`)
- **Comportamiento:**
  - Filtra remesas según su estado actual
  - Si una remesa no tiene monto real registrado, siempre se considera "En Tránsito"
  - Aplica filtro instantáneamente

### 3. **Filtro "Solo con Diferencias"**
- **Ubicación:** Tercera columna (checkbox)
- **Tipo:** Checkbox
- **Comportamiento:**
  - Cuando está activado, muestra SOLO las remesas donde `teorico ≠ real`
  - Útil para identificar rápidamente problemas o discrepancias
  - Se combina con otros filtros (AND logic)

### 4. **Botón "Limpiar Filtros"**
- **Ubicación:** Junto al botón "Actualizar"
- **Comportamiento:**
  - Resetea todos los filtros a sus valores por defecto
  - Local → "Todos los locales"
  - Estado → "Todos los estados"
  - Solo con diferencias → Desmarcado
  - Re-aplica filtros automáticamente (muestra todos los datos)

### 5. **Contador de Resultados**
- **Ubicación:** Arriba de la tabla, debajo de "Empty State"
- **Comportamiento:**
  - Muestra el número de filas visibles después de aplicar filtros
  - Formato normal: "Mostrando **X** remesas"
  - Formato con filtros activos: "Mostrando **X** de Y remesas (filtros activos)"
  - Se actualiza automáticamente al cambiar filtros

---

## 🚀 Cómo Funciona

### Arquitectura de Filtrado

```javascript
// Estructura de datos
let reporteDataCompleto = [];  // Datos completos sin filtrar (cargados desde API)
let reporteData = [];           // Datos filtrados (se renderiza en tabla)
```

### Flujo de Trabajo

1. **Carga Inicial** (`cargarReporte()`):
   ```
   Usuario hace clic en "Actualizar"
   → Fetch desde /api/reportes/remesas-matriz
   → procesarYRenderizar(data)
   → Guarda en reporteDataCompleto
   → aplicarFiltros() (sin filtros = muestra todo)
   ```

2. **Aplicar Filtros** (`aplicarFiltros()`):
   ```
   Usuario cambia un filtro (local, estado, checkbox)
   → Lee valores de los 3 filtros
   → Filtra reporteDataCompleto (sin tocar servidor)
   → Guarda resultado en reporteData
   → renderizarTabla()
   → actualizarContador()
   ```

3. **Limpiar Filtros** (`limpiarFiltros()`):
   ```
   Usuario hace clic en "Limpiar Filtros"
   → Resetea valores de inputs
   → Llama a aplicarFiltros()
   → Muestra todos los datos
   ```

### Lógica de Filtrado

```javascript
reporteData = reporteDataCompleto.filter(fila => {
  // Filtro de local
  if (filtroLocal && fila.local !== filtroLocal) {
    return false;
  }

  // Filtro de estado
  if (filtroEstado) {
    const estadoActual = fila.real > 0 ? fila.estado : 'en_transito';
    if (estadoActual !== filtroEstado) {
      return false;
    }
  }

  // Filtro de diferencias
  if (soloDiferencias && fila.dif === 0) {
    return false;
  }

  return true; // Pasa todos los filtros
});
```

---

## 🎨 Interfaz de Usuario

### HTML Estructura

```html
<div class="rep-filtros">
  <!-- Fechas (sin cambios) -->
  <input type="date" id="fechaDesde">
  <input type="date" id="fechaHasta">

  <!-- Filtro de Local -->
  <select id="filtroLocal" onchange="aplicarFiltros()">
    <option value="">Todos los locales</option>
    <!-- Se llena dinámicamente -->
  </select>

  <!-- Filtro de Estado -->
  <select id="filtroEstado" onchange="aplicarFiltros()">
    <option value="">Todos los estados</option>
    <option value="en_transito">📦 En Tránsito</option>
    <option value="recibido">✅ Recibido</option>
    <option value="con_diferencia">⚠️ Con Diferencia</option>
    <option value="auditado">✔️ Auditado</option>
  </select>

  <!-- Checkbox de Diferencias -->
  <label>
    <input type="checkbox" id="filtroDiferencias" onchange="aplicarFiltros()">
    Solo con diferencias
  </label>

  <!-- Botones -->
  <button onclick="limpiarFiltros()">Limpiar Filtros</button>
  <button onclick="cargarReporte()">Actualizar</button>
</div>

<!-- Contador de Resultados -->
<div id="contadorResultados">
  Mostrando <strong id="numResultados">0</strong> remesas
</div>
```

### CSS Estilos

```css
.contador-resultados {
  padding: 12px 16px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
}

.contador-resultados strong {
  color: #1e88e5;
  font-weight: 700;
}

.btn-secondary {
  background: #6b7280;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}
```

---

## 💡 Casos de Uso

### Caso 1: Ver solo remesas pendientes de un local específico
1. Seleccionar local en "Filtro de Local"
2. Seleccionar "📦 En Tránsito" en "Estado"
3. Ver solo las remesas de ese local que aún no tienen monto real registrado

### Caso 2: Identificar discrepancias
1. Marcar checkbox "Solo con diferencias"
2. Ver todas las remesas donde `teorico ≠ real`
3. Expandir filas para ver detalles de cada remesa con diferencia

### Caso 3: Auditoría de remesas recibidas con diferencias
1. Seleccionar "⚠️ Con Diferencia" en "Estado"
2. Marcar "Solo con diferencias" (redundante pero explícito)
3. Ver todas las remesas que fueron contabilizadas pero tienen diferencias

### Caso 4: Ver todo después de filtrar
1. Hacer clic en "Limpiar Filtros"
2. Todos los filtros se resetean
3. Tabla muestra todas las remesas cargadas

---

## 🔧 Ventajas del Sistema

### Performance
- ✅ **Sin llamadas al servidor**: Los filtros trabajan con datos ya cargados en memoria
- ✅ **Instantáneo**: Cambios se aplican sin delay
- ✅ **Eficiente**: No recarga la página completa

### Usabilidad
- ✅ **Intuitivo**: Filtros se actualizan automáticamente al cambiar valores
- ✅ **Visual**: Contador muestra si hay filtros activos
- ✅ **Flexible**: Combina múltiples filtros (AND logic)

### Mantenibilidad
- ✅ **Modular**: Funciones separadas y bien nombradas
- ✅ **Escalable**: Fácil agregar nuevos filtros
- ✅ **Documentado**: Código con comentarios claros

---

## 📊 Datos Técnicos

### Funciones JavaScript Agregadas

| Función | Responsabilidad | Parámetros | Retorno |
|---------|----------------|-----------|---------|
| `aplicarFiltros()` | Filtra `reporteDataCompleto` según valores de inputs | Ninguno | Void |
| `limpiarFiltros()` | Resetea todos los inputs de filtro | Ninguno | Void |
| `actualizarContador()` | Actualiza el texto del contador de resultados | Ninguno | Void |

### Variables Globales Modificadas

- **`reporteDataCompleto`**: Nueva variable que almacena todos los datos sin filtrar
- **`reporteData`**: Ahora contiene solo los datos filtrados

### Eventos Agregados

- `onchange="aplicarFiltros()"` en:
  - `#filtroLocal`
  - `#filtroEstado`
  - `#filtroDiferencias`
- `onclick="limpiarFiltros()"` en botón "Limpiar Filtros"

---

## 🐛 Consideraciones y Edge Cases

### 1. Estado "en_transito" Automático
Si una fila NO tiene `monto_real` registrado (o `real === 0`), el filtro de estado siempre la considera como "en_transito", independientemente del valor en `fila.estado`.

```javascript
const estadoActual = fila.real > 0 ? fila.estado : 'en_transito';
```

### 2. Filtros Combinados (AND Logic)
Todos los filtros se aplican con lógica AND:
- Local = "CABALLITO" **Y** Estado = "recibido" **Y** Solo diferencias = true

### 3. Empty State
Si después de filtrar no quedan filas:
- Se muestra el "Empty State": "No hay remesas retiradas en el rango de fechas seleccionado"
- Se oculta la tabla
- Se oculta el contador

### 4. Actualización de Datos
Al hacer clic en "Actualizar":
- Se recarga desde API (nueva llamada HTTP)
- Se reemplazan `reporteDataCompleto` y `reporteData`
- Los filtros actuales se mantienen y se re-aplican automáticamente

---

## 🎯 Mejoras Futuras (Opcionales)

### 1. Búsqueda por Texto
- Agregar input de texto para buscar por número de remesa o precinto
- Filtrar en tiempo real mientras el usuario escribe

### 2. Filtro por Rango de Montos
- Agregar inputs de "monto mínimo" y "monto máximo"
- Filtrar remesas según su `teorico` o `real`

### 3. Exportar Resultados Filtrados
- Botón para descargar solo las filas visibles (post-filtrado)
- Formatos: Excel, CSV, PDF

### 4. Guardar Preferencias de Filtros
- Recordar filtros seleccionados en localStorage
- Al recargar la página, aplicar los mismos filtros

### 5. Filtros Avanzados (Modal)
- Botón "Filtros Avanzados" que abre un modal
- Combinar filtros con OR logic
- Filtros por fecha de retiro específica

---

## 📝 Ejemplo de Flujo Completo

```
Usuario ingresa a /reporteria/remesas-tesoreria
→ Fechas por defecto: últimos 7 días
→ Clic en "Actualizar"
→ API retorna 50 remesas de 10 locales

Usuario selecciona "CABALLITO" en filtro Local
→ aplicarFiltros() ejecuta
→ Filtra reporteDataCompleto
→ Ahora muestra solo 8 remesas (las de CABALLITO)
→ Contador: "Mostrando 8 de 50 remesas (filtros activos)"

Usuario marca "Solo con diferencias"
→ aplicarFiltros() ejecuta
→ De las 8 de CABALLITO, solo 2 tienen diferencias
→ Contador: "Mostrando 2 de 50 remesas (filtros activos)"

Usuario hace clic en "Limpiar Filtros"
→ limpiarFiltros() ejecuta
→ Local → "Todos los locales"
→ Solo diferencias → false
→ aplicarFiltros() ejecuta
→ Muestra las 50 remesas originales
→ Contador: "Mostrando 50 remesas"
```

---

## 🔗 Archivos Relacionados

### Frontend
- [templates/reporte_remesas_tesoreria.html](templates/reporte_remesas_tesoreria.html) - HTML con UI de filtros
- [static/js/reporte_remesas_tesoreria.js](static/js/reporte_remesas_tesoreria.js) - Lógica de filtrado

### Backend
- [app.py](app.py) - Endpoints `/api/reportes/remesas-matriz`
- No requiere cambios backend (filtros son client-side)

### Documentación
- [FLUJO_REMESAS_ESTADOS.md](FLUJO_REMESAS_ESTADOS.md) - Estados de remesas
- [IMPLEMENTACION_COMPLETA_MATRIZ.md](IMPLEMENTACION_COMPLETA_MATRIZ.md) - Estructura de datos de la matriz
- [RESUMEN_CREAR_TESORERIA.md](RESUMEN_CREAR_TESORERIA.md) - Creación de usuarios de tesorería

---

## ✅ Checklist de Implementación

- [x] Agregar select de filtro de local
- [x] Agregar select de filtro de estado
- [x] Agregar checkbox de "Solo con diferencias"
- [x] Implementar función `aplicarFiltros()`
- [x] Implementar función `limpiarFiltros()`
- [x] Implementar función `actualizarContador()`
- [x] Agregar contador de resultados en HTML
- [x] Agregar botón "Limpiar Filtros"
- [x] Conectar eventos `onchange` a filtros
- [x] Separar datos completos (`reporteDataCompleto`) de filtrados (`reporteData`)
- [x] Mostrar indicador "(filtros activos)" cuando hay filtros aplicados
- [x] Ocultar contador cuando no hay resultados
- [x] Incluir Font Awesome CDN para íconos
- [x] Commit y push a repositorio

---

## 📞 Soporte

Si tienes dudas sobre cómo usar los filtros o necesitas agregar nuevas funcionalidades, consulta este documento o revisa el código en los archivos mencionados.

**Última actualización:** 24 de Diciembre de 2024
