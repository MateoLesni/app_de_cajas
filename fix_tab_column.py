#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script temporal para aumentar el tamaño de la columna 'tab' en imagenes_adjuntos
"""
import os
import sys
from dotenv import load_dotenv
import mysql.connector

load_dotenv()

def main():
    print("=== Aumentando tamaño de columna 'tab' ===\n")

    sql = "ALTER TABLE imagenes_adjuntos MODIFY COLUMN tab VARCHAR(50);"
    print(f"SQL: {sql}\n")

    try:
        conn = mysql.connector.connect(
            host=os.getenv('DB_HOST'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD'),
            database=os.getenv('DB_NAME')
        )
        cur = conn.cursor()

        print("Ejecutando ALTER TABLE...")
        cur.execute(sql)
        conn.commit()
        print("✅ Columna 'tab' actualizada a VARCHAR(50)\n")

        # Verificar
        print("Verificando estructura de la tabla:")
        cur.execute("DESCRIBE imagenes_adjuntos")
        print("\nColumna 'tab':")
        for row in cur.fetchall():
            if row[0] == 'tab':
                print(f"  Campo: {row[0]}")
                print(f"  Tipo: {row[1]}")
                print(f"  Null: {row[2]}")
                print(f"  Key: {row[3]}")
                print(f"  Default: {row[4]}")

        cur.close()
        conn.close()

        print("\n✅ Script completado exitosamente")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
