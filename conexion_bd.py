import mysql.connector

# Conexión a la base de datos
conn = mysql.connector.connect(
    host="127.0.0.1",       # o "localhost"
    user="root",            # tu usuario
    password="asd123",  # reemplazá con tu contraseña real
    database="remesas"        # nombre de la base de datos
)

cursor = conn.cursor()

# Probamos que funcione
cursor.execute("SELECT cantidad_cajas FROM remesas.locales WHERE id = %s", ("MAL01",))

for table in cursor.fetchall():
    print(table)

# Cerramos
cursor.close()
conn.close()
