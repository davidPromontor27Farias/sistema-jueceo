-- CreateEnum
CREATE TYPE "EstadoAcceso" AS ENUM ('NO_USADO', 'DENTRO', 'FUERA_TEMPORAL', 'REINGRESO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "TipoEventoAcceso" AS ENUM ('ENTRADA', 'SALIDA_TEMPORAL', 'REINGRESO', 'INTENTO_BLOQUEADO', 'BLOQUEO', 'DESBLOQUEO');

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN "estadoAcceso" "EstadoAcceso" NOT NULL DEFAULT 'NO_USADO';

-- CreateTable
CREATE TABLE "accesos_eventos" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "tipo" "TipoEventoAcceso" NOT NULL,
    "estadoAnterior" "EstadoAcceso" NOT NULL,
    "estadoNuevo" "EstadoAcceso" NOT NULL,
    "posibleDuplicado" BOOLEAN NOT NULL DEFAULT false,
    "segundosDesdeUltimoEvento" INTEGER,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accesos_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accesos_eventos_registrationId_createdAt_idx" ON "accesos_eventos"("registrationId", "createdAt");

-- AddForeignKey
ALTER TABLE "accesos_eventos" ADD CONSTRAINT "accesos_eventos_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accesos_eventos" ADD CONSTRAINT "accesos_eventos_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: registros que ya tenían un check-in antes de este cambio (con el
-- modelo viejo de QR de un solo uso) quedan como DENTRO, ya que no existía
-- el concepto de salida temporal antes de esta migración.
UPDATE "registrations" SET "estadoAcceso" = 'DENTRO' WHERE "qrEscaneadoEn" IS NOT NULL;
