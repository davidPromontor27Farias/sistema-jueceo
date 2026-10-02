-- AlterEnum
ALTER TYPE "EstatusCompetencia" ADD VALUE 'REPECHAJE_DESEMPATE';

-- DropForeignKey
ALTER TABLE "estado_categorias" DROP CONSTRAINT "estado_categorias_turnoPreseleccionActualId_fkey";

-- DropIndex
DROP INDEX "puntuaciones_preseleccion_registrationId_juezId_key";

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "escenarioId" TEXT;

-- AlterTable
ALTER TABLE "estado_categorias" DROP COLUMN "turnoPreseleccionActualId",
DROP COLUMN "turnoPreseleccionCompletadoEn",
DROP COLUMN "turnoPreseleccionIniciadoEn";

-- AlterTable
ALTER TABLE "puntuaciones_preseleccion" ADD COLUMN     "numeroDesempate" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "preseleccionEscenarioId" TEXT,
ADD COLUMN     "preseleccionNumeroDesempate" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "escenarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos_preseleccion_escenario" (
    "id" TEXT NOT NULL,
    "categoria" "Categoria" NOT NULL,
    "escenarioId" TEXT NOT NULL,
    "turnoActualId" TEXT,
    "turnoIniciadoEn" TIMESTAMP(3),
    "turnoCompletadoEn" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turnos_preseleccion_escenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "escenarios_nombre_key" ON "escenarios"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "turnos_preseleccion_escenario_categoria_escenarioId_key" ON "turnos_preseleccion_escenario"("categoria", "escenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "puntuaciones_preseleccion_registrationId_juezId_numeroDesem_key" ON "puntuaciones_preseleccion"("registrationId", "juezId", "numeroDesempate");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_escenarioId_fkey" FOREIGN KEY ("escenarioId") REFERENCES "escenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_preseleccion_escenario" ADD CONSTRAINT "turnos_preseleccion_escenario_escenarioId_fkey" FOREIGN KEY ("escenarioId") REFERENCES "escenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_preseleccion_escenario" ADD CONSTRAINT "turnos_preseleccion_escenario_turnoActualId_fkey" FOREIGN KEY ("turnoActualId") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_preseleccionEscenarioId_fkey" FOREIGN KEY ("preseleccionEscenarioId") REFERENCES "escenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
