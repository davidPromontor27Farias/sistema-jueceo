-- CreateEnum
CREATE TYPE "PaqueteBase" AS ENUM ('COMPETIDOR', 'PUBLICO_GENERAL', 'VIP_EXPERIENCE', 'BOSS_EXPERIENCE', 'BOSS_VIP', 'PRO_PACKAGE', 'SOLO_WORKSHOPS');

-- AlterEnum
ALTER TYPE "Categoria" ADD VALUE 'OPEN_STYLE_1V1';

-- AlterTable: add new columns nullable first so existing rows can be backfilled
ALTER TABLE "registrations"
  ADD COLUMN     "academiaCrew" TEXT,
  ADD COLUMN     "competidorId" TEXT,
  ADD COLUMN     "fotoUrl" TEXT,
  ADD COLUMN     "nacionalidad" TEXT,
  ADD COLUMN     "paqueteBase" "PaqueteBase",
  ADD COLUMN     "workshopsSeleccionados" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Backfill existing rows before old columns are dropped / NOT NULL is enforced
UPDATE "registrations" SET "academiaCrew" = COALESCE("academia", "crew");
UPDATE "registrations" SET "nacionalidad" = 'Mexicana';
UPDATE "registrations" SET "paqueteBase" = CASE WHEN "tipoBoleto" = 'GENERAL' THEN 'PUBLICO_GENERAL'::"PaqueteBase" ELSE 'COMPETIDOR'::"PaqueteBase" END;

-- Drop old columns now that data has been migrated into academiaCrew
ALTER TABLE "registrations" DROP COLUMN "academia";
ALTER TABLE "registrations" DROP COLUMN "crew";

-- Enforce NOT NULL now that all rows are backfilled
ALTER TABLE "registrations" ALTER COLUMN "nacionalidad" SET NOT NULL;
ALTER TABLE "registrations" ALTER COLUMN "paqueteBase" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "registrations_competidorId_key" ON "registrations"("competidorId");

-- CreateIndex
CREATE INDEX "registrations_estatusPago_idx" ON "registrations"("estatusPago");

-- CreateIndex
CREATE INDEX "registrations_categoria_idx" ON "registrations"("categoria");
