-- CreateEnum
CREATE TYPE "RolAdmin" AS ENUM ('SUPER_ADMIN', 'STAFF_ACCESO', 'STAFF_JUECEO');

-- CreateEnum
CREATE TYPE "EstatusCompetencia" AS ENUM ('NO_INICIADA', 'EN_CURSO', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "EstatusEnfrentamiento" AS ENUM ('PENDIENTE', 'EN_CURSO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "VistaPantalla" AS ENUM ('APAGADA', 'BRACKETS', 'RESULTADOS', 'ENFRENTAMIENTOS', 'GANADORES');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "RolAdmin" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estado_categorias" (
    "categoria" "Categoria" NOT NULL,
    "estatus" "EstatusCompetencia" NOT NULL DEFAULT 'NO_INICIADA',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estado_categorias_pkey" PRIMARY KEY ("categoria")
);

-- CreateTable
CREATE TABLE "enfrentamientos" (
    "id" TEXT NOT NULL,
    "categoria" "Categoria" NOT NULL,
    "ronda" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "competidorAId" TEXT,
    "competidorBId" TEXT,
    "ganadorId" TEXT,
    "estatus" "EstatusEnfrentamiento" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enfrentamientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pantalla_estado" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "vista" "VistaPantalla" NOT NULL DEFAULT 'APAGADA',
    "categoriaEnfocada" "Categoria",
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pantalla_estado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_correo_key" ON "admin_users"("correo");

-- CreateIndex
CREATE INDEX "enfrentamientos_categoria_idx" ON "enfrentamientos"("categoria");

-- AddForeignKey
ALTER TABLE "enfrentamientos" ADD CONSTRAINT "enfrentamientos_competidorAId_fkey" FOREIGN KEY ("competidorAId") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enfrentamientos" ADD CONSTRAINT "enfrentamientos_competidorBId_fkey" FOREIGN KEY ("competidorBId") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enfrentamientos" ADD CONSTRAINT "enfrentamientos_ganadorId_fkey" FOREIGN KEY ("ganadorId") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
