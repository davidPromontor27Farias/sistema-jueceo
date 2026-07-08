-- CreateEnum
CREATE TYPE "Categoria" AS ENUM ('KIDS_AMATEUR', 'KIDS_BOYS', 'KIDS_GIRL', 'MASTERS_40_PLUS', 'JUVENIL_BOYS', 'JUVENIL_GIRL', 'BGIRLS', 'BBOYS', 'PUBLICO_GENERAL');

-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('MASCULINO', 'FEMENINO');

-- CreateEnum
CREATE TYPE "TipoBoleto" AS ENUM ('GENERAL', 'COMPETIDOR', 'STAFF', 'VIP', 'INVITADO');

-- CreateEnum
CREATE TYPE "EstatusPago" AS ENUM ('PENDIENTE', 'PAGADO', 'FALLIDO', 'REEMBOLSADO');

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "nombreArtistico" TEXT NOT NULL,
    "fechaNacimiento" TIMESTAMP(3) NOT NULL,
    "categoria" "Categoria" NOT NULL,
    "sexo" "Sexo" NOT NULL,
    "estado" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "instagram" TEXT,
    "academia" TEXT,
    "crew" TEXT,
    "contactoEmergencia" TEXT,
    "aceptaReglamento" BOOLEAN NOT NULL DEFAULT false,
    "aceptaAvisoPrivacidad" BOOLEAN NOT NULL DEFAULT false,
    "aceptaUsoImagen" BOOLEAN NOT NULL DEFAULT false,
    "tipoBoleto" "TipoBoleto" NOT NULL,
    "precioMXNCentavos" INTEGER NOT NULL,
    "estatusPago" "EstatusPago" NOT NULL DEFAULT 'PENDIENTE',
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "qrToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registrations_correo_key" ON "registrations"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_stripeSessionId_key" ON "registrations"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_qrToken_key" ON "registrations"("qrToken");
