-- AlterTable
ALTER TABLE "estado_categorias" ADD COLUMN     "turnoPreseleccionActualId" TEXT,
ADD COLUMN     "turnoPreseleccionIniciadoEn" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "estado_categorias" ADD CONSTRAINT "estado_categorias_turnoPreseleccionActualId_fkey" FOREIGN KEY ("turnoPreseleccionActualId") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
