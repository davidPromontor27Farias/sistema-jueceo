-- AlterEnum
ALTER TYPE "EstatusCompetencia" ADD VALUE 'PRESELECCION';

-- CreateTable
CREATE TABLE "puntuaciones_preseleccion" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "juezId" TEXT NOT NULL,
    "tecnica" INTEGER NOT NULL,
    "ejecucion" INTEGER NOT NULL,
    "vocabulario" INTEGER NOT NULL,
    "musicalidad" INTEGER NOT NULL,
    "originalidad" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "puntuaciones_preseleccion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "puntuaciones_preseleccion_registrationId_juezId_key" ON "puntuaciones_preseleccion"("registrationId", "juezId");

-- AddForeignKey
ALTER TABLE "puntuaciones_preseleccion" ADD CONSTRAINT "puntuaciones_preseleccion_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puntuaciones_preseleccion" ADD CONSTRAINT "puntuaciones_preseleccion_juezId_fkey" FOREIGN KEY ("juezId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
