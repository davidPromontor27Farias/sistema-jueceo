-- DropIndex
DROP INDEX "puntuaciones_preseleccion_registrationId_juezId_numeroDesem_key";

-- AlterTable
ALTER TABLE "estado_categorias" ADD COLUMN     "preseleccionDosRondas" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "puntuaciones_preseleccion" ADD COLUMN     "rondaPreseleccion" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "puntuaciones_preseleccion_registrationId_juezId_numeroDesem_key" ON "puntuaciones_preseleccion"("registrationId", "juezId", "numeroDesempate", "rondaPreseleccion");
