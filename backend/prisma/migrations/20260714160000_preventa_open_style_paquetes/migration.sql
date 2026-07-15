-- AlterEnum: PRO_PACKAGE se fusiona con BOSS_VIP (mismo contenido, ver Mejoras_v3).
-- Los registros existentes con PRO_PACKAGE se reasignan a BOSS_VIP; su precioMXNCentavos
-- ya guardado no cambia (es una foto del monto cobrado en su momento).
CREATE TYPE "PaqueteBase_new" AS ENUM ('COMPETIDOR', 'PUBLICO_GENERAL', 'VIP_EXPERIENCE', 'BOSS_EXPERIENCE', 'BOSS_VIP', 'SOLO_WORKSHOPS');

ALTER TABLE "registrations"
  ALTER COLUMN "paqueteBase" TYPE "PaqueteBase_new"
  USING (
    CASE WHEN "paqueteBase"::text = 'PRO_PACKAGE' THEN 'BOSS_VIP' ELSE "paqueteBase"::text END
  )::"PaqueteBase_new";

ALTER TYPE "PaqueteBase" RENAME TO "PaqueteBase_old";
ALTER TYPE "PaqueteBase_new" RENAME TO "PaqueteBase";
DROP TYPE "PaqueteBase_old";

-- AlterTable: extra de "Agregar Open Style 1 vs 1" ($250 MXN) sobre otra categoría de competidor.
ALTER TABLE "registrations" ADD COLUMN "agregarOpenStyle" BOOLEAN NOT NULL DEFAULT false;
