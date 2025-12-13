#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para agrandar la columna entity_type en imagenes_adjuntos
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

def fix_entity_type_column():
    print("=" * 80)
    print("Agrandando columna entity_type en imagenes_adjuntos")
    print("=" * 80)

    try:
        # Conectar a BD
        conn = pymysql.connect(**DB_CONFIG)
        cur = conn.cursor()

        print(f"\n✓ Conectado a base de datos: {DB_CONFIG['database']}")

        # 1. Verificar estado actual
        print("\n1. Verificando estado actual de la columna...")
        cur.execute("""
            SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = %s
              AND TABLE_NAME = 'imagenes_adjuntos'
              AND COLUMN_NAME = 'entity_type'
        """, (DB_CONFIG['database'],))

        col_info = cur.fetchone()
        if col_info:
            print(f"   Columna actual: {col_info['COLUMN_TYPE']}")
            print(f"   Nullable: {col_info['IS_NULLABLE']}")
            print(f"   Default: {col_info['COLUMN_DEFAULT']}")
        else:
            print("   ⚠️  Columna no encontrada")
            return

        # 2. Modificar columna
        print("\n2. Ejecutando ALTER TABLE...")
        cur.execute("""
            ALTER TABLE imagenes_adjuntos
            MODIFY COLUMN entity_type VARCHAR(50) DEFAULT NULL
        """)
        conn.commit()
        print("   ✓ Columna modificada exitosamente")

        # 3. Verificar cambio
        print("\n3. Verificando cambio...")
        cur.execute("""
            SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = %s
              AND TABLE_NAME = 'imagenes_adjuntos'
              AND COLUMN_NAME = 'entity_type'
        """, (DB_CONFIG['database'],))

        col_info = cur.fetchone()
        if col_info:
            print(f"   Columna actualizada: {col_info['COLUMN_TYPE']}")
            print(f"   Nullable: {col_info['IS_NULLABLE']}")
            print(f"   Default: {col_info['COLUMN_DEFAULT']}")

        # 4. Verificar datos existentes
        print("\n4. Verificando datos existentes...")
        cur.execute("""
            SELECT entity_type, COUNT(*) as count
            FROM imagenes_adjuntos
            WHERE entity_type IS NOT NULL
            GROUP BY entity_type
        """)

        rows = cur.fetchall()
        if rows:
            print("   Tipos de entidad encontrados:")
            for row in rows:
                print(f"     - {row['entity_type']}: {row['count']} registros")
        else:
            print("   No hay registros con entity_type")

        cur.close()
        conn.close()

        print("\n" + "=" * 80)
        print("✅ Columna entity_type actualizada correctamente")
        print("=" * 80)

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    fix_entity_type_column()
