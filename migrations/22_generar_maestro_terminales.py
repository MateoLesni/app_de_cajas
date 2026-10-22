"""
Genera 22_terminales_establecimientos.sql desde el Maestro de Terminales (xlsx).

Uso:  python -I 22_generar_maestro_terminales.py "<ruta al xlsx>"

El SQL resultante crea la tabla terminales_establecimientos (si no existe), la vacia
y la carga de nuevo, asi que se puede volver a correr con un maestro actualizado.
Una terminal fisica aparece repetida en el Excel: una fila por medio de cobro, cada
una con su N de establecimiento.
"""
import os
import sys
from collections import defaultdict

import openpyxl

SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "22_terminales_establecimientos.sql")
COLS = ["terminal", "establecimiento", "tipo_medio", "cuit", "razon_social", "local_maestro",
        "banco", "lugar", "estado", "procesador"]


def _txt(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return " ".join(str(v).split())


def _q(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "''") + "'"


def main(ruta):
    ws = openpyxl.load_workbook(ruta, data_only=True).active
    filas, sin_terminal, vistos = [], 0, {}
    conflictos = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not any(v is not None for v in r):
            continue
        cuit, razon, local, terminal, estab, tipo, banco, lugar, estado, proc = [_txt(v) for v in r[:10]]
        if not terminal or not terminal.isdigit() or not estab:
            sin_terminal += 1          # 'SIN DATO' (ventas web): no corresponde a una terminal fisica
            continue
        fila = dict(terminal=terminal, establecimiento=estab, tipo_medio=tipo.upper(), cuit=cuit,
                    razon_social=razon, local_maestro=local, banco=banco.upper(), lugar=lugar.upper(),
                    estado=estado.upper(), procesador=proc.upper())
        clave = (terminal, estab, fila["tipo_medio"], razon.lower())
        if clave in vistos:
            previa = vistos[clave]
            dif = [c for c in COLS if previa[c].lower() != fila[c].lower() and c != "local_maestro"]
            if dif:
                conflictos.append((clave, dif))
            continue                    # duplicado exacto (mismo local escrito distinto): se descarta
        vistos[clave] = fila
        filas.append(fila)

    filas.sort(key=lambda f: (f["terminal"], f["tipo_medio"], f["establecimiento"]))
    out = [
        "-- Generado por 22_generar_maestro_terminales.py desde el Maestro de Terminales.",
        "-- Una terminal tiene un N de establecimiento por cada medio de cobro.",
        "CREATE TABLE IF NOT EXISTS terminales_establecimientos (",
        "  id INT AUTO_INCREMENT PRIMARY KEY,",
        "  terminal VARCHAR(30) NOT NULL,",
        "  establecimiento VARCHAR(30) NOT NULL,",
        "  tipo_medio VARCHAR(40) NOT NULL,",
        "  cuit VARCHAR(20) NOT NULL DEFAULT '',",
        "  razon_social VARCHAR(120) NOT NULL DEFAULT '',",
        "  local_maestro VARCHAR(80) NOT NULL DEFAULT '',",
        "  banco VARCHAR(40) NOT NULL DEFAULT '',",
        "  lugar VARCHAR(20) NOT NULL DEFAULT '',",
        "  estado VARCHAR(20) NOT NULL DEFAULT '',",
        "  procesador VARCHAR(40) NOT NULL DEFAULT '',",
        "  UNIQUE KEY uq_term_estab_medio (terminal, establecimiento, tipo_medio, razon_social),",
        "  KEY ix_terminal (terminal)",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "",
        "DELETE FROM terminales_establecimientos;",
        "",
    ]
    for i in range(0, len(filas), 200):
        lote = filas[i:i + 200]
        out.append("INSERT INTO terminales_establecimientos (" + ", ".join(COLS) + ") VALUES")
        out.append(",\n".join("(" + ", ".join(_q(f[c]) for c in COLS) + ")" for f in lote) + ";")
        out.append("")
    with open(SALIDA, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(out))

    por_term = defaultdict(int)
    for f in filas:
        por_term[f["terminal"]] += 1
    print(f"Filas cargadas: {len(filas)} | terminales: {len(por_term)} | descartadas sin terminal: {sin_terminal}")
    print(f"Conflictos entre duplicados (misma terminal+establecimiento+medio+razon social con datos distintos): {len(conflictos)}")
    for c in conflictos[:10]:
        print("  ", c)
    print("->", SALIDA)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\mateo\Downloads\Maestro de Terminales 02102026.xlsx")
