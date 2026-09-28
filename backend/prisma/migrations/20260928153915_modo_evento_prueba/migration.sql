-- DropIndex
DROP INDEX "registrations_correo_key";

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "esPrueba" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "configuracion_evento" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "modoPrueba" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registrations_correo_esPrueba_key" ON "registrations"("correo", "esPrueba");
