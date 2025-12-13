#!/usr/bin/env python3
"""
Script para verificar anticipos en resumen local
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
    local = 'Local_Test'
    fecha = '2025-12-14'

    print(f"\n{'='*60}")
    print(f"Verificando anticipos para {local} en {fecha}")
    print(f"{'='*60}\n")

    try:
        conn = pymysql.connect(**DB_CONFIG)
        cur = conn.cursor()

        # 1. Verificar anticipos_recibidos
        print("1. Anticipos en anticipos_recibidos:")
        cur.execute("""
            SELECT id, cliente, fecha_pago, fecha_evento, importe, estado
            FROM anticipos_recibidos
            WHERE local = %s
            ORDER BY id DESC
            LIMIT 5
        """, (local,))
        rows = cur.fetchall()
        for r in rows:
            print(f"   ID: {r['id']}, Cliente: {r['cliente']}, Importe: ${r['importe']}, Estado: {r['estado']}")

        # 2. Verificar anticipos_estados_caja
        print(f"\n2. Anticipos consumidos en anticipos_estados_caja (fecha={fecha}):")
        cur.execute("""
            SELECT aec.*, ar.cliente, ar.importe
            FROM anticipos_estados_caja aec
            JOIN anticipos_recibidos ar ON aec.anticipo_id = ar.id
            WHERE aec.local = %s AND aec.estado = 'consumido'
            ORDER BY aec.id DESC
            LIMIT 5
        """, (local,))
        rows = cur.fetchall()
        for r in rows:
            print(f"   ID: {r['id']}, Anticipo: {r['anticipo_id']}, Cliente: {r['cliente']}, ")
            print(f"      Fecha: {r['fecha']}, Caja: {r['caja']}, Turno: {r['turno']}, Importe: ${r['importe']}")

        # 3. Query exacto del resumen_local
        print(f"\n3. Query exacto de resumen_local (DATE(aec.fecha) = '{fecha}'):")
        cur.execute("""
            SELECT ar.id, ar.fecha_pago, ar.medio_pago, ar.observaciones, ar.importe, aec.usuario, ar.cliente, aec.caja
            FROM anticipos_recibidos ar
            JOIN anticipos_estados_caja aec ON aec.anticipo_id = ar.id
            WHERE aec.local=%s AND DATE(aec.fecha)=%s
              AND aec.estado = 'consumido'
            ORDER BY ar.id ASC
        """, (local, fecha))
        rows = cur.fetchall()
        print(f"   Resultados: {len(rows)} anticipos encontrados")
        for r in rows:
            print(f"   - Cliente: {r['cliente']}, Importe: ${r['importe']}, Caja: {r['caja']}")

        # 4. Total
        cur.execute("""
            SELECT COALESCE(SUM(ar.importe),0) as total
            FROM anticipos_recibidos ar
            JOIN anticipos_estados_caja aec ON aec.anticipo_id = ar.id
            WHERE aec.local=%s AND DATE(aec.fecha)=%s
              AND aec.estado = 'consumido'
        """, (local, fecha))
        result = cur.fetchone()
        print(f"\n4. Total anticipos consumidos: ${result['total']}")

        cur.close()
        conn.close()

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
