#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para ejecutar la migración de permisos de locales por usuario
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

def run_migration():
    print("=" * 80)
    print("Ejecutando migración: user_local_permissions")
    print("=" * 80)

    sql_file = 'app_de_cajas/migrations/add_user_local_permissions.sql'

    try:
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()

        print(f"\n✓ Archivo SQL cargado: {sql_file}")

        # Dividir por sentencias y limpiar comentarios
        lines = sql_content.split('\n')
        clean_lines = []
        for line in lines:
            if '--' in line:
                line = line[:line.index('--')]
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

        for i, stmt in enumerate(statements, 1):
            try:
                print(f"[{i}/{len(statements)}] Ejecutando: {stmt[:60]}...")
                cur.execute(stmt)
                conn.commit()
                print(f"    ✓ OK")
            except Exception as e:
                print(f"    ⚠️  Error: {e}")
                if "Duplicate column" in str(e) or "already exists" in str(e):
                    print(f"    → Ya existe, continuando...")
                else:
                    raise

        # Verificar que la tabla existe
        print("\nVerificando tabla user_local_permissions...")
        cur.execute("SHOW TABLES LIKE 'user_local_permissions'")
        if cur.fetchone():
            print("✓ Tabla user_local_permissions creada correctamente")

            # Mostrar estructura
            cur.execute("DESCRIBE user_local_permissions")
            columns = cur.fetchall()
            print("\nEstructura de la tabla:")
            for col in columns:
                print(f"  - {col['Field']}: {col['Type']} {col['Null']} {col['Key']}")
        else:
            print("⚠️  Tabla no encontrada")

        cur.close()
        conn.close()

        print("\n" + "=" * 80)
        print("✅ Migración completada exitosamente")
        print("=" * 80)
        print("\nAhora podés asignar locales a usuarios con rol 'anticipos':")
        print("  INSERT INTO user_local_permissions (username, local, created_by)")
        print("  VALUES ('usuario', 'Nombre Local', 'admin');")

    except FileNotFoundError:
        print(f"❌ ERROR: No se encontró el archivo {sql_file}")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    run_migration()
