-- DropIndex
DROP INDEX "calificaciones_juez_enfrentamientoId_juezId_key";

-- AlterTable
ALTER TABLE "calificaciones_juez" ADD COLUMN     "numeroDesempate" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "enfrentamientos" ADD COLUMN     "numeroDesempate" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "calificaciones_juez_enfrentamientoId_numeroDesempate_juezId_key" ON "calificaciones_juez"("enfrentamientoId", "numeroDesempate", "juezId");
