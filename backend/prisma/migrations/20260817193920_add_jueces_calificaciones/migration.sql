-- AlterEnum
ALTER TYPE "RolAdmin" ADD VALUE 'JUEZ';

-- CreateTable
CREATE TABLE "calificaciones_juez" (
    "id" TEXT NOT NULL,
    "enfrentamientoId" TEXT NOT NULL,
    "juezId" TEXT NOT NULL,
    "tecnicaA" INTEGER NOT NULL,
    "ejecucionA" INTEGER NOT NULL,
    "vocabularioA" INTEGER NOT NULL,
    "musicalidadA" INTEGER NOT NULL,
    "originalidadA" INTEGER NOT NULL,
    "tecnicaB" INTEGER NOT NULL,
    "ejecucionB" INTEGER NOT NULL,
    "vocabularioB" INTEGER NOT NULL,
    "musicalidadB" INTEGER NOT NULL,
    "originalidadB" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calificaciones_juez_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calificaciones_juez_enfrentamientoId_juezId_key" ON "calificaciones_juez"("enfrentamientoId", "juezId");

-- AddForeignKey
ALTER TABLE "calificaciones_juez" ADD CONSTRAINT "calificaciones_juez_enfrentamientoId_fkey" FOREIGN KEY ("enfrentamientoId") REFERENCES "enfrentamientos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificaciones_juez" ADD CONSTRAINT "calificaciones_juez_juezId_fkey" FOREIGN KEY ("juezId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
