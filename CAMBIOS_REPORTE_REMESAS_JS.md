# Cambios Necesarios en reporte_remesas.js

## Instrucciones

Aplicar los siguientes cambios en el archivo `static/js/reporte_remesas.js`:

---

## 1. Agregar función para obtener CSRF token (al inicio del archivo, después de línea 8)

```javascript
// Obtener CSRF token del meta tag
function getCSRFToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.content : '';
}
```

---

## 2. Modificar función `guardarRemesa` (línea 242-246)

**REEMPLAZAR:**
```javascript
const res = await fetch('/api/tesoreria/guardar-remesa', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
```

**POR:**
```javascript
const res = await fetch('/api/tesoreria/guardar-remesa', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCSRFToken()
  },
  body: JSON.stringify(payload)
});
```

---

## 3. Modificar función `guardarTodo` (línea 292-304)

**REEMPLAZAR:**
```javascript
const res = await fetch('/api/tesoreria/guardar-remesa', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    remesa_id: remesa.id,
    local: remesa.local,
    fecha_retiro: $('#rep-fecha').value,
    nro_remesa: remesa.nro_remesa || '',
    precinto: remesa.precinto || '',
    monto_teorico: remesa.monto,
    monto_real: remesa.real || 0
  })
});
```

**POR:**
```javascript
const res = await fetch('/api/tesoreria/guardar-remesa', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCSRFToken()
  },
  body: JSON.stringify({
    remesa_id: remesa.id,
    local: remesa.local,
    fecha_retiro: $('#rep-fecha').value,
    nro_remesa: remesa.nro_remesa || '',
    precinto: remesa.precinto || '',
    monto_teorico: remesa.monto,
    monto_real: remesa.real || 0
  })
});
```

---

## 4. Buscar funciones de aprobar/desaprobar y agregar CSRF token

Buscar estas funciones (pueden estar más abajo en el archivo) y agregar el header CSRF:

**En función `aprobarFecha`:**
```javascript
const res = await fetch('/api/tesoreria/aprobar-conciliacion', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCSRFToken()  // ← AGREGAR
  },
  body: JSON.stringify({
    fecha_retiro: fechaRetiro,
    observaciones: observaciones || ''
  })
});
```

**En función `desaprobarFecha`:**
```javascript
const res = await fetch('/api/tesoreria/desaprobar-conciliacion', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCSRFToken()  // ← AGREGAR
  },
  body: JSON.stringify({
    fecha_retiro: fechaRetiro,
    observaciones: motivo
  })
});
```

---

## 5. Mejorar UX del input de monto real (línea 146-153)

**REEMPLAZAR:**
```html
<input type="text"
       class="input-real"
       data-index="${index}"
       value="${numeroAFormatoArgentino(remesa.real)}"
       placeholder="0,00"
       oninput="window.formatearInput(${index}, this)"
       onblur="window.actualizarReal(${index}, this.value)"
       onkeypress="if(event.key==='Enter'){event.target.blur();window.guardarRemesa(${index})}">
```

**POR:**
```html
<input type="text"
       class="input-real"
       data-index="${index}"
       value="${numeroAFormatoArgentino(remesa.real)}"
       placeholder="0,00"
       style="text-align: center;"
       onfocus="if(this.value==='0,00')this.value=''"
       oninput="window.formatearInput(${index}, this)"
       onblur="window.actualizarReal(${index}, this.value)"
       onkeypress="if(event.key==='Enter'){event.target.blur();window.guardarRemesa(${index})}">
```

**Cambios:**
- ✅ Agregado `style="text-align: center;"` para centrar el texto
- ✅ Agregado `onfocus="if(this.value==='0,00')this.value=''"` para borrar el 0,00 al hacer click

---

## 6. Actualizar CSS del input (línea 162-171 del HTML)

En `reporte_remesas.html`, buscar `.input-real` y REEMPLAZAR:

```css
.input-real {
  width: 120px;
  padding: 8px;
  border: 2px solid #9ca3af;
  border-radius: 6px;
  text-align: right;
  font-weight: 700;
  font-size: 15px;
  background: #e5e7eb;
}
```

**POR:**
```css
.input-real {
  width: 120px;
  padding: 8px;
  border: 2px solid #9ca3af;
  border-radius: 6px;
  text-align: center;  /* ← CAMBIAR de right a center */
  font-weight: 700;
  font-size: 15px;
  background: #e5e7eb;
}
```

---

## Verificación

Después de aplicar los cambios:

1. ✅ Abrir `/reporteria/remesas`
2. ✅ Inspeccionar elemento y verificar que existe `<meta name="csrf-token" content="...">`
3. ✅ Abrir DevTools → Network
4. ✅ Intentar guardar una remesa
5. ✅ Verificar que el request incluye header `X-CSRF-Token`
6. ✅ Verificar que al hacer click en input con "0,00", se borra automáticamente
7. ✅ Verificar que el número está centrado en el input

---

## Manejo de Errores CSRF

Si el token es inválido, el servidor responderá con:

```json
{
  "success": false,
  "msg": "Token de seguridad inválido. Por favor, recarga la página.",
  "error_code": "CSRF_INVALID"
}
```

El usuario debe recargar la página para obtener un nuevo token.

---

**Última actualización**: 2026-01-06
