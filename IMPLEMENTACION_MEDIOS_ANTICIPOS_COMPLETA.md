# ✅ Implementación Completa: Medios de Pago para Anticipos

## Fecha: 2026-01-07

---

## 📋 Resumen de Implementación

Se ha implementado completamente el sistema de **medios de pago para anticipos** con compensación automática de efectivo.

---

## 🔧 Cambios Realizados en Backend

### 1. ✅ Endpoints API Insertados en `app.py` (línea 9022-9224)

**Ubicación**: [app.py:9022-9224](app.py#L9022-L9224)

Se insertaron 4 endpoints nuevos:

#### a) Listar todos los medios (admin_anticipos)
```python
@app.route('/api/medios_anticipos/listar', methods=['GET'])
@login_required
@role_min_required(6)  # Solo admin_anticipos
```
- Retorna todos los medios de pago (activos e inactivos)
- Solo accesible para `admin_anticipos` (nivel 6+)

#### b) Crear nuevo medio de pago
```python
@app.route('/api/medios_anticipos/crear', methods=['POST'])
@login_required
@role_min_required(6)
```
- Crea un nuevo medio de pago
- Valida que no exista duplicado
- Body: `{"nombre": "...", "es_efectivo": 0/1}`

#### c) Eliminar (desactivar) medio de pago
```python
@app.route('/api/medios_anticipos/<int:medio_id>', methods=['DELETE'])
@login_required
@role_min_required(6)
```
- Desactiva el medio (no elimina físicamente)
- Protege el medio "Efectivo" (no se puede eliminar)
- Informa si había anticipos usando ese medio

#### d) Listar medios activos (para formularios)
```python
@app.route('/api/medios_anticipos/activos', methods=['GET'])
@login_required
```
- Retorna solo medios activos
- Accesible para cualquier usuario autenticado
- Usada en formularios de creación de anticipos

---

### 2. ✅ Modificación en `crear_anticipo_recibido` (línea 2510-2529)

**Ubicación**: [app.py:2510-2529](app.py#L2510-L2529)

**Cambios realizados:**

```python
# Obtener medio_pago_id (nuevo campo)
medio_pago_id = data.get('medio_pago_id')

# Si no viene medio_pago_id, asignar "Efectivo" por defecto (retrocompatibilidad)
if not medio_pago_id:
    cur.execute("SELECT id FROM medios_anticipos WHERE nombre = 'Efectivo' LIMIT 1")
    result = cur.fetchone()
    medio_pago_id = result[0] if result else None

# Insertar anticipo recibido con divisa y medio_pago_id
sql = """
    INSERT INTO anticipos_recibidos
    (fecha_pago, fecha_evento, importe, divisa, tipo_cambio_fecha,
     cliente, numero_transaccion, medio_pago, observaciones,
     local, medio_pago_id, estado, created_by)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pendiente', %s)
"""
```

**Lógica:**
- Acepta `medio_pago_id` del request JSON
- Si no viene, asigna "Efectivo" por defecto (retrocompatibilidad)
- Incluye `medio_pago_id` en el INSERT

---

### 3. ✅ Compensación de Efectivo en Resumen por Caja (línea 4314-4332)

**Ubicación**: [app.py:4314-4332](app.py#L4314-L4332)

**Cambios realizados:**

```python
# efectivo (remesas)
cur.execute(f"""
    SELECT COALESCE(SUM(monto),0)
      FROM {T_REMESAS}
     WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
""", (fecha, local, caja, turno))
row = cur.fetchone()
efectivo_base = float(row[0]) if row and row[0] is not None else 0.0

# COMPENSACIÓN: Restar anticipos en efectivo consumidos en esta caja
# (para evitar duplicación al crear la remesa)
cur.execute("""
    SELECT COALESCE(SUM(aec.importe_consumido), 0)
    FROM anticipos_estados_caja aec
    JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
    JOIN medios_anticipos ma ON ma.id = ar.medio_pago_id
    WHERE aec.fecha = %s
      AND aec.local = %s
      AND aec.caja = %s
      AND aec.turno = %s
      AND aec.estado = 'consumido'
      AND ma.es_efectivo = 1
""", (fecha, local, caja, turno))
row_compensacion = cur.fetchone()
compensacion_efectivo = float(row_compensacion[0]) if row_compensacion else 0.0

# Efectivo final = efectivo_base - compensación
resumen['efectivo'] = efectivo_base - compensacion_efectivo
```

**Lógica:**
1. Calcula efectivo base (suma de remesas)
2. Calcula compensación (anticipos en efectivo consumidos en esta caja)
3. Resta compensación del efectivo base
4. Solo compensa si `es_efectivo = 1` y `estado = 'consumido'`

---

### 4. ✅ Compensación de Efectivo en Resumen por Local (línea 5412-5428)

**Ubicación**: [app.py:5412-5428](app.py#L5412-L5428)

**Cambios realizados:**

```python
# ===== EFECTIVO (Remesas) =====
efectivo_remesas = _qsum(
    cur,
    f"SELECT COALESCE(SUM(monto),0) FROM {T_REMESAS} WHERE DATE(fecha)=%s AND local=%s",
    (f, local),
)

# COMPENSACIÓN: Restar anticipos en efectivo consumidos en este local/fecha
compensacion_efectivo_local = _qsum(
    cur,
    """
    SELECT COALESCE(SUM(aec.importe_consumido), 0)
    FROM anticipos_estados_caja aec
    JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
    JOIN medios_anticipos ma ON ma.id = ar.medio_pago_id
    WHERE aec.fecha = %s
      AND aec.local = %s
      AND aec.estado = 'consumido'
      AND ma.es_efectivo = 1
    """,
    (f, local)
) or 0.0

efectivo_neto = efectivo_remesas - compensacion_efectivo_local
```

**Lógica:**
- Similar al resumen por caja pero sin filtrar por caja/turno
- Compensa todos los anticipos en efectivo consumidos en el local en la fecha

---

## 🗄️ Base de Datos

### Tabla a Crear: `medios_anticipos`

**Script SQL**: [SQL_CREATE_MEDIOS_ANTICIPOS.sql](SQL_CREATE_MEDIOS_ANTICIPOS.sql)

```sql
CREATE TABLE IF NOT EXISTS medios_anticipos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activo TINYINT(1) DEFAULT 1,
    es_efectivo TINYINT(1) DEFAULT 0 COMMENT '1=es efectivo (resta de remesas), 0=no es efectivo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_activo (activo),
    INDEX idx_es_efectivo (es_efectivo)
);
```

### Datos Iniciales

```sql
INSERT INTO medios_anticipos (nombre, es_efectivo) VALUES
('Efectivo', 1),
('Transferencia Bancaria', 0),
('Mercado Pago', 0),
('Lemon', 0),
('Passline', 0)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);
```

### Columna Agregada: `anticipos_recibidos.medio_pago_id`

```sql
ALTER TABLE anticipos_recibidos
ADD COLUMN medio_pago_id INT DEFAULT NULL AFTER observaciones;

ALTER TABLE anticipos_recibidos
ADD CONSTRAINT fk_anticipos_recibidos_medio_pago
FOREIGN KEY (medio_pago_id) REFERENCES medios_anticipos(id)
ON DELETE SET NULL;

-- Migrar datos existentes a "Efectivo"
UPDATE anticipos_recibidos
SET medio_pago_id = (SELECT id FROM medios_anticipos WHERE nombre = 'Efectivo' LIMIT 1)
WHERE medio_pago_id IS NULL;
```

---

## 🎯 Próximos Pasos (Frontend)

### 1. Modificar Formulario de Creación de Anticipos

**Ubicación probable**: `templates/anticipos.html` o similar

**Cambios necesarios:**

#### a) Agregar campo desplegable en el formulario

```html
<div class="form-group">
  <label for="medio_pago_id">Medio de Pago <span class="required">*</span></label>
  <select id="medio_pago_id" name="medio_pago_id" class="form-control" required>
    <option value="">-- Seleccionar medio --</option>
    <!-- Se llenarán dinámicamente con JS -->
  </select>
</div>
```

#### b) Cargar medios de pago al abrir el formulario

```javascript
async function cargarMediosPago() {
    try {
        const response = await fetch('/api/medios_anticipos/activos');
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('medio_pago_id');
            select.innerHTML = '<option value="">-- Seleccionar medio --</option>';

            data.medios.forEach(medio => {
                const option = document.createElement('option');
                option.value = medio.id;
                option.textContent = medio.nombre;
                if (medio.nombre === 'Efectivo') {
                    option.selected = true; // Seleccionar Efectivo por defecto
                }
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error cargando medios de pago:', error);
    }
}

// Llamar al cargar la página o al abrir el modal
cargarMediosPago();
```

#### c) Incluir `medio_pago_id` al enviar el formulario

```javascript
async function crearAnticipo() {
    const formData = {
        fecha_pago: document.getElementById('fecha_pago').value,
        fecha_evento: document.getElementById('fecha_evento').value,
        importe: parseFloat(document.getElementById('importe').value),
        cliente: document.getElementById('cliente').value,
        local: document.getElementById('local').value,
        medio_pago_id: parseInt(document.getElementById('medio_pago_id').value), // NUEVO
        numero_transaccion: document.getElementById('numero_transaccion').value,
        observaciones: document.getElementById('observaciones').value
    };

    const response = await fetch('/api/anticipos_recibidos/crear', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(formData)
    });

    const result = await response.json();
    // ... manejar respuesta
}
```

---

### 2. Crear Vista de Administración de Medios de Pago

**Nueva página**: `templates/admin_medios_anticipos.html`

**Funcionalidades:**

1. **Listar medios existentes** (GET `/api/medios_anticipos/listar`)
   - Mostrar tabla con: ID, Nombre, Es Efectivo, Estado (Activo/Inactivo)
   - Columna de acciones: Desactivar/Eliminar

2. **Crear nuevo medio** (POST `/api/medios_anticipos/crear`)
   - Modal/formulario con:
     - Input: Nombre del medio
     - Checkbox: ¿Es efectivo? (restará de remesas)
   - Botón "Crear Medio"

3. **Desactivar medio** (DELETE `/api/medios_anticipos/<id>`)
   - Confirmación antes de desactivar
   - Mensaje si hay anticipos usando ese medio

4. **Permisos**: Solo visible para `admin_anticipos` (nivel 6+)

**Ruta sugerida**: `/admin/medios-anticipos`

**Backend route** (agregar en app.py):
```python
@app.route('/admin/medios-anticipos')
@login_required
@role_min_required(6)
def admin_medios_anticipos_page():
    return render_template('admin_medios_anticipos.html')
```

---

## 🧪 Testing

### Caso 1: Anticipo Efectivo Consumido

```
SETUP:
1. Ejecutar SQL_CREATE_MEDIOS_ANTICIPOS.sql
2. Crear anticipo EFECTIVO de $1000 para Local X
3. Usuario de Caja Y en Local X consume el anticipo

VERIFICACIÓN:
- Consultar resumen de Caja Y:
  - efectivo_base = [suma remesas]
  - compensacion = $1000
  - efectivo_neto = efectivo_base - 1000 ✅
  - anticipos = +$1000 ✅

- Total debe ser correcto (sin duplicación)
```

### Caso 2: Anticipo Transferencia (No Efectivo)

```
SETUP:
1. Crear anticipo TRANSFERENCIA de $1000
2. Usuario de Caja Y consume el anticipo

VERIFICACIÓN:
- Consultar resumen de Caja Y:
  - efectivo NO debe compensarse (ma.es_efectivo = 0)
  - anticipos = +$1000 ✅
  - Total correcto (anticipos y remesas son medios diferentes)
```

### Caso 3: Anticipo Efectivo NO Consumido

```
SETUP:
1. Crear anticipo EFECTIVO de $1000
2. NO consumir en ninguna caja (queda pendiente)

VERIFICACIÓN:
- Consultar resumen de cualquier caja:
  - compensacion = $0 (no hay estado='consumido')
  - efectivo = efectivo_base (sin resta)
  - anticipos = $0 (no consumido)
```

---

## 🔍 Queries SQL de Verificación

### Ver anticipos en efectivo consumidos

```sql
SELECT
    aec.fecha,
    aec.local,
    aec.caja,
    aec.turno,
    ar.cliente,
    ar.importe,
    ma.nombre as medio_pago,
    ma.es_efectivo,
    aec.importe_consumido,
    aec.estado
FROM anticipos_estados_caja aec
JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
JOIN medios_anticipos ma ON ma.id = ar.medio_pago_id
WHERE aec.estado = 'consumido'
  AND ma.es_efectivo = 1
ORDER BY aec.fecha DESC, aec.local, aec.caja;
```

### Ver compensación por caja (debugging)

```sql
SELECT
    aec.fecha,
    aec.local,
    aec.caja,
    aec.turno,
    SUM(aec.importe_consumido) as total_compensar
FROM anticipos_estados_caja aec
JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
JOIN medios_anticipos ma ON ma.id = ar.medio_pago_id
WHERE aec.estado = 'consumido'
  AND ma.es_efectivo = 1
GROUP BY aec.fecha, aec.local, aec.caja, aec.turno
ORDER BY aec.fecha DESC;
```

### Ver anticipos sin medio_pago_id (después de migración)

```sql
SELECT COUNT(*) as sin_medio
FROM anticipos_recibidos
WHERE medio_pago_id IS NULL;

-- Debería retornar 0 después de ejecutar el script SQL
```

---

## 📊 Estado de Implementación

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| **SQL Schema** | ✅ Listo | `SQL_CREATE_MEDIOS_ANTICIPOS.sql` |
| **Endpoints API** | ✅ Implementado | `app.py:9022-9224` |
| **Endpoint Crear Anticipo** | ✅ Modificado | `app.py:2510-2529` |
| **Compensación Resumen Caja** | ✅ Implementado | `app.py:4314-4332` |
| **Compensación Resumen Local** | ✅ Implementado | `app.py:5412-5428` |
| **Frontend Formulario** | ⏳ Pendiente | `templates/anticipos.html` (modificar) |
| **Frontend Admin Medios** | ⏳ Pendiente | `templates/admin_medios_anticipos.html` (crear) |
| **Testing** | ⏳ Pendiente | Ejecutar casos de prueba |

---

## ⚠️ Importante: Orden de Ejecución

### 1. **Primero: Ejecutar SQL**
```bash
# En MySQL
source SQL_CREATE_MEDIOS_ANTICIPOS.sql;
```

Esto:
- Crea tabla `medios_anticipos`
- Agrega columna `medio_pago_id` a `anticipos_recibidos`
- Crea foreign key
- Inserta medios iniciales
- Migra datos existentes a "Efectivo"

### 2. **Segundo: Verificar que el servidor Flask esté corriendo**
Los cambios en `app.py` ya están guardados, pero necesitas reiniciar el servidor para que tome los cambios:

```bash
# Detener el servidor (Ctrl+C)
# Reiniciar
python app.py
```

### 3. **Tercero: Probar endpoints API**

```bash
# Listar medios activos (debería retornar 5 medios)
curl -H "Cookie: session=..." http://localhost:5000/api/medios_anticipos/activos

# Crear anticipo con medio_pago_id
curl -X POST -H "Content-Type: application/json" \
     -H "Cookie: session=..." \
     -d '{"fecha_pago":"2026-01-07","fecha_evento":"2026-01-15","importe":1000,"cliente":"Test","local":"Ribs Infanta","medio_pago_id":1}' \
     http://localhost:5000/api/anticipos_recibidos/crear
```

### 4. **Cuarto: Implementar Frontend**
- Modificar formulario de anticipos
- Crear vista admin de medios

### 5. **Quinto: Testing Completo**
- Crear anticipos de diferentes medios
- Consumir en cajas
- Verificar cálculos en resúmenes
- Verificar que no haya duplicación de efectivo

---

## 📞 Troubleshooting

### Error: `Table 'medios_anticipos' doesn't exist`
**Causa**: No se ejecutó el script SQL
**Solución**: Ejecutar `SQL_CREATE_MEDIOS_ANTICIPOS.sql`

### Error: `Unknown column 'medio_pago_id' in 'field list'`
**Causa**: No se agregó la columna a `anticipos_recibidos`
**Solución**: Ejecutar el script SQL completo (incluyendo ALTER TABLE)

### El desplegable no aparece en el frontend
**Causa**: Frontend no modificado aún
**Solución**: Implementar cambios en `templates/anticipos.html`

### Los anticipos en efectivo no compensan
**Causa**: Verificar que:
1. El anticipo tiene `medio_pago_id` apuntando a un medio con `es_efectivo = 1`
2. El anticipo está en estado `'consumido'` en `anticipos_estados_caja`
3. Las fechas/local/caja/turno coinciden

**Debug**: Ejecutar la query de verificación de compensación

---

## 🎓 Conceptos Clave

### Campo `es_efectivo`
- `1` (True): El medio es efectivo (Efectivo físico)
- `0` (False): El medio NO es efectivo (Transferencia, MP, etc.)

**Impacto**: Solo los medios con `es_efectivo = 1` restan del cálculo de efectivo (compensación).

### Estado `'consumido'`
- Anticipo creado → `estado = 'pendiente'` en `anticipos_recibidos`
- Usuario consume en caja → Se crea registro en `anticipos_estados_caja` con `estado = 'consumido'`
- Solo los anticipos consumidos afectan el resumen de caja

### Compensación
**Sin compensación (problema):**
```
Remesas: $5000
Anticipo efectivo consumido: +$1000
Total: $6000 ❌ (duplicado)
```

**Con compensación (correcto):**
```
Remesas: $5000
Compensación: -$1000
Efectivo neto: $4000
Anticipos: +$1000
Total: $5000 ✅
```

---

## 📝 Archivos de Referencia

1. **SQL Schema**: [SQL_CREATE_MEDIOS_ANTICIPOS.sql](SQL_CREATE_MEDIOS_ANTICIPOS.sql)
2. **Documentación de Compensación**: [MODIFICACIONES_COMPENSACION_EFECTIVO.md](MODIFICACIONES_COMPENSACION_EFECTIVO.md)
3. **Código de Endpoints** (referencia): [CODIGO_MEDIOS_ANTICIPOS.py](CODIGO_MEDIOS_ANTICIPOS.py)
4. **Este documento**: [IMPLEMENTACION_MEDIOS_ANTICIPOS_COMPLETA.md](IMPLEMENTACION_MEDIOS_ANTICIPOS_COMPLETA.md)

---

**Implementado por**: Claude Code
**Fecha**: 2026-01-07
**Versión Backend**: ✅ Completa
**Versión Frontend**: ⏳ Pendiente
**Estado**: Listo para ejecutar SQL y probar

---

## ✅ Checklist de Implementación

- [x] Crear tabla `medios_anticipos`
- [x] Agregar columna `medio_pago_id` a `anticipos_recibidos`
- [x] Insertar endpoints API en `app.py`
- [x] Modificar endpoint de crear anticipo
- [x] Implementar compensación en resumen por caja
- [x] Implementar compensación en resumen por local
- [ ] Ejecutar script SQL en base de datos
- [ ] Reiniciar servidor Flask
- [ ] Modificar frontend del formulario de anticipos
- [ ] Crear vista admin de medios de pago
- [ ] Testing completo de casos de uso
- [ ] Verificar que no haya duplicación de efectivo
