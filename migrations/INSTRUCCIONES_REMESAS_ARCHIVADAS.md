# Instrucciones: Archivar Remesas Antiguas

## Resumen
Este documento explica cómo limpiar remesas antiguas de prueba del sistema, manteniéndolas en la base de datos para auditoría pero ocultándolas de los reportes activos.

## Problema
El sistema tiene remesas antiguas que nunca se retiraron o quedaron en TRAN porque el sistema no se usaba realmente. Estas remesas obsoletas:
- Remesas en TRAN muy antiguas
- Remesas no retiradas con más de 3 días de antigüedad

## Solución

### 1. Ejecutar la migración SQL
Ejecutá el archivo `migrations/archivar_remesas_antiguas.sql` en tu base de datos MySQL.

Este script:
- Define fechas de corte configurables
- Muestra un preview de qué se archivará
- Marca remesas antiguas con `estado_contable = 'Archivada'`
- Mantiene las remesas recientes activas
- No elimina nada físicamente

### 2. Ajustar fechas de corte (opcional)
Si querés cambiar los períodos de retención, editá las variables al inicio del SQL:

```sql
SET @fecha_corte_tran = DATE_SUB(CURDATE(), INTERVAL 7 DAY);          -- Mantener TRAN de última semana
SET @fecha_corte_no_retiradas = DATE_SUB(CURDATE(), INTERVAL 3 DAY);  -- Mantener No Retiradas de últimos 3 días
```

### 3. Cambios en el código (ya aplicados)
Los siguientes endpoints ya fueron actualizados para excluir remesas archivadas:

#### A. Reporte de Resumen Tesorería (línea ~6721)
```python
WHERE r.estado_contable = 'TRAN'
  AND r.estado_contable != 'Archivada'  # ← Agregado
```

#### B. Listado de Remesas No Retiradas (línea ~10024)
```python
WHERE retirada NOT IN (1, 'Si', 'Sí', 'sí', 'si', 'SI', 'SÍ')
  AND (retirada = 0 OR retirada = 'No' OR retirada IS NULL OR retirada = '')
  AND (estado_contable IS NULL OR estado_contable != 'Archivada')  # ← Agregado
```

#### C. Contador de Remesas No Retiradas (línea ~10334)
```python
WHERE retirada NOT IN (1, 'Si', 'Sí', 'sí', 'si', 'SI', 'SÍ')
  AND (retirada = 0 OR retirada = 'No' OR retirada IS NULL OR retirada = '')
  AND (estado_contable IS NULL OR estado_contable != 'Archivada')  # ← Agregado
```

## Verificación post-migración

Ejecutá estos queries para verificar el resultado:

```sql
-- Ver distribución por estado
SELECT
    estado_contable,
    COUNT(*) as cantidad,
    MIN(DATE(fecha)) as fecha_mas_antigua,
    MAX(DATE(fecha)) as fecha_mas_reciente
FROM remesas_trns
GROUP BY estado_contable;

-- Ver remesas activas (las que quedan visibles)
SELECT COUNT(*) as tran_activas
FROM remesas_trns
WHERE estado_contable = 'TRAN'
  AND estado_contable != 'Archivada';

SELECT COUNT(*) as no_retiradas_activas
FROM remesas_trns
WHERE retirada = 0
  AND (estado_contable IS NULL OR estado_contable != 'Archivada');
```

## Revertir (si es necesario)

Si necesitás deshacer el archivado:

```sql
UPDATE remesas_trns
SET estado_contable = 'Local'
WHERE estado_contable = 'Archivada';
```

## Mantenimiento futuro

Las remesas archivadas permanecen en la base de datos para auditoría. Si en el futuro necesitás limpiar más remesas antiguas, simplemente ejecutá nuevamente la migración con fechas ajustadas.
