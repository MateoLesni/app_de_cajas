-- Migración: Cambiar columna accion de ENUM a VARCHAR(50)
-- Fecha: 2026-02-27
-- Descripción: La columna accion era ENUM con valores fijos (INSERT, UPDATE, DELETE,
--              CLOSE_BOX, CLOSE_LOCAL, AUDIT, INSERT_UPDATE, OPERATION).
--              Se cambia a VARCHAR(50) para soportar nuevas acciones de soporte:
--              REOPEN_BOX, REOPEN_LOCAL, UNAUDIT_LOCAL, CREATE_BOX.
--              Esto NO afecta datos existentes.

ALTER TABLE auditoria MODIFY COLUMN accion VARCHAR(50) NOT NULL;
