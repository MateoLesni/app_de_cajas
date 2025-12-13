#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para ejecutar la migración de anticipos (divisa + adjuntos)
"""
import sys
import pymysql
import os
from dotenv import load_dotenv

# Fix encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Cargar variables de entorno
load_dotenv('app_de_cajas/.env')

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': int(os.getenv('DB_PORT', 3307)),
    'user': os.getenv('DB_USER', 'mate-dev'),
    'password': os.getenv('DB_PASS'),
    'database': os.getenv('DB_NAME', 'cajasdb'),
    'charset': os.getenv('DB_CHARSET', 'utf8mb4'),
    'cursorclass': pymysql.cursors.DictCursor
}

def ejecutar_migracion():
    print("=" * 80)
    print("Ejecutando migración: Agregar divisa y adjuntos a anticipos")
    print("=" * 80)

    # Leer archivo SQL
    sql_file = 'app_de_cajas/migrations/add_divisa_adjuntos_anticipos.sql'

    try:
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()

        print(f"\n✓ Archivo SQL cargado: {sql_file}")

        # Dividir por sentencias
        # Remover comentarios de línea completa
        lines = sql_content.split('\n')
        clean_lines = []
        for line in lines:
            # Remover comentarios de línea
            if '--' in line:
                line = line[:line.index('--')]
            # Mantener solo si tiene contenido
            if line.strip():
                clean_lines.append(line)

        clean_sql = '\n'.join(clean_lines)
        statements = [stmt.strip() for stmt in clean_sql.split(';') if stmt.strip()]

        print(f"✓ Encontradas {len(statements)} sentencias SQL")

        # Conectar a BD
        conn = pymysql.connect(**DB_CONFIG)
        cur = conn.cursor()

        print(f"\n✓ Conectado a base de datos: {DB_CONFIG['database']}")
        print("\nEjecutando sentencias...\n")

        for i, statement in enumerate(statements, 1):
            # Saltar comentarios y líneas vacías
            if statement.startswith('--') or not statement.strip():
                continue

            try:
                print(f"[{i}/{len(statements)}] Ejecutando...")
                # Mostrar preview del statement (primeras 100 chars)
                preview = statement[:100].replace('\n', ' ')
                print(f"    {preview}...")

                cur.execute(statement)
                conn.commit()
                print(f"    ✓ Completado")

            except Exception as e:
                print(f"    ⚠️  Error: {e}")
                # Decidir si continuar o no
                if "Duplicate column" in str(e) or "already exists" in str(e):
                    print(f"    → Columna ya existe, continuando...")
                elif "Table" in str(e) and "already exists" in str(e):
                    print(f"    → Tabla ya existe, continuando...")
                else:
                    print(f"    ❌ Error crítico, abortando...")
                    conn.rollback()
                    raise

        print("\n" + "=" * 80)
        print("✅ Migración completada exitosamente")
        print("=" * 80)

        # Verificación
        print("\nVerificando cambios...")

        # 1. Verificar columnas nuevas en anticipos_recibidos
        cur.execute("""
            SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = %s
              AND TABLE_NAME = 'anticipos_recibidos'
              AND COLUMN_NAME IN ('divisa', 'tipo_cambio_fecha')
            ORDER BY ORDINAL_POSITION
        """, (DB_CONFIG['database'],))

        cols = cur.fetchall()
        if cols:
            print("\n✓ Columnas agregadas a anticipos_recibidos:")
            for col in cols:
                print(f"  - {col['COLUMN_NAME']}: {col['DATA_TYPE']} (default: {col['COLUMN_DEFAULT']})")
                if col['COLUMN_COMMENT']:
                    print(f"    Comentario: {col['COLUMN_COMMENT']}")
        else:
            print("\n⚠️  No se encontraron las columnas nuevas")

        # 2. Verificar tabla tipos_cambio
        cur.execute("""
            SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'tipos_cambio'
        """, (DB_CONFIG['database'],))

        result = cur.fetchone()
        if result['count'] > 0:
            print("\n✓ Tabla 'tipos_cambio' creada")

            # Ver registros
            cur.execute("SELECT * FROM tipos_cambio LIMIT 5")
            rows = cur.fetchall()
            print(f"  Registros: {len(rows)}")
            for row in rows:
                print(f"    {row['fecha']} - {row['divisa']}: compra={row['valor_compra']}, venta={row['valor_venta']}")
        else:
            print("\n⚠️  Tabla 'tipos_cambio' no encontrada")

        # 3. Verificar que anticipos existentes tengan divisa
        cur.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN divisa IS NULL THEN 1 ELSE 0 END) as sin_divisa,
                SUM(CASE WHEN tipo_cambio_fecha IS NULL THEN 1 ELSE 0 END) as sin_fecha_tc
            FROM anticipos_recibidos
        """)

        stats = cur.fetchone()
        print(f"\n✓ Estadísticas de anticipos:")
        print(f"  Total: {stats['total']}")
        print(f"  Sin divisa: {stats['sin_divisa']}")
        print(f"  Sin fecha tipo cambio: {stats['sin_fecha_tc']}")

        cur.close()
        conn.close()

        print("\n" + "=" * 80)
        print("🎉 Migración y verificación completadas")
        print("=" * 80)

    except FileNotFoundError:
        print(f"\n❌ ERROR: No se encontró el archivo {sql_file}")
        print("   Asegurate de que el archivo existe en la ubicación correcta.")

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    ejecutar_migracion()
