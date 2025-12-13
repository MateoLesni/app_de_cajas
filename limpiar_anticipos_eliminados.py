#!/usr/bin/env python3
"""
Script para limpiar registros 'eliminado_de_caja' de la tabla anticipos_estados_caja.
Estos registros ya no son necesarios porque se eliminó la funcionalidad de marcar
anticipos como "no vino a esta caja".
"""

import pymysql
import os
from dotenv import load_dotenv

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

def main():
    print("=" * 60)
    print("Limpieza de registros 'eliminado_de_caja'")
    print("=" * 60)

    try:
        # Conectar a la base de datos
        conn = pymysql.connect(**DB_CONFIG)
        cur = conn.cursor()

        # Verificar cuántos registros hay
        cur.execute("""
            SELECT COUNT(*) as total
            FROM anticipos_estados_caja
            WHERE estado = 'eliminado_de_caja'
        """)
        result = cur.fetchone()
        total = result['total'] if result else 0

        print(f"\n📊 Registros encontrados con estado='eliminado_de_caja': {total}")

        if total == 0:
            print("✅ No hay registros para eliminar.")
            cur.close()
            conn.close()
            return

        # Mostrar algunos ejemplos
        cur.execute("""
            SELECT
                id, anticipo_id, local, caja, fecha, turno, usuario, timestamp_accion
            FROM anticipos_estados_caja
            WHERE estado = 'eliminado_de_caja'
            LIMIT 5
        """)
        ejemplos = cur.fetchall()

        print("\n📋 Ejemplos de registros a eliminar:")
        for ej in ejemplos:
            print(f"  - ID: {ej['id']}, Anticipo: {ej['anticipo_id']}, "
                  f"Local: {ej['local']}, Caja: {ej['caja']}, "
                  f"Fecha: {ej['fecha']}, Usuario: {ej['usuario']}")

        # Pedir confirmación
        confirmacion = input(f"\n⚠️  ¿Eliminar los {total} registros? (si/no): ").strip().lower()

        if confirmacion not in ['si', 's', 'sí', 'yes', 'y']:
            print("❌ Operación cancelada.")
            cur.close()
            conn.close()
            return

        # Eliminar registros
        print(f"\n🗑️  Eliminando {total} registros...")
        cur.execute("""
            DELETE FROM anticipos_estados_caja
            WHERE estado = 'eliminado_de_caja'
        """)
        conn.commit()

        print(f"✅ {cur.rowcount} registros eliminados correctamente.")

        # Verificar que se eliminaron
        cur.execute("""
            SELECT COUNT(*) as total
            FROM anticipos_estados_caja
            WHERE estado = 'eliminado_de_caja'
        """)
        result = cur.fetchone()
        restantes = result['total'] if result else 0

        print(f"📊 Registros restantes con estado='eliminado_de_caja': {restantes}")

        if restantes == 0:
            print("✅ Limpieza completada exitosamente.")
        else:
            print(f"⚠️  Aún quedan {restantes} registros. Revisar manualmente.")

        cur.close()
        conn.close()

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
