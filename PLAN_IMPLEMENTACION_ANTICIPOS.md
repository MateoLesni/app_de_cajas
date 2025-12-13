# Plan de Implementación: Mejoras en Anticipos

## ✅ COMPLETADO

### 1. Migración de Base de Datos
- ✅ Agregado campo `divisa` (VARCHAR(10), default='ARS')
- ✅ Agregado campo `tipo_cambio_fecha` (DATE, NOT NULL)
- ✅ Creada tabla `tipos_cambio` para registro histórico
- ✅ Migración ejecutada exitosamente (10 anticipos actualizados)

## 🔄 EN PROGRESO

### 2. Backend - Cambios en app.py

#### 2.1 Endpoint `/api/anticipos_recibidos/crear` (línea 2276-2368)
**Cambios necesarios:**
- Agregar parámetro `divisa` (default='ARS')
- Agregar parámetro `tipo_cambio_fecha` (default=fecha_pago)
- Validar divisas permitidas: ARS, USD, EUR, BRL, CLP, UYU
- Actualizar INSERT para incluir `divisa` y `tipo_cambio_fecha`
- Vincular adjunto si existe (`adjunto_gcs_path`)
- Actualizar auditoría con nueva info

#### 2.2 Endpoint `/api/anticipos_recibidos/listar` (línea 2371+)
**Cambios necesarios:**
- Agregar `divisa`, `tipo_cambio_fecha`, `created_by` en SELECT
- Incluir estos campos en el JSON de respuesta

#### 2.3 Endpoint `/api/anticipos_recibidos/editar/{id}` (buscar línea)
**Cambios necesarios:**
- Permitir editar `divisa` y `tipo_cambio_fecha` (solo si estado=pendiente)
- Actualizar auditoría con cambios

#### 2.4 Endpoint `/api/anticipos/disponibles` (para vista de caja)
**Cambios necesarios:**
- Agregar `divisa`, `created_by` en SELECT
- Agregar info de adjunto si existe:
```sql
LEFT JOIN (
    SELECT entity_id, gcs_path, original_name, mime
    FROM imagenes_adjuntos
    WHERE entity_type = 'anticipo_recibido'
      AND estado = 'active'
    GROUP BY entity_id
) adj ON adj.entity_id = ar.id
```

#### 2.5 Endpoint `/api/anticipos/consumidos_en_caja`
**Cambios necesarios:**
- Agregar `divisa`, `created_by` en SELECT
- Incluir info de adjunto

### 3. Frontend - Modal de Anticipos (gestion_anticipos.js)

#### 3.1 HTML Template (templates/gestion_anticipos.html)
**Agregar al formulario:**
```html
<!-- Selector de divisa -->
<div class="form-group">
    <label for="divisa">Divisa *</label>
    <select id="divisa" required>
        <option value="ARS" selected>ARS - Peso Argentino</option>
        <option value="USD">USD - Dólar</option>
        <option value="EUR">EUR - Euro</option>
        <option value="BRL">BRL - Real</option>
        <option value="CLP">CLP - Peso Chileno</option>
        <option value="UYU">UYU - Peso Uruguayo</option>
    </select>
</div>

<!-- Upload de adjunto -->
<div class="form-group">
    <label for="adjunto">Adjunto (imagen/PDF) *</label>
    <input type="file" id="adjunto" accept="image/*,application/pdf" required>
    <small class="form-text">Comprobante del anticipo (requerido)</small>
</div>

<!-- Preview del adjunto -->
<div id="adjuntoPreview" style="display:none;">
    <img id="adjuntoImg" style="max-width:200px; max-height:200px;">
</div>
```

#### 3.2 JavaScript (gestion_anticipos.js)
**Función `guardarAnticipo`:**
1. Primero subir adjunto usando `/files/upload`
2. Obtener `gcs_path` del adjunto
3. Enviar anticipo con `divisa` y `adjunto_gcs_path`

```javascript
async function guardarAnticipo(event) {
    event.preventDefault();

    const adjuntoFile = $('#adjunto').files[0];
    if (!adjuntoFile) {
        alert('⚠️  Debés subir un comprobante del anticipo');
        return;
    }

    // 1. Subir adjunto
    const formData = new FormData();
    formData.append('files[]', adjuntoFile);
    formData.append('tab', 'anticipos');
    formData.append('local', $('#local').value);
    formData.append('caja', 'admin');
    formData.append('turno', 'dia');
    formData.append('fecha', $('#fechaPago').value);
    formData.append('entity_type', 'anticipo_recibido');
    formData.append('entity_id', '0'); // temporal

    const uploadRes = await fetch('/files/upload', {
        method: 'POST',
        body: formData
    });

    const uploadData = await uploadRes.json();
    if (!uploadData.success) {
        alert('❌ Error subiendo adjunto: ' + uploadData.msg);
        return;
    }

    const adjuntoPath = uploadData.items[0].path;

    // 2. Crear anticipo
    const data = {
        fecha_pago: $('#fechaPago').value,
        fecha_evento: $('#fechaEvento').value,
        cliente: $('#cliente').value,
        local: $('#local').value,
        importe: parseFloat($('#importe').value),
        divisa: $('#divisa').value, // NUEVO
        medio_pago: $('#medioPago').value.trim() || null,
        numero_transaccion: $('#numeroTransaccion').value.trim() || null,
        observaciones: $('#observaciones').value.trim() || null,
        adjunto_gcs_path: adjuntoPath // NUEVO
    };

    // ... resto del código
}
```

#### 3.3 Tabla de Anticipos
**Agregar columnas:**
- Divisa
- Usuario que lo cargó
- Adjunto (ícono/botón para ver)

```javascript
return `
    <tr>
        <td>${formatDate(a.fecha_pago)}</td>
        <td>${formatDate(a.fecha_evento)}</td>
        <td>${a.cliente}</td>
        <td>${a.local}</td>
        <td style="text-align:right;">
            <strong>${a.divisa}</strong> ${money(a.importe)}
        </td>
        <td>${a.medio_pago || '-'}</td>
        <td>${a.created_by || '-'}</td>
        <td><span class="badge ${badgeClass}">${estadoText}</span></td>
        <td>
            ${a.tiene_adjunto ? `<button class="btn-view" onclick="verAdjunto(${a.id})">📎</button>` : ''}
            ${puedeEditar ? `<button class="btn-edit" onclick="editarAnticipo(${a.id})">✏️</button>` : ''}
            ${puedeEliminar ? `<button class="btn-delete" onclick="eliminarAnticipo(${a.id}, '${a.cliente}')">🗑️</button>` : ''}
            <button class="btn-edit" onclick="verDetalles(${a.id})">👁️</button>
        </td>
    </tr>
`;
```

### 4. Frontend - Vista de Caja (anticipos_v2.js)

#### 4.1 Render de Anticipos Disponibles
**Mostrar:**
- Divisa junto al importe
- Usuario que lo cargó
- Botón/ícono para ver adjunto (opcional pero recomendado)

```javascript
htmlDisponibles += `
    <div class="anticipo-card">
        <div class="anticipo-header">
            <div class="anticipo-info">
                <strong class="anticipo-cliente">${a.cliente}</strong>
                <div class="anticipo-detail">Cargado por: ${a.created_by || 'N/D'}</div>
                <div class="anticipo-detail">Fecha de pago: ${formatDate(a.fecha_pago)}</div>
                ${a.medio_pago ? `<div class="anticipo-detail">Medio de pago: ${a.medio_pago}</div>` : ''}
                ${a.numero_transaccion ? `<div class="anticipo-detail">Nº transacción: ${a.numero_transaccion}</div>` : ''}
            </div>
            <div class="anticipo-importe">
                <div class="divisa">${a.divisa}</div>
                ${money(a.importe)}
            </div>
        </div>
        ${a.observaciones ? `<div class="anticipo-observaciones">${a.observaciones}</div>` : ''}
        ${a.adjunto_gcs_path ? `
            <div style="margin-top: 8px;">
                <button class="btn-secondary btn-sm" onclick="verAdjuntoAnticipo('${a.adjunto_view_url || a.adjunto_gcs_path}')">
                    📎 Ver Comprobante
                </button>
            </div>
        ` : ''}
        <div style="margin-top: 12px; text-align: right;">
            <button class="btn-action btn-consumir"
                    onclick="consumirAnticipo(${a.id})"
                    ${!puedeActuar ? 'disabled' : ''}
                    title="Cliente consumió en esta caja">
                ✅ Consumir Anticipo
            </button>
        </div>
    </div>
`;
```

#### 4.2 CSS para Divisa
```css
.anticipo-importe .divisa {
    font-size: 11px;
    font-weight: 500;
    color: #6b7280;
    margin-bottom: 2px;
}
```

#### 4.3 Función para Ver Adjunto (Opcional pero recomendado)
```javascript
window.verAdjuntoAnticipo = function(url) {
    // Abrir en modal o nueva ventana
    window.open(url, '_blank', 'width=800,height=600');
};
```

### 5. Resumen Local (resumen_local.html + app.py)

#### 5.1 Endpoint `/api/resumen/local`
**Modificar query de anticipos consumidos:**
```sql
SELECT
    ar.id,
    ar.fecha_pago,
    ar.medio_pago,
    ar.observaciones,
    ar.importe,
    ar.divisa,  -- NUEVO
    ar.created_by,  -- NUEVO
    aec.usuario,
    ar.cliente,
    aec.caja
FROM anticipos_recibidos ar
JOIN anticipos_estados_caja aec ON aec.anticipo_id = ar.id
WHERE aec.local = %s
  AND DATE(aec.fecha) = %s
  AND aec.estado = 'consumido'
ORDER BY ar.id ASC
```

#### 5.2 Template resumen_local.html
**Mostrar divisa:**
```html
<tr>
    <td>${anticipo.cliente}</td>
    <td>${anticipo.divisa} ${formatMoney(anticipo.importe)}</td>
    <td>${anticipo.medio_pago || '-'}</td>
    <td>${anticipo.created_by || '-'}</td>
    <td>${anticipo.caja}</td>
</tr>
```

## 📋 Checklist de Tareas

- [x] Migración de base de datos ejecutada
- [ ] Actualizar endpoint `/api/anticipos_recibidos/crear`
- [ ] Actualizar endpoint `/api/anticipos_recibidos/listar`
- [ ] Actualizar endpoint `/api/anticipos_recibidos/editar`
- [ ] Actualizar endpoint `/api/anticipos/disponibles`
- [ ] Actualizar endpoint `/api/anticipos/consumidos_en_caja`
- [ ] Actualizar endpoint `/api/resumen/local` (anticipos)
- [ ] Actualizar HTML modal gestion_anticipos.html
- [ ] Actualizar JS gestion_anticipos.js
- [ ] Actualizar JS anticipos_v2.js (vista de caja)
- [ ] Actualizar template resumen_local.html
- [ ] Agregar CSS para divisa
- [ ] Probar flujo completo: crear → consumir → ver en resumen
- [ ] Probar con diferentes divisas
- [ ] Probar upload/visualización de adjuntos

## 🎯 Próximos Pasos

1. Implementar cambios en app.py (endpoints)
2. Implementar cambios en gestion_anticipos.html + .js
3. Implementar cambios en anticipos_v2.js
4. Implementar cambios en resumen_local
5. Testing end-to-end
6. Commit y push

---

**Nota:** Los adjuntos se guardarán en GCS con la estructura:
```
{local}/anticipos/{YYYY}/{MM}/{DD}/admin/dia/{uuid}__{filename}
```

Y se vincularán mediante la tabla `imagenes_adjuntos` con:
- `entity_type = 'anticipo_recibido'`
- `entity_id = {anticipo_id}`
